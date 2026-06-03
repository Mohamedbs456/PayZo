package com.payzo.backend.service.admin;

import com.payzo.backend.domain.entity.Client;
import com.payzo.backend.domain.entity.FraudAlert;
import com.payzo.backend.domain.entity.MlModelConfig;
import com.payzo.backend.domain.entity.Transaction;
import com.payzo.backend.domain.enums.AmountBand;
import com.payzo.backend.domain.enums.RiskLevel;
import com.payzo.backend.domain.enums.TransactionStatus;
import com.payzo.backend.dto.response.admin.TransactionDetailResponse;
import com.payzo.backend.dto.response.admin.TransactionListItemResponse;
import com.payzo.backend.exception.ResourceNotFoundException;
import com.payzo.backend.repository.ClientRepository;
import com.payzo.backend.repository.FraudAlertRepository;
import com.payzo.backend.repository.MlModelConfigRepository;
import com.payzo.backend.repository.TransactionRepository;
import com.payzo.backend.service.integration.CbsIntegrationService;
import com.payzo.backend.service.integration.CbsIntegrationService.CbsClientData;
import com.payzo.backend.util.PeriodUtils;
import jakarta.persistence.criteria.Path;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Backoffice transactions API. Powers the new top-level /api/v1/transactions
 * endpoints (Impact 9c, 25, D40, D41) — list with rich filters, detail by id,
 * deep-link by reference.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TransactionService {

    private final TransactionRepository transactionRepository;
    private final FraudAlertRepository fraudAlertRepository;
    private final MlModelConfigRepository mlModelConfigRepository;
    private final ClientRepository clientRepository;
    private final CbsIntegrationService cbsIntegrationService;

    // ── Listing ───────────────────────────────────────────────────────────────

    /**
     * Paginated transactions list. All filters optional.
     *
     * @param status   exact match on TransactionStatus
     * @param risk     exact match on RiskLevel (null risk transactions are excluded)
     * @param bankCode matches either source or destination bank
     * @param amount   AmountBand (UNDER_1K, BETWEEN_1K_5K, BETWEEN_5K_10K, OVER_10K)
     * @param period   "today" | "7d" | "30d" | "90d" | "all" — see PeriodUtils
     * @param ref      exact reference match — supports the deep-link pattern from
     *                 a fraud alert ({@code ?ref=TRX-XXX} returns the one row)
     * @param query    fuzzy match against reference, client name/CIN
     */
    @Transactional(readOnly = true)
    public Page<TransactionListItemResponse> list(TransactionStatus status,
                                                  RiskLevel risk,
                                                  String bankCode,
                                                  AmountBand amount,
                                                  String period,
                                                  String ref,
                                                  String query,
                                                  Pageable pageable) {
        Specification<Transaction> spec = Specification.where(null);

        if (status != null) {
            spec = spec.and((root, cq, cb) -> cb.equal(root.get("status"), status));
        }
        if (risk != null) {
            spec = spec.and((root, cq, cb) -> cb.equal(root.get("riskLevel"), risk));
        }
        if (bankCode != null && !bankCode.isBlank()) {
            String code = bankCode.trim();
            spec = spec.and((root, cq, cb) -> cb.or(
                    cb.equal(root.get("sourceBankCode"), code),
                    cb.equal(root.get("destBankCode"), code)
            ));
        }
        if (amount != null) {
            spec = spec.and((root, cq, cb) -> {
                Path<BigDecimal> amt = root.get("amount");
                Predicate p = cb.conjunction();
                if (amount.min() != null) p = cb.and(p, cb.greaterThanOrEqualTo(amt, amount.min()));
                if (amount.max() != null) p = cb.and(p, cb.lessThan(amt, amount.max()));
                return p;
            });
        }
        if (period != null && !period.isBlank()) {
            OffsetDateTime start = PeriodUtils.parsePeriodStart(period);
            if (start != null) {
                spec = spec.and((root, cq, cb) -> cb.greaterThanOrEqualTo(root.get("createdAt"), start));
            }
        }
        if (ref != null && !ref.isBlank()) {
            String r = ref.trim();
            spec = spec.and((root, cq, cb) -> cb.equal(root.get("reference"), r));
        }
        if (query != null && !query.isBlank()) {
            String pattern = "%" + query.toLowerCase() + "%";
            // Wide-search policy — anything the admin / analyst can see
            // on the row should be findable. Adds:
            //   - motif (free-text reason from the sender)
            //   - source / destination account numbers and bank codes
            //   - the sender's username / email / phone (cached on
            //     {@code Client} since Batch 9)
            //   - the destination client CIN (snapshotted on tx)
            //   - the tx UUID itself (cast to text for LIKE)
            spec = spec.and((root, cq, cb) -> cb.or(
                    cb.like(cb.lower(root.get("reference")), pattern),
                    cb.like(cb.lower(root.get("motif").as(String.class)), pattern),
                    cb.like(cb.lower(root.get("sourceAccountNumber")), pattern),
                    cb.like(cb.lower(root.get("destinationAccountNumber")), pattern),
                    cb.like(cb.lower(root.get("sourceBankCode")), pattern),
                    cb.like(cb.lower(root.get("destBankCode")), pattern),
                    cb.like(cb.lower(root.get("destClientCin").as(String.class)), pattern),
                    cb.like(cb.lower(root.get("client").get("cin")), pattern),
                    cb.like(cb.lower(root.get("client").get("firstName")), pattern),
                    cb.like(cb.lower(root.get("client").get("lastName")), pattern),
                    cb.like(cb.lower(root.get("client").get("username").as(String.class)), pattern),
                    cb.like(cb.lower(root.get("client").get("email").as(String.class)), pattern),
                    cb.like(cb.lower(root.get("client").get("phone").as(String.class)), pattern),
                    cb.like(cb.lower(root.get("id").as(String.class)), pattern)
            ));
        }

        return transactionRepository.findAll(spec, pageable).map(this::toListItem);
    }

    // ── Detail ────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public TransactionDetailResponse getDetail(UUID id) {
        Transaction tx = transactionRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Transaction not found: " + id));
        return buildDetail(tx);
    }

    @Transactional(readOnly = true)
    public TransactionDetailResponse getDetailByReference(String reference) {
        Transaction tx = transactionRepository.findByReference(reference)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Transaction not found: " + reference));
        return buildDetail(tx);
    }

    // ── Mapping ───────────────────────────────────────────────────────────────

    private TransactionListItemResponse toListItem(Transaction tx) {
        Client sender = tx.getClient();
        String partyName = resolveDestinationName(tx);
        return TransactionListItemResponse.builder()
                .id(tx.getId())
                .reference(tx.getReference())
                .clientCin(sender.getCin())
                .clientName(sender.getFirstName() + " " + sender.getLastName())
                .sourceBankCode(tx.getSourceBankCode())
                .party(partyName)
                .destAccountNumber(tx.getDestinationAccountNumber())
                .destBankCode(tx.getDestBankCode())
                .amount(tx.getAmount())
                .status(tx.getStatus())
                .riskLevel(tx.getRiskLevel())
                .createdAt(tx.getCreatedAt())
                .build();
    }

    private TransactionDetailResponse buildDetail(Transaction tx) {
        FraudAlert alert = fraudAlertRepository.findAll((root, cq, cb) ->
                        cb.equal(root.get("transaction").get("id"), tx.getId()))
                .stream().findFirst().orElse(null);

        Optional<MlModelConfig> mlConfig = mlModelConfigRepository.findFirstBy();

        return TransactionDetailResponse.builder()
                .id(tx.getId())
                .reference(tx.getReference())
                .status(tx.getStatus())
                .amount(tx.getAmount())
                .motif(tx.getMotif())
                .from(buildFromParty(tx))
                .to(buildToParty(tx))
                .timeline(TransactionDetailResponse.Timeline.builder()
                        .createdAt(tx.getCreatedAt())
                        .otpConfirmedAt(tx.getOtpConfirmedAt())
                        .decidedAt(alert != null ? alert.getDecidedAt() : null)
                        .settledAt(tx.getExecutedAt())
                        .build())
                .ml(TransactionDetailResponse.Ml.builder()
                        .score(tx.getRiskScore())
                        .level(tx.getRiskLevel())
                        .activeLayer(mlConfig.map(MlModelConfig::getActiveLayer).orElse(null))
                        .reasons(alert != null && alert.getMlReasons() != null
                                ? alert.getMlReasons() : Collections.emptyList())
                        .trustDelta(alert != null ? alert.getTrustDelta() : null)
                        .build())
                .build();
    }

    private TransactionDetailResponse.Party buildFromParty(Transaction tx) {
        Client sender = tx.getClient();
        return TransactionDetailResponse.Party.builder()
                .name(sender.getFirstName() + " " + sender.getLastName())
                .username(sender.getUsername())
                .accountNumber(tx.getSourceAccountNumber())
                .bankCode(tx.getSourceBankCode())
                .build();
    }

    private TransactionDetailResponse.Party buildToParty(Transaction tx) {
        // Prefer PayZo identity when the receiver is a registered client.
        if (tx.getDestClientCin() != null) {
            Optional<Client> receiver = clientRepository.findByCin(tx.getDestClientCin());
            if (receiver.isPresent()) {
                Client r = receiver.get();
                return TransactionDetailResponse.Party.builder()
                        .name(r.getFirstName() + " " + r.getLastName())
                        .username(r.getUsername())
                        .accountNumber(tx.getDestinationAccountNumber())
                        .bankCode(tx.getDestBankCode())
                        .build();
            }
            // Fall back to CBS lookup so the UI still has a name to show.
            try {
                CbsClientData cbs = cbsIntegrationService.getClientByCin(tx.getDestClientCin());
                return TransactionDetailResponse.Party.builder()
                        .name(cbs.firstName() + " " + cbs.lastName())
                        .username(null)
                        .accountNumber(tx.getDestinationAccountNumber())
                        .bankCode(tx.getDestBankCode())
                        .build();
            } catch (Exception ignored) { /* fall through */ }
        }
        // No CIN, no name — just account info.
        return TransactionDetailResponse.Party.builder()
                .name(null)
                .username(null)
                .accountNumber(tx.getDestinationAccountNumber())
                .bankCode(tx.getDestBankCode())
                .build();
    }

    /**
     * List rows look up PayZo clients only — never CBS — to keep the listing cheap
     * (no N+1 to a remote system). Detail view performs the CBS fallback if needed.
     */
    private String resolveDestinationName(Transaction tx) {
        if (tx.getDestClientCin() == null) return null;
        return clientRepository.findByCin(tx.getDestClientCin())
                .map(r -> r.getFirstName() + " " + r.getLastName())
                .orElse(null);
    }
}
