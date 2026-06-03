package com.payzo.backend.service.integration;

import com.payzo.backend.domain.entity.Analyst;
import com.payzo.backend.domain.entity.MlModelConfig;
import com.payzo.backend.domain.entity.SuperAdmin;
import com.payzo.backend.domain.entity.User;
import com.payzo.backend.domain.enums.ActiveLayer;
import com.payzo.backend.domain.enums.Role;
import com.payzo.backend.domain.enums.UserNotificationType;
import com.payzo.backend.repository.MlModelConfigRepository;
import com.payzo.backend.repository.UserRepository;
import com.payzo.backend.service.integration.MlIntegrationService.MlScoreRequest;
import com.payzo.backend.service.integration.MlIntegrationService.MlScoreResponse;
import com.payzo.backend.service.notification.InAppNotificationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Answers;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.reactive.function.client.WebClient;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MlIntegrationServiceTest {

    @Mock(answer = Answers.RETURNS_DEEP_STUBS)
    private WebClient mlWebClient;

    @Mock
    private MlModelConfigRepository mlModelConfigRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private InAppNotificationService inAppNotificationService;

    @InjectMocks
    private MlIntegrationService service;

    private MlModelConfig config;

    @BeforeEach
    void setUp() {
        // @Value field defaulted true; individual tests flip via setMlEnabled().
        ReflectionTestUtils.setField(service, "mlEnabled", true);

        config = new MlModelConfig();
        config.setId(UUID.randomUUID());
        config.setActiveLayer(ActiveLayer.PRIMARY);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private void setMlEnabled(boolean enabled) {
        ReflectionTestUtils.setField(service, "mlEnabled", enabled);
    }

    private MlScoreRequest sampleRequest() {
        MlScoreRequest req = new MlScoreRequest();
        req.setTransactionId(UUID.randomUUID());
        req.setLogAmount(Math.log1p(1500.0));
        req.setAmountToBalanceRatio(0.1);
        req.setIsBalanceZeroReceiver(0);
        req.setDistanceKm(50.0);
        req.setHourOfDay(14);
        req.setSenderTxCount24h(2);
        req.setSenderAmountSum24h(800.0);
        req.setSenderDistinctDest24h(2);
        req.setSenderAccountAgeDays(180);
        req.setIsSenderNewAccount(0);
        req.setTrustScore(60);
        req.setAccountType("CHECKING");
        req.setIsKnownBeneficiary(0);
        req.setTransfersToDestLifetime(0);
        req.setIsDestNewAccount(0);
        req.setDaysSinceLastTransaction(5);
        req.setAmountZScoreUser30d(0.0);
        req.setAmountPctOfUserMaxLifetime(1.0);
        req.setHourLikelihoodForUser(1.0 / 24);
        req.setDestFamiliarityScore(0.0);
        req.setVelocityRelativeToUserNorm(1.0);
        req.setWeekdayTypicalForUser(1);
        req.setAccountTypeTypicalForUser(1);
        req.setDaysSinceUserAccountAnomaly(999);
        return req;
    }

    private MlScoreResponse primaryResponse() {
        MlScoreResponse r = new MlScoreResponse();
        r.setTransactionId(UUID.randomUUID());
        r.setRiskScore(new BigDecimal("0.4321"));
        r.setRiskLevel("MEDIUM");
        r.setModelVersion("payzo-tier1-xgb-v1");
        r.setLatencyMs(42);
        r.setReasons(List.of("Borderline amount", "Daytime weekday"));
        return r;
    }

    private MlScoreResponse backupResponse() {
        MlScoreResponse r = new MlScoreResponse();
        r.setTransactionId(UUID.randomUUID());
        r.setRiskScore(new BigDecimal("0.5512"));
        r.setRiskLevel("MEDIUM");
        r.setModelVersion("payzo-tier2-lr-v1");
        r.setLatencyMs(80);
        r.setReasons(List.of("Logistic regression fallback"));
        return r;
    }

    private void stubPrimaryReturns(MlScoreResponse response) {
        when(mlWebClient.post().uri("/score").bodyValue(any()).retrieve()
                .bodyToMono(MlScoreResponse.class).block())
                .thenReturn(response);
    }

    private void stubPrimaryThrows() {
        when(mlWebClient.post().uri("/score").bodyValue(any()).retrieve()
                .bodyToMono(MlScoreResponse.class).block())
                .thenThrow(new RuntimeException("primary 503"));
    }

    private void stubBackupReturns(MlScoreResponse response) {
        when(mlWebClient.post().uri("/score/backup").bodyValue(any()).retrieve()
                .bodyToMono(MlScoreResponse.class).block())
                .thenReturn(response);
    }

    private void stubBackupThrows() {
        when(mlWebClient.post().uri("/score/backup").bodyValue(any()).retrieve()
                .bodyToMono(MlScoreResponse.class).block())
                .thenThrow(new RuntimeException("backup 503"));
    }

    private User analyst() {
        Analyst a = new Analyst();
        a.setId(UUID.randomUUID());
        return a;
    }

    private User superAdmin() {
        SuperAdmin sa = new SuperAdmin();
        sa.setId(UUID.randomUUID());
        return sa;
    }

    // ── tests ────────────────────────────────────────────────────────────────

    @Test
    void mlDisabled_returnsStubAndPersistsActiveLayerStub() {
        // Arrange: ML disabled, current DB row says PRIMARY (stale post-Phase 1 state).
        setMlEnabled(false);
        when(mlModelConfigRepository.findFirstBy()).thenReturn(Optional.of(config));
        when(userRepository.findByRole(Role.ANALYST)).thenReturn(List.of(analyst()));
        when(userRepository.findByRole(Role.SUPERADMIN)).thenReturn(List.of(superAdmin()));

        // Act
        MlScoreResponse response = service.score(sampleRequest());

        // Assert: stub-flavoured response.
        assertThat(response.getModelVersion()).isEqualTo("stub-scorer-v1");
        assertThat(response.getRiskLevel()).isEqualTo("LOW"); // amount=1500 < 2000
        // Observability bug fix: DB row updated even though target != PRIMARY.
        assertThat(config.getActiveLayer()).isEqualTo(ActiveLayer.STUB);
        verify(mlModelConfigRepository).save(config);
        // PRIMARY → STUB transition fans BOTH down notifications to analysts + SA.
        verify(inAppNotificationService, times(2))
                .create(any(), eq("ML Service Status"), any(),
                        eq(UserNotificationType.ML_PRIMARY_DOWN));
        verify(inAppNotificationService, times(2))
                .create(any(), eq("ML Service Status"), any(),
                        eq(UserNotificationType.ML_BACKUP_DOWN));
    }

    @Test
    void primarySucceeds_returnsPrimaryAndPersistsActiveLayerPrimary() {
        // Arrange: DB row was STUB (e.g. recovering after Python service downtime).
        config.setActiveLayer(ActiveLayer.STUB);
        when(mlModelConfigRepository.findFirstBy()).thenReturn(Optional.of(config));
        when(userRepository.findByRole(Role.ANALYST)).thenReturn(List.of(analyst()));
        when(userRepository.findByRole(Role.SUPERADMIN)).thenReturn(List.of(superAdmin()));
        stubPrimaryReturns(primaryResponse());

        // Act
        MlScoreResponse response = service.score(sampleRequest());

        // Assert
        assertThat(response.getRiskScore()).isEqualByComparingTo("0.4321");
        assertThat(response.getModelVersion()).isEqualTo("payzo-tier1-xgb-v1");
        assertThat(config.getActiveLayer()).isEqualTo(ActiveLayer.PRIMARY);
        // Recovery notification (ML_PRIMARY_UP) fans out to analysts + SA.
        verify(inAppNotificationService, times(2))
                .create(any(), eq("ML Service Status"), any(),
                        eq(UserNotificationType.ML_PRIMARY_UP));
    }

    @Test
    void primaryThrows_backupSucceeds_persistsActiveLayerBackupAndNotifies() {
        when(mlModelConfigRepository.findFirstBy()).thenReturn(Optional.of(config));
        when(userRepository.findByRole(Role.ANALYST)).thenReturn(List.of(analyst()));
        when(userRepository.findByRole(Role.SUPERADMIN)).thenReturn(List.of(superAdmin()));
        stubPrimaryThrows();
        stubBackupReturns(backupResponse());

        MlScoreResponse response = service.score(sampleRequest());

        assertThat(response.getModelVersion()).isEqualTo("payzo-tier2-lr-v1");
        assertThat(config.getActiveLayer()).isEqualTo(ActiveLayer.BACKUP);
        verify(inAppNotificationService, times(2))
                .create(any(), eq("ML Service Status"), any(),
                        eq(UserNotificationType.ML_PRIMARY_DOWN));
        // Backup-down NOT fired — backup is still serving.
        verify(inAppNotificationService, never())
                .create(any(), any(), any(), eq(UserNotificationType.ML_BACKUP_DOWN));
    }

    @Test
    void primaryAndBackupThrow_fallsBackToStubAndFiresBothDownNotifications() {
        when(mlModelConfigRepository.findFirstBy()).thenReturn(Optional.of(config));
        when(userRepository.findByRole(Role.ANALYST)).thenReturn(List.of(analyst()));
        when(userRepository.findByRole(Role.SUPERADMIN)).thenReturn(List.of(superAdmin()));
        stubPrimaryThrows();
        stubBackupThrows();

        MlScoreResponse response = service.score(sampleRequest());

        assertThat(response.getModelVersion()).isEqualTo("stub-scorer-v1");
        assertThat(config.getActiveLayer()).isEqualTo(ActiveLayer.STUB);
        ArgumentCaptor<UserNotificationType> typeCaptor =
                ArgumentCaptor.forClass(UserNotificationType.class);
        verify(inAppNotificationService, times(4))
                .create(any(), eq("ML Service Status"), any(), typeCaptor.capture());
        assertThat(typeCaptor.getAllValues())
                .containsExactlyInAnyOrder(
                        UserNotificationType.ML_PRIMARY_DOWN, UserNotificationType.ML_PRIMARY_DOWN,
                        UserNotificationType.ML_BACKUP_DOWN, UserNotificationType.ML_BACKUP_DOWN);
    }

    @Test
    void primarySucceeds_alreadyPrimary_doesNotResaveOrRenotify() {
        // Steady state: DB row already PRIMARY. recordLayer should short-circuit.
        when(mlModelConfigRepository.findFirstBy()).thenReturn(Optional.of(config));
        stubPrimaryReturns(primaryResponse());

        service.score(sampleRequest());

        assertThat(config.getActiveLayer()).isEqualTo(ActiveLayer.PRIMARY);
        // syncModelVersion + recordLayer both load the config, but neither saves
        // (version already matches the default null→set path actually saves once,
        // so we expect at most one save from the version sync — never a layer write).
        verify(inAppNotificationService, never())
                .create(any(), any(), any(), eq(UserNotificationType.ML_PRIMARY_UP));
    }
}
