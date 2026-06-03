package com.payzo.backend.service.analyst;

import com.payzo.backend.domain.entity.Client;
import com.payzo.backend.domain.entity.FraudAlert;
import com.payzo.backend.domain.entity.Transaction;
import com.payzo.backend.domain.entity.User;
import com.payzo.backend.domain.enums.AlertStatus;
import com.payzo.backend.domain.enums.AmountBand;
import com.payzo.backend.domain.enums.RiskLevel;
import com.payzo.backend.domain.enums.TransactionStatus;
import com.payzo.backend.domain.enums.UserNotificationType;
import com.payzo.backend.dto.client.ClientProfile;
import com.payzo.backend.dto.response.admin.AuditLogResponse;
import com.payzo.backend.dto.response.analyst.FraudAlertResponse;
import com.payzo.backend.exception.ConflictException;
import com.payzo.backend.exception.ResourceNotFoundException;
import com.payzo.backend.mapper.FraudAlertMapper;
import com.payzo.backend.mapper.UserMapper;
import com.payzo.backend.repository.AuditLogRepository;
import com.payzo.backend.repository.FraudAlertRepository;
import com.payzo.backend.repository.TransactionRepository;
import com.payzo.backend.repository.UserRepository;
import com.payzo.backend.service.audit.AuditService;
import com.payzo.backend.service.client.ClientProfileService;
import com.payzo.backend.service.client.TrustScoreService;
import com.payzo.backend.service.integration.CbsIntegrationService;
import com.payzo.backend.service.notification.InAppNotificationService;
import com.payzo.backend.service.notification.NotificationService;
import com.payzo.backend.util.PeriodUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

/** Fraud-alert queue (D33) with approve / reject decisions that release the transfer to CBS or mark it REJECTED, each one audited. */
@Service
@RequiredArgsConstructor
@Slf4j
public class AlertService {

    private final FraudAlertRepository fraudAlertRepository;
    private final TransactionRepository transactionRepository;
    private final UserRepository userRepository;
    private final AuditLogRepository auditLogRepository;
    private final CbsIntegrationService cbsIntegrationService;
    private final NotificationService notificationService;
    private final InAppNotificationService inAppNotificationService;
    private final AuditService auditService;
    private final TrustScoreService trustScoreService;
    private final ClientProfileService clientProfileService;
    private final FraudAlertMapper fraudAlertMapper;
    private final UserMapper userMapper;

    // ── Listing / detail ──────────────────────────────────────────────────────

    /**
     * Backoffice fraud-alerts list with full filter set (D41 / Impact 10b).
     * All filter params are optional; nulls leave that filter dimension wide open.
     *
     * @param status     AlertStatus to match exactly (PENDING / VALIDATED / REJECTED)
     * @param severity   transaction risk level (HIGH / MEDIUM)
     * @param bankCode   matches either source or destination bank code
     * @param amount     amount band (UNDER_1K, BETWEEN_1K_5K, BETWEEN_5K_10K, OVER_10K)
     * @param period     "today" | "7d" | "30d" | "90d" | "all" — see PeriodUtils
     * @param query     free-text matched against transaction reference and client name/CIN
     */
    @Transactional(readOnly = true)
    public Page<FraudAlertResponse> getAlerts(AlertStatus status,
                                              RiskLevel severity,
                                              String bankCode,
                                              AmountBand amount,
                                              String period,
                                              String query,
                                              Pageable pageable) {
        Specification<FraudAlert> spec = Specification.where(null);

        if (status != null) {
            spec = spec.and((root, cq, cb) -> cb.equal(root.get("status"), status));
        }
        if (severity != null) {
            spec = spec.and((root, cq, cb) ->
                    cb.equal(root.get("transaction").get("riskLevel"), severity));
        }
        if (bankCode != null && !bankCode.isBlank()) {
            String code = bankCode.trim();
            spec = spec.and((root, cq, cb) -> cb.or(
                    cb.equal(root.get("transaction").get("sourceBankCode"), code),
                    cb.equal(root.get("transaction").get("destBankCode"), code)
            ));
        }
        if (amount != null) {
            spec = spec.and((root, cq, cb) -> {
                jakarta.persistence.criteria.Path<java.math.BigDecimal> amt =
                        root.get("transaction").get("amount");
                jakarta.persistence.criteria.Predicate p = cb.conjunction();
                if (amount.min() != null) p = cb.and(p, cb.greaterThanOrEqualTo(amt, amount.min()));
                if (amount.max() != null) p = cb.and(p, cb.lessThan(amt, amount.max()));
                return p;
            });
        }
        if (period != null && !period.isBlank()) {
            OffsetDateTime start = PeriodUtils.parsePeriodStart(period);
            if (start != null) {
                spec = spec.and((root, cq, cb) ->
                        cb.greaterThanOrEqualTo(root.get("createdAt"), start));
            }
        }
        if (query != null && !query.isBlank()) {
            String pattern = "%" + query.toLowerCase() + "%";
            // Wide-search — same policy as TransactionService. Analysts
            // pivot from a reason / amount / phone they got from a client
            // support call; restricting to ref + CIN + name made the
            // search useless for any other entry point.
            spec = spec.and((root, cq, cb) -> cb.or(
                    cb.like(cb.lower(root.get("transaction").get("reference")), pattern),
                    cb.like(cb.lower(root.get("transaction").get("motif").as(String.class)), pattern),
                    cb.like(cb.lower(root.get("transaction").get("sourceAccountNumber")), pattern),
                    cb.like(cb.lower(root.get("transaction").get("destinationAccountNumber")), pattern),
                    cb.like(cb.lower(root.get("transaction").get("sourceBankCode")), pattern),
                    cb.like(cb.lower(root.get("transaction").get("destBankCode")), pattern),
                    cb.like(cb.lower(root.get("transaction").get("destClientCin").as(String.class)), pattern),
                    cb.like(cb.lower(root.get("transaction").get("client").get("cin")), pattern),
                    cb.like(cb.lower(root.get("transaction").get("client").get("firstName")), pattern),
                    cb.like(cb.lower(root.get("transaction").get("client").get("lastName")), pattern),
                    cb.like(cb.lower(root.get("transaction").get("client").get("username").as(String.class)), pattern),
                    cb.like(cb.lower(root.get("transaction").get("client").get("email").as(String.class)), pattern),
                    cb.like(cb.lower(root.get("transaction").get("client").get("phone").as(String.class)), pattern),
                    cb.like(cb.lower(root.get("id").as(String.class)), pattern),
                    cb.like(cb.lower(root.get("transaction").get("id").as(String.class)), pattern)
            ));
        }

        return fraudAlertRepository.findAll(spec, pageable)
                .map(fraudAlertMapper::toFraudAlertResponse);
    }

    @Transactional(readOnly = true)
    public FraudAlertResponse getAlertDetail(UUID alertId) {
        return fraudAlertMapper.toFraudAlertResponse(loadPendingOrFinal(alertId));
    }

    // ── Approve / Reject / Cancel ──────────────────────────────────────────────

    /** Analyst says "not fraud" — execute the suspended transfer in CBS. */
    @Transactional
    public void approveAlert(UUID alertId, String comment, UUID analystId) {
        FraudAlert alert = loadPending(alertId);
        User analyst = userRepository.findById(analystId)
                .orElseThrow(() -> new ResourceNotFoundException("Analyst not found: " + analystId));

        Transaction tx = alert.getTransaction();

        cbsIntegrationService.executeTransfer(
                tx.getSourceAccountNumber(), tx.getDestinationAccountNumber(),
                tx.getAmount(), tx.getReference());

        tx.setStatus(TransactionStatus.APPROVED);
        tx.setExecutedAt(OffsetDateTime.now());
        transactionRepository.save(tx);

        int delta = TrustScoreService.deltaForAlertOutcome(tx.getRiskLevel(), false);
        applyAndPersistOutcome(alert, analyst, AlertStatus.VALIDATED, comment, delta);
        trustScoreService.onAlertOutcome(tx.getDestClientCin(), tx.getRiskLevel(), false, tx.getId());

        notifySender(tx, "TRX_APPROVED", "Transfer approved",
                "Your transfer " + tx.getReference() + " has been approved after review.",
                "TRANSFER_APPROVED",
                Map.of("reference", tx.getReference(), "amount", tx.getAmount()));

        auditService.writeLog(analystId, "ANALYST", "ALERT_APPROVED",
                "FRAUD_ALERT", alert.getId(), comment);

        log.info("Alert approved: alertId={}, txRef={}, trustDelta={}", alertId, tx.getReference(), delta);
    }

    /** Analyst confirms fraud — keep the transfer rejected, no CBS call. */
    @Transactional
    public void rejectAlert(UUID alertId, String comment, UUID analystId) {
        if (comment == null || comment.isBlank()) {
            throw new ConflictException("A comment is required when rejecting", "COMMENT_REQUIRED");
        }
        FraudAlert alert = loadPending(alertId);
        User analyst = userRepository.findById(analystId)
                .orElseThrow(() -> new ResourceNotFoundException("Analyst not found: " + analystId));

        Transaction tx = alert.getTransaction();
        tx.setStatus(TransactionStatus.REJECTED);
        transactionRepository.save(tx);

        int delta = TrustScoreService.deltaForAlertOutcome(tx.getRiskLevel(), true);
        applyAndPersistOutcome(alert, analyst, AlertStatus.REJECTED, comment, delta);
        trustScoreService.onAlertOutcome(tx.getDestClientCin(), tx.getRiskLevel(), true, tx.getId());

        notifySender(tx, "TRX_REJECTED", "Transfer rejected",
                "Your transfer " + tx.getReference() + " has been rejected: " + comment,
                "TRANSFER_REJECTED",
                Map.of("reference", tx.getReference(), "reason", comment));

        auditService.writeLog(analystId, "ANALYST", "ALERT_REJECTED",
                "FRAUD_ALERT", alert.getId(), comment);

        log.info("Alert rejected: alertId={}, txRef={}, trustDelta={}", alertId, tx.getReference(), delta);
    }

    /**
     * SuperAdmin override — releases a pending alert without an analyst decision and
     * marks the underlying transaction as CANCELLED (the safe default: the sender's
     * money is never debited because the CBS transfer was never executed). CANCELLED
     * is the right status here rather than REJECTED — there's no fraud verdict, just
     * an SA-initiated abort — so the FE renders the neutral cancelled pill, not the
     * red rejected one.
     *
     * No trust-score delta is applied because no fraud verdict was reached.
     */
    @Transactional
    public void cancelPending(UUID alertId, UUID superAdminId, String reason) {
        FraudAlert alert = loadPending(alertId);
        User actor = userRepository.findById(superAdminId)
                .orElseThrow(() -> new ResourceNotFoundException("Actor not found: " + superAdminId));

        Transaction tx = alert.getTransaction();
        tx.setStatus(TransactionStatus.CANCELLED);
        transactionRepository.save(tx);

        alert.setAnalyst(actor);
        alert.setStatus(AlertStatus.CANCELLED);
        alert.setAnalystComment(reason != null && !reason.isBlank()
                ? reason : "Cancelled by SuperAdmin");
        alert.setTrustDelta(0);
        alert.setDecidedAt(OffsetDateTime.now());
        fraudAlertRepository.save(alert);

        Client client = tx.getClient();
        inAppNotificationService.create(client.getId(), "Transfer cancelled",
                "Your transfer " + tx.getReference() + " was cancelled by an administrator.",
                UserNotificationType.TRX_REJECTED);

        auditService.writeLog(superAdminId, "SUPERADMIN", "ALERT_CANCELLED",
                "FRAUD_ALERT", alert.getId(), reason);

        log.info("Alert cancelled by SuperAdmin: alertId={}, txRef={}", alertId, tx.getReference());
    }

    // ── Audit history ──────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public Page<AuditLogResponse> getDecisionHistory(UUID analystId, Pageable pageable) {
        return auditLogRepository.findByActorIdOrderByCreatedAtDesc(analystId, pageable)
                .map(userMapper::toAuditLogResponse);
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    private FraudAlert loadPending(UUID alertId) {
        FraudAlert alert = loadPendingOrFinal(alertId);
        if (alert.getStatus() != AlertStatus.PENDING) {
            throw new ConflictException("Alert is not in PENDING status", "INVALID_STATUS");
        }
        return alert;
    }

    private FraudAlert loadPendingOrFinal(UUID alertId) {
        return fraudAlertRepository.findById(alertId)
                .orElseThrow(() -> new ResourceNotFoundException("Alert not found: " + alertId));
    }

    private void applyAndPersistOutcome(FraudAlert alert,
                                        User analyst,
                                        AlertStatus newStatus,
                                        String comment,
                                        int trustDelta) {
        alert.setAnalyst(analyst);
        alert.setStatus(newStatus);
        alert.setAnalystComment(comment);
        alert.setTrustDelta(trustDelta);
        alert.setDecidedAt(OffsetDateTime.now());
        fraudAlertRepository.save(alert);
    }

    private void notifySender(Transaction tx,
                              String inAppType, String inAppTitle, String inAppMessage,
                              String emailTemplate, Map<String, Object> emailModel) {
        Client client = tx.getClient();
        inAppNotificationService.create(client.getId(), inAppTitle, inAppMessage,
                UserNotificationType.valueOf(inAppType));
        ClientProfile profile = clientProfileService.forClient(client);
        notificationService.send(emailTemplate, profile.email(), profile.phone(), emailModel);
    }
}
