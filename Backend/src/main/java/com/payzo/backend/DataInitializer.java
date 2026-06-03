package com.payzo.backend;

import com.payzo.backend.domain.entity.MlModelConfig;
import com.payzo.backend.domain.entity.SuperAdmin;
import com.payzo.backend.domain.enums.ActiveLayer;
import com.payzo.backend.domain.enums.Role;
import com.payzo.backend.domain.enums.UserStatus;
import com.payzo.backend.repository.MlModelConfigRepository;
import com.payzo.backend.repository.UserRepository;
import com.payzo.backend.service.integration.KeycloakBootstrapService;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.keycloak.admin.client.Keycloak;
import org.keycloak.representations.idm.UserRepresentation;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Set;
import java.util.UUID;

/**
 * Reference-data + identity-sync bootstrapper.
 *
 *   • {@link #seedMlModelConfig()}  — the singleton ml_model_config row, default
 *     thresholds 0.30 / 0.70 + active layer PRIMARY. Idempotent.
 *   • {@link #syncSuperAdminsFromKeycloak()} — pulls every Keycloak user that
 *     carries the realm role {@code SUPERADMIN} into the {@code users} table
 *     and links {@code keycloak_id}. No manual SQL after a fresh DB wipe;
 *     the only bootstrap step is creating an SA in Keycloak.
 *
 * Banks are NOT seeded here — {@code BankSyncBootstrap} pulls them from CBS
 * after application startup (and retries every 5 minutes until CBS is up).
 *
 * Note — staff (admins/analysts) and clients are NOT seeded. They land in
 * the DB only when the SuperAdmin invites them through the UI.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class DataInitializer {

    private final UserRepository userRepository;
    private final MlModelConfigRepository mlModelConfigRepository;
    @Qualifier("backofficeKeycloak")
    private final Keycloak backofficeKeycloak;
    private final KeycloakBootstrapService keycloakBootstrap;

    @Value("${keycloak.realms.backoffice.realm}")
    private String backofficeRealm;

    @PostConstruct
    @Transactional
    public void init() {
        seedMlModelConfig();
        // Self-heal Keycloak first, then mirror the resulting SA(s) into the
        // local users table. Order matters: the sync below is a no-op when
        // Keycloak has zero SAs, so the bootstrap MUST run first on a fresh
        // realm.
        keycloakBootstrap.ensureSuperAdminExists();
        syncSuperAdminsFromKeycloak();
    }

    /**
     * Pulls every Keycloak user that carries the realm role SUPERADMIN into
     * the local {@code users} table. Replaces the old "seed an SA + manually
     * UPDATE keycloak_id" dance.
     *
     * Failure modes are non-fatal — if Keycloak isn't reachable or the
     * service account hasn't been granted realm-management permissions yet,
     * we just log and let the operator follow the bootstrap steps.
     */
    private void syncSuperAdminsFromKeycloak() {
        Set<UserRepresentation> kcSuperAdmins;
        try {
            kcSuperAdmins = backofficeKeycloak.realm(backofficeRealm)
                    .roles()
                    .get("SUPERADMIN")
                    .getRoleUserMembers();
        } catch (Exception e) {
            log.warn("DataInitializer: couldn't query SUPERADMIN role members "
                    + "in realm={} ({}). Make sure the SUPERADMIN role exists "
                    + "and the service account has view-users permissions.",
                    backofficeRealm, e.getMessage());
            return;
        }

        if (kcSuperAdmins == null || kcSuperAdmins.isEmpty()) {
            log.warn("DataInitializer: no Keycloak user with realm role "
                    + "SUPERADMIN found in realm={}. Bootstrap step: create "
                    + "one in the Keycloak admin console, assign the "
                    + "SUPERADMIN role, then restart this service.",
                    backofficeRealm);
            return;
        }

        for (UserRepresentation kc : kcSuperAdmins) {
            UUID keycloakId = UUID.fromString(kc.getId());

            if (userRepository.findByKeycloakId(keycloakId).isPresent()) {
                continue; // already linked — no-op
            }

            SuperAdmin sa = new SuperAdmin();
            sa.setKeycloakId(keycloakId);
            sa.setUsername(kc.getUsername());
            sa.setFirstName(kc.getFirstName() != null ? kc.getFirstName() : "Super");
            sa.setLastName(kc.getLastName() != null ? kc.getLastName() : "Admin");
            sa.setEmail(kc.getEmail() != null ? kc.getEmail() : kc.getUsername() + "@payzo.local");
            sa.setRole(Role.SUPERADMIN);
            sa.setStatus(UserStatus.ACTIVE);

            userRepository.save(sa);
            log.info("DataInitializer: synced SuperAdmin from Keycloak — "
                    + "username={} keycloakId={}", kc.getUsername(), keycloakId);
        }
    }

    private void seedMlModelConfig() {
        if (mlModelConfigRepository.findFirstBy().isPresent()) {
            log.debug("DataInitializer: ml_model_config already exists — skipping");
            return;
        }

        MlModelConfig config = new MlModelConfig();
        config.setThresholdLowMedium(new BigDecimal("0.300"));
        config.setThresholdMediumHigh(new BigDecimal("0.700"));
        config.setModelVersion("xgb-transfer-v1");
        config.setActiveLayer(ActiveLayer.PRIMARY);

        mlModelConfigRepository.save(config);
        log.info("DataInitializer: ml_model_config seeded (low=0.30, high=0.70)");
    }

}
