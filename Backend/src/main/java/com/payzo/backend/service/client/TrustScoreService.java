package com.payzo.backend.service.client;

import com.payzo.backend.domain.entity.Client;
import com.payzo.backend.domain.enums.RiskLevel;
import com.payzo.backend.repository.ClientRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * Centralizes the trust-score deltas defined in DECISIONS.md D38 (Impact 6).
 *
 * Deltas (receiver-side only; the sender's score is never changed):
 *
 *   LOW  auto-approved (no analyst involvement) → +1
 *   MED  alert approved (analyst said NOT fraud) → −1
 *   HIGH alert approved (analyst said NOT fraud) → −5
 *   MED  alert rejected (analyst confirmed fraud) → −3
 *   HIGH alert rejected (analyst confirmed fraud) → −10
 *
 * All deltas clamp the resulting score to [0, 100] (handled inside
 * {@link Client#adjustTrustScore(int)}). The receiver may be unknown when the
 * destination account belongs to a CBS-only client never registered in PayZo —
 * in that case all entry points are no-ops.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TrustScoreService {

    private final ClientRepository clientRepository;

    /**
     * Apply a literal delta to a client. Most callers should prefer the higher-level
     * {@link #onLowAutoApproved(String, UUID)} / {@link #onAlertOutcome} methods so the
     * D38 numbers stay in one place; this method is exposed for tests and ad-hoc
     * adjustments (e.g. a future SuperAdmin "manually correct" endpoint).
     *
     * @param client the receiver
     * @param delta  signed integer; clamped result is stored
     * @param reason short human-readable label, logged at INFO
     * @param transactionId optional — included in the log line for traceability
     * @return the receiver's new score after clamping
     */
    @Transactional
    public int applyDelta(Client client, int delta, String reason, UUID transactionId) {
        int before = client.getTrustScore();
        client.adjustTrustScore(delta);
        clientRepository.save(client);
        log.info("Trust score change: clientId={}, txId={}, before={}, delta={}, after={}, reason={}",
                client.getId(), transactionId, before, delta, client.getTrustScore(), reason);
        return client.getTrustScore();
    }

    /** Receiver of a LOW-risk auto-approved transfer earns +1. */
    @Transactional
    public void onLowAutoApproved(String receiverCin, UUID transactionId) {
        if (receiverCin == null) return;
        clientRepository.findByCin(receiverCin).ifPresent(receiver ->
                applyDelta(receiver, +1, "LOW_AUTO_APPROVED", transactionId));
    }

    /**
     * Apply the right delta after an analyst makes a decision on a MED/HIGH alert.
     *
     * @param wasFraud true when the analyst rejected the transfer (= confirmed fraud);
     *                 false when they approved it (= not fraud)
     */
    @Transactional
    public void onAlertOutcome(String receiverCin, RiskLevel risk, boolean wasFraud,
                               UUID transactionId) {
        if (receiverCin == null) return;
        int delta = deltaFor(risk, wasFraud);
        String reason = (wasFraud ? "ALERT_REJECTED_" : "ALERT_APPROVED_") + risk;
        clientRepository.findByCin(receiverCin).ifPresent(receiver ->
                applyDelta(receiver, delta, reason, transactionId));
    }

    private static int deltaFor(RiskLevel risk, boolean wasFraud) {
        return deltaForAlertOutcome(risk, wasFraud);
    }

    /**
     * Pure mapping (RiskLevel, wasFraud) → signed delta per D38. Exposed as a static
     * helper so callers (e.g. {@link com.payzo.backend.service.analyst.AlertService})
     * can persist the intended delta on the FraudAlert row even when the receiver is
     * not a PayZo client (and so {@link #onAlertOutcome} is a no-op). LOW transactions
     * never reach an analyst, so RiskLevel.LOW falls back to MED treatment defensively.
     */
    public static int deltaForAlertOutcome(RiskLevel risk, boolean wasFraud) {
        if (risk == RiskLevel.HIGH) return wasFraud ? -10 : -5;
        return wasFraud ? -3 : -1;
    }

    /** Constant +1 — exposed for symmetry with {@link #deltaForAlertOutcome}. */
    public static int deltaForLowAutoApproved() {
        return +1;
    }
}
