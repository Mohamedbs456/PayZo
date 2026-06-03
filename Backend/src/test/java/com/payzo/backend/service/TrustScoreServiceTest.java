package com.payzo.backend.service;

import com.payzo.backend.domain.entity.Client;
import com.payzo.backend.domain.enums.RiskLevel;
import com.payzo.backend.repository.ClientRepository;
import com.payzo.backend.service.client.TrustScoreService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class TrustScoreServiceTest {

    @Mock private ClientRepository clientRepository;

    @InjectMocks
    private TrustScoreService trustScoreService;

    private static final String CIN = "12345678";
    private static final UUID TX_ID = UUID.randomUUID();

    // ── D38 happy-path deltas ──────────────────────────────────────────────────

    @Test
    void onLowAutoApproved_appliesPlusOne() {
        Client receiver = clientWithScore(50);
        when(clientRepository.findByCin(CIN)).thenReturn(Optional.of(receiver));

        trustScoreService.onLowAutoApproved(CIN, TX_ID);

        assertThat(receiver.getTrustScore()).isEqualTo(51);
        verify(clientRepository).save(receiver);
    }

    @Test
    void onAlertOutcome_appliesMinusOne_whenMedAndNotFraud() {
        Client receiver = clientWithScore(50);
        when(clientRepository.findByCin(CIN)).thenReturn(Optional.of(receiver));

        trustScoreService.onAlertOutcome(CIN, RiskLevel.MEDIUM, false, TX_ID);

        assertThat(receiver.getTrustScore()).isEqualTo(49);
    }

    @Test
    void onAlertOutcome_appliesMinusFive_whenHighAndNotFraud() {
        Client receiver = clientWithScore(50);
        when(clientRepository.findByCin(CIN)).thenReturn(Optional.of(receiver));

        trustScoreService.onAlertOutcome(CIN, RiskLevel.HIGH, false, TX_ID);

        assertThat(receiver.getTrustScore()).isEqualTo(45);
    }

    @Test
    void onAlertOutcome_appliesMinusThree_whenMedAndConfirmedFraud() {
        Client receiver = clientWithScore(50);
        when(clientRepository.findByCin(CIN)).thenReturn(Optional.of(receiver));

        trustScoreService.onAlertOutcome(CIN, RiskLevel.MEDIUM, true, TX_ID);

        assertThat(receiver.getTrustScore()).isEqualTo(47);
    }

    @Test
    void onAlertOutcome_appliesMinusTen_whenHighAndConfirmedFraud() {
        Client receiver = clientWithScore(50);
        when(clientRepository.findByCin(CIN)).thenReturn(Optional.of(receiver));

        trustScoreService.onAlertOutcome(CIN, RiskLevel.HIGH, true, TX_ID);

        assertThat(receiver.getTrustScore()).isEqualTo(40);
    }

    // ── clamping ───────────────────────────────────────────────────────────────

    @Test
    void onLowAutoApproved_clampsAt100() {
        Client receiver = clientWithScore(100);
        when(clientRepository.findByCin(CIN)).thenReturn(Optional.of(receiver));

        trustScoreService.onLowAutoApproved(CIN, TX_ID);

        assertThat(receiver.getTrustScore()).isEqualTo(100);
    }

    @Test
    void onAlertOutcome_clampsAtZero_whenDeltaWouldGoNegative() {
        Client receiver = clientWithScore(5);
        when(clientRepository.findByCin(CIN)).thenReturn(Optional.of(receiver));

        trustScoreService.onAlertOutcome(CIN, RiskLevel.HIGH, true, TX_ID);

        assertThat(receiver.getTrustScore()).isEqualTo(0);
    }

    // ── no-ops ────────────────────────────────────────────────────────────────

    @Test
    void onLowAutoApproved_isNoOp_whenReceiverCinIsNull() {
        trustScoreService.onLowAutoApproved(null, TX_ID);

        verifyNoInteractions(clientRepository);
    }

    @Test
    void onAlertOutcome_isNoOp_whenReceiverCinIsNull() {
        trustScoreService.onAlertOutcome(null, RiskLevel.HIGH, true, TX_ID);

        verifyNoInteractions(clientRepository);
    }

    @Test
    void onLowAutoApproved_isNoOp_whenReceiverNotInPayZo() {
        when(clientRepository.findByCin(CIN)).thenReturn(Optional.empty());

        trustScoreService.onLowAutoApproved(CIN, TX_ID);

        verify(clientRepository, never()).save(any());
    }

    // ── applyDelta direct ──────────────────────────────────────────────────────

    @Test
    void applyDelta_returnsClampedScore_andLogsViaSave() {
        Client receiver = clientWithScore(50);

        int newScore = trustScoreService.applyDelta(receiver, +25, "manual_correction", TX_ID);

        assertThat(newScore).isEqualTo(75);
        ArgumentCaptor<Client> captor = ArgumentCaptor.forClass(Client.class);
        verify(clientRepository).save(captor.capture());
        assertThat(captor.getValue().getTrustScore()).isEqualTo(75);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private Client clientWithScore(int score) {
        Client c = new Client();
        c.setId(UUID.randomUUID());
        c.setCin(CIN);
        c.setTrustScore(score);
        return c;
    }
}
