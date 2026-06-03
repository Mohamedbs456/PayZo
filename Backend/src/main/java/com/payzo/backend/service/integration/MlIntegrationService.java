package com.payzo.backend.service.integration;

import com.payzo.backend.domain.entity.MlModelConfig;
import com.payzo.backend.domain.entity.User;
import com.payzo.backend.domain.enums.ActiveLayer;
import com.payzo.backend.domain.enums.Role;
import com.payzo.backend.domain.enums.UserNotificationType;
import com.payzo.backend.repository.MlModelConfigRepository;
import com.payzo.backend.repository.UserRepository;
import com.payzo.backend.service.notification.InAppNotificationService;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * 3-layer fallback around the ML scorer (D35): primary XGBoost (whichever
 * artifact wins training), backup logistic regression at /score/backup, then
 * a rule-based stub of last resort. Each layer transition writes the new
 * active_layer to MlModelConfig and fans out in-app notifications to analysts
 * and the SuperAdmin per the D36 taxonomy. Recovery to PRIMARY is auto-detected
 * on the next successful call.
 */
@Service
@Slf4j
public class MlIntegrationService {

    private final WebClient mlWebClient;
    private final MlModelConfigRepository mlModelConfigRepository;
    private final UserRepository userRepository;
    private final InAppNotificationService inAppNotificationService;

    @Value("${ml.enabled}")
    private boolean mlEnabled;

    public MlIntegrationService(@Qualifier("mlWebClient") WebClient mlWebClient,
                                MlModelConfigRepository mlModelConfigRepository,
                                UserRepository userRepository,
                                InAppNotificationService inAppNotificationService) {
        this.mlWebClient = mlWebClient;
        this.mlModelConfigRepository = mlModelConfigRepository;
        this.userRepository = userRepository;
        this.inAppNotificationService = inAppNotificationService;
    }

    public MlScoreResponse score(MlScoreRequest request) {
        if (!mlEnabled) {
            log.info("ML disabled — using stub scorer for transaction {}", request.getTransactionId());
            recordLayer(ActiveLayer.STUB);
            return stubScore(request);
        }

        // Layer 1: Primary model
        try {
            MlScoreResponse response = mlWebClient.post()
                    .uri("/score")
                    .bodyValue(request)
                    .retrieve()
                    .bodyToMono(MlScoreResponse.class)
                    .block();
            if (response != null) {
                syncModelVersion(response.getModelVersion());
                recordLayer(ActiveLayer.PRIMARY);
                return response;
            }
        } catch (Exception e) {
            log.warn("ML primary model unavailable — attempting backup for {}", request.getTransactionId(), e);
        }

        // Layer 2: Backup model (Logistic Regression)
        try {
            MlScoreResponse response = mlWebClient.post()
                    .uri("/score/backup")
                    .bodyValue(request)
                    .retrieve()
                    .bodyToMono(MlScoreResponse.class)
                    .block();
            if (response != null) {
                syncModelVersion(response.getModelVersion());
                recordLayer(ActiveLayer.BACKUP);
                return response;
            }
        } catch (Exception e) {
            log.warn("ML backup model unavailable — falling back to stub for {}", request.getTransactionId(), e);
        }

        // Layer 3: Rule-based stub
        recordLayer(ActiveLayer.STUB);
        return stubScore(request);
    }

    /**
     * Sync MlModelConfig.modelVersion from the Python service whenever it differs.
     * No-op if the version is unchanged (avoids per-request DB writes) or blank.
     * Bumps updated_at via @PreUpdate, which is what the SuperAdmin ML config
     * page displays as "Last updated".
     */
    private void syncModelVersion(String newVersion) {
        if (newVersion == null || newVersion.isBlank()) return;
        MlModelConfig config = mlModelConfigRepository.findFirstBy().orElse(null);
        if (config == null) return;
        String currentVersion = config.getModelVersion();
        if (newVersion.equals(currentVersion)) return;
        config.setModelVersion(newVersion);
        mlModelConfigRepository.save(config);
        log.info("ML model_version synced: {} → {}", currentVersion, newVersion);
    }

    /**
     * Persist the layer that actually served this request and fan out the
     * matching D35/D36 notifications when the layer changes. Symmetric across
     * PRIMARY/BACKUP/STUB so the DB row never lies about which layer scored a
     * given transaction — even on a transition into STUB caused by mlEnabled=false
     * at boot, which the previous PRIMARY-only branch silently swallowed.
     */
    private void recordLayer(ActiveLayer target) {
        MlModelConfig config = mlModelConfigRepository.findFirstBy().orElse(null);
        if (config == null) return;

        ActiveLayer current = config.getActiveLayer();
        if (current == target) return;

        config.setActiveLayer(target);
        mlModelConfigRepository.save(config);

        if (target == ActiveLayer.PRIMARY) {
            notifyLayerChange(UserNotificationType.ML_PRIMARY_UP,
                    "ML primary model is back online.");
        } else if (current == ActiveLayer.PRIMARY && target == ActiveLayer.BACKUP) {
            notifyLayerChange(UserNotificationType.ML_PRIMARY_DOWN,
                    "ML primary model is down. Backup model activated.");
        } else if (current == ActiveLayer.PRIMARY && target == ActiveLayer.STUB) {
            notifyLayerChange(UserNotificationType.ML_PRIMARY_DOWN, "ML primary model is down.");
            notifyLayerChange(UserNotificationType.ML_BACKUP_DOWN,
                    "ML backup model is also unavailable. Rule-based fallback active.");
        } else if (current == ActiveLayer.BACKUP && target == ActiveLayer.STUB) {
            notifyLayerChange(UserNotificationType.ML_BACKUP_DOWN,
                    "ML backup model is down. Rule-based fallback active.");
        }

        log.info("ML layer recorded: {} → {}", current, target);
    }

    private void notifyLayerChange(UserNotificationType type, String message) {
        List<User> analysts = userRepository.findByRole(Role.ANALYST);
        List<User> superAdmins = userRepository.findByRole(Role.SUPERADMIN);

        for (User analyst : analysts) {
            inAppNotificationService.create(analyst.getId(), "ML Service Status", message, type);
        }
        for (User sa : superAdmins) {
            inAppNotificationService.create(sa.getId(), "ML Service Status", message, type);
        }
    }

    private MlScoreResponse stubScore(MlScoreRequest request) {
        double amount = Math.expm1(request.getLogAmount());
        BigDecimal riskScore;
        String riskLevel;

        if (amount > 10_000) {
            riskScore = new BigDecimal("0.85");
            riskLevel = "HIGH";
        } else if (amount > 2_000) {
            riskScore = new BigDecimal("0.50");
            riskLevel = "MEDIUM";
        } else {
            riskScore = new BigDecimal("0.10");
            riskLevel = "LOW";
        }

        MlScoreResponse response = new MlScoreResponse();
        response.setTransactionId(request.getTransactionId());
        response.setRiskScore(riskScore);
        response.setRiskLevel(riskLevel);
        response.setModelVersion("stub-scorer-v1");
        response.setLatencyMs(0);
        response.setReasons(stubReasons(request, amount));
        return response;
    }

    /**
     * Cheap rule-based explanations for the stub layer. Mirrors the heuristics the
     * Python service uses so analysts see consistent reason strings regardless of
     * whether PRIMARY, BACKUP, or STUB produced the score.
     */
    private static List<String> stubReasons(MlScoreRequest request, double amount) {
        List<String> reasons = new ArrayList<>();
        if (amount > 10_000) {
            reasons.add("Amount exceeds 10 000 TND — high-value transfer");
        } else if (amount > 2_000) {
            reasons.add("Amount exceeds 2 000 TND — medium-value transfer");
        }
        int hour = request.getHourOfDay();
        if (hour < 6 || hour >= 22) {
            reasons.add("Initiated outside daytime hours (06:00–22:00)");
        }
        if (request.getHourLikelihoodForUser() != null && request.getHourLikelihoodForUser() < 0.02) {
            reasons.add("This hour is unusual for this sender");
        }
        if (request.getAmountZScoreUser30d() != null && request.getAmountZScoreUser30d() >= 3.0) {
            reasons.add("Amount is " + String.format("%.1f", request.getAmountZScoreUser30d())
                    + "σ above this sender's 30-day average");
        }
        if (request.getVelocityRelativeToUserNorm() != null
                && request.getVelocityRelativeToUserNorm() >= 5.0) {
            reasons.add("24h activity is " + String.format("%.1f", request.getVelocityRelativeToUserNorm())
                    + "× this sender's normal rate");
        }
        if (request.getIsSenderNewAccount() == 1) {
            reasons.add("Sender's account is less than 30 days old");
        }
        if (request.getSenderTxCount24h() >= 5) {
            reasons.add("Sender has " + request.getSenderTxCount24h()
                    + " transactions in the last 24 hours");
        }
        if (request.getDistanceKm() >= 200) {
            reasons.add(String.format(
                    "Sender and receiver governorates are %.0f km apart",
                    request.getDistanceKm()));
        }
        if (request.getIsBalanceZeroReceiver() == 1) {
            reasons.add("Receiver account had a zero balance before this transfer");
        }
        if (request.getTrustScore() != null && request.getTrustScore() < 30) {
            reasons.add("Sender trust score below 30 — low reputation");
        }
        if ("SAVINGS".equals(request.getAccountType()) && amount > 5_000) {
            reasons.add("Large transfer originating from a SAVINGS account");
        }
        return reasons;
    }

    /**
     * v5 wire contract — matches ML-Service/app/schemas.py ScoreRequest.
     * <p>
     * Population-relative features (15) + per-user-norm features (8) +
     * categorical (1) = 24 features total. See feature_engineering.py for the
     * model-side ordering.
     * <p>
     * Clean break vs v4.2: isNight, destIsFavorite, amountZScoreVsUserMedian,
     * and amountVsDestMaxPrior were removed (subsumed by hourOfDay /
     * amount_z_score_user_30d / dest_familiarity_score in v5). The 8 per-user-norm
     * fields below encode each transaction against the sender's own history.
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class MlScoreRequest {
        private UUID transactionId;

        // Population-relative (15)
        private double logAmount;
        private double amountToBalanceRatio;
        private int isBalanceZeroReceiver;
        private double distanceKm;
        private int hourOfDay;
        private int senderTxCount24h;
        private double senderAmountSum24h;
        private int senderDistinctDest24h;
        private int senderAccountAgeDays;
        private int isSenderNewAccount;
        private Integer trustScore;
        private Integer isKnownBeneficiary;
        private Integer transfersToDestLifetime;
        private Integer isDestNewAccount;
        private Integer daysSinceLastTransaction;

        // Per-user-norm (8) — see ML-Service/data_generation/per_user_features.py
        // for the canonical computation. Cold-start defaults documented per
        // field at the source; FraudDetectionService uses the same defaults.
        private Double  amountZScoreUser30d;
        private Double  amountPctOfUserMaxLifetime;
        private Double  hourLikelihoodForUser;
        private Double  destFamiliarityScore;
        private Double  velocityRelativeToUserNorm;
        private Integer weekdayTypicalForUser;
        private Integer accountTypeTypicalForUser;
        private Integer daysSinceUserAccountAnomaly;

        // Categorical (one-hot encoded as account_type_savings server-side)
        private String accountType;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class MlScoreResponse {
        private UUID transactionId;
        private BigDecimal riskScore;
        private String riskLevel;
        private String modelVersion;
        private long latencyMs;
        /**
         * Short human-readable strings explaining the score. May be null/empty when
         * the model produced none — callers should treat null and empty as equivalent.
         */
        private List<String> reasons;
    }
}
