package com.payzo.backend.service.integration;

import jakarta.ws.rs.core.Response;
import lombok.extern.slf4j.Slf4j;
import org.keycloak.OAuth2Constants;
import org.keycloak.admin.client.Keycloak;
import org.keycloak.admin.client.KeycloakBuilder;
import org.keycloak.admin.client.resource.RoleMappingResource;
import org.keycloak.representations.idm.ClientRepresentation;
import org.keycloak.representations.idm.CredentialRepresentation;
import org.keycloak.representations.idm.RoleRepresentation;
import org.keycloak.representations.idm.UserRepresentation;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Self-heals the SuperAdmin presence in Keycloak so {@code docker compose up
 * --build -d payzo-backend} is a one-shot — no manual realm console steps,
 * no companion bootstrap script.
 *
 * <p>Runs once at startup (via {@link com.payzo.backend.DataInitializer}):
 * <ol>
 *   <li>Logs into the {@code master} realm using the same admin credentials
 *       Keycloak's container was started with ({@code KC_ADMIN_USERNAME} /
 *       {@code KC_ADMIN_PASSWORD}, falling back to {@code admin}/{@code admin}).</li>
 *   <li>Lists members of the {@code SUPERADMIN} realm role in the
 *       {@code backoffice} realm. If at least one exists, returns immediately.</li>
 *   <li>Otherwise creates a new user with the configured bootstrap
 *       username/password, marks the email verified, and assigns the
 *       {@code SUPERADMIN} role.</li>
 * </ol>
 *
 * <p>Failure modes are non-fatal — if Keycloak is unreachable or the
 * realm/role layout differs, we log the cause and let
 * {@code DataInitializer.syncSuperAdminsFromKeycloak()} produce its usual
 * "no SA found" warning. The backend still boots either way.
 */
@Service
@Slf4j
public class KeycloakBootstrapService {

    @Value("${keycloak.auth-server-url}")
    private String authServerUrl;

    @Value("${keycloak.realms.backoffice.realm}")
    private String backofficeRealm;

    @Value("${keycloak.realms.clients.realm}")
    private String clientsRealm;

    @Value("${keycloak.master.username}")
    private String masterUsername;

    @Value("${keycloak.master.password}")
    private String masterPassword;

    @Value("${keycloak.bootstrap.superadmin.enabled:true}")
    private boolean bootstrapEnabled;

    @Value("${keycloak.bootstrap.superadmin.username}")
    private String saUsername;

    @Value("${keycloak.bootstrap.superadmin.email}")
    private String saEmail;

    @Value("${keycloak.bootstrap.superadmin.password}")
    private String saPassword;

    /**
     * Idempotent — call as many times as you like. Returns true when an SA
     * already exists or was just created; false if the bootstrap was
     * disabled or hit an unrecoverable error (already logged).
     */
    public boolean ensureSuperAdminExists() {
        if (!bootstrapEnabled) {
            log.info("KeycloakBootstrap: SA bootstrap disabled (keycloak.bootstrap.superadmin.enabled=false)");
            return false;
        }

        try (Keycloak master = KeycloakBuilder.builder()
                .serverUrl(authServerUrl)
                .realm("master")
                .clientId("admin-cli")
                .grantType(OAuth2Constants.PASSWORD)
                .username(masterUsername)
                .password(masterPassword)
                .build()) {

            // 0) Make sure both public FE clients have:
            //   - fullScopeAllowed=true so realm roles (SUPERADMIN/ADMIN/ANALYST/
            //     CLIENT) actually land in the access-token's
            //     `realm_access.roles` claim. Without this, the FE's role
            //     check sees an empty list and rejects every login.
            //   - directAccessGrantsEnabled=true so the FE can use ROPC against
            //     the KC token endpoint (the chosen UX for both apps — keeps
            //     the custom login form + Impact-24 OTP flow).
            // Both flags can drift: --import-realm doesn't overwrite them on
            // later runs once the realm is imported, so we patch from the
            // backend at boot. Idempotent.
            ensureFrontendClientConfig(master, backofficeRealm, "payzo-backoffice-app");
            ensureFrontendClientConfig(master, clientsRealm, "payzo-client-app");

            // 0b) Make sure each confidential client's service-account user
            // carries realm-management roles (manage-users / manage-clients /
            // …) so the backend's KeycloakAdminService can create users in
            // the realm. Keycloak 24's --import-realm doesn't apply the
            // `clientRoles` block on service-account users — the realm JSON
            // is the documented intent, this self-heal makes it real on
            // every fresh boot. Idempotent.
            ensureServiceAccountRoles(master, clientsRealm, "payzo-backend");
            ensureServiceAccountRoles(master, backofficeRealm, "payzo-backend-bo");

            // 1) Already have at least one SA? — no-op.
            List<UserRepresentation> existing = master.realm(backofficeRealm)
                    .roles().get("SUPERADMIN").getRoleUserMembers()
                    .stream().toList();
            if (!existing.isEmpty()) {
                log.info("KeycloakBootstrap: {} SuperAdmin(s) already in realm={} — no bootstrap needed",
                        existing.size(), backofficeRealm);
                return true;
            }

            // 2) Create the bootstrap SA.
            UserRepresentation user = new UserRepresentation();
            user.setUsername(saUsername);
            user.setEmail(saEmail);
            user.setFirstName("Super");
            user.setLastName("Admin");
            user.setEnabled(true);
            user.setEmailVerified(true);
            // No requiredActions — ROPC login refuses users with pending
            // required actions, and the dev-mode SA needs to be able to log
            // straight in.

            CredentialRepresentation cred = new CredentialRepresentation();
            cred.setType(CredentialRepresentation.PASSWORD);
            cred.setValue(saPassword);
            cred.setTemporary(false);
            user.setCredentials(List.of(cred));

            String keycloakId;
            try (Response resp = master.realm(backofficeRealm).users().create(user)) {
                if (resp.getStatus() == 201) {
                    String location = resp.getHeaderString("Location");
                    keycloakId = location.substring(location.lastIndexOf("/") + 1);
                } else if (resp.getStatus() == 409) {
                    // Username already exists but has no SUPERADMIN role —
                    // happens when a previous bootstrap created the user, the
                    // role assignment failed, and the SA was later removed
                    // from the role. Look the user up by username and
                    // re-attach the role below.
                    List<UserRepresentation> matches = master.realm(backofficeRealm)
                            .users().searchByUsername(saUsername, true);
                    if (matches.isEmpty()) {
                        log.error("KeycloakBootstrap: HTTP 409 on create but no user "
                                + "matched username={} — giving up.", saUsername);
                        return false;
                    }
                    keycloakId = matches.get(0).getId();
                    log.info("KeycloakBootstrap: user '{}' already exists (kcId={}) "
                            + "without SUPERADMIN role — re-attaching role.",
                            saUsername, keycloakId);

                    // Reset the password too, in case it drifted from the
                    // configured bootstrap value.
                    CredentialRepresentation reset = new CredentialRepresentation();
                    reset.setType(CredentialRepresentation.PASSWORD);
                    reset.setValue(saPassword);
                    reset.setTemporary(false);
                    master.realm(backofficeRealm).users().get(keycloakId)
                            .resetPassword(reset);
                } else {
                    log.error("KeycloakBootstrap: failed to create SA — HTTP {} ({}). "
                                    + "Body={}",
                            resp.getStatus(), resp.getStatusInfo(), resp.readEntity(String.class));
                    return false;
                }
            }

            // 3) Assign SUPERADMIN realm role. Strip the role payload to
            // {id, name} only — the full representation (which carries
            // containerId, composite, etc.) trips Keycloak with HTTP 400.
            RoleRepresentation full = master.realm(backofficeRealm)
                    .roles().get("SUPERADMIN").toRepresentation();
            RoleRepresentation slim = new RoleRepresentation();
            slim.setId(full.getId());
            slim.setName(full.getName());
            master.realm(backofficeRealm).users().get(keycloakId)
                    .roles().realmLevel().add(List.of(slim));

            log.info("KeycloakBootstrap: created default SuperAdmin in Keycloak — "
                            + "username={} keycloakId={} (default password — change in production)",
                    saUsername, keycloakId);
            return true;

        } catch (Exception e) {
            log.warn("KeycloakBootstrap: SA bootstrap failed ({}). The backend will boot, "
                    + "but you'll need to create a SUPERADMIN manually until this is fixed. "
                    + "Common causes: Keycloak still starting (retry in a moment), wrong "
                    + "KC_ADMIN_USERNAME/KC_ADMIN_PASSWORD, or the SUPERADMIN realm role "
                    + "doesn't exist in realm={}.", e.getMessage(), backofficeRealm);
            return false;
        }
    }

    /**
     * Realm-management client roles the backend's
     * {@link KeycloakAdminService} needs in each realm. Sourced from
     * the {@code clientRoles} block on the corresponding service-account
     * user in {@code Keycloak/realms/*-realm.json} — kept in sync so
     * the file remains the documented intent and this method just
     * heals what import didn't apply.
     */
    private static final List<String> REALM_MANAGEMENT_ROLES = List.of(
            "manage-users",
            "view-users",
            "manage-realm",
            "query-users",
            "view-clients",
            "manage-clients",
            "create-client",
            "query-clients"
    );

    /**
     * Idempotently grants the {@link #REALM_MANAGEMENT_ROLES} to the
     * service-account user of the given confidential client. Keycloak
     * 24's realm import does not honour {@code clientRoles} on a user
     * with {@code serviceAccountClientId} (the SA user is created
     * synchronously when the client is imported, but the role mapping
     * step runs against the user-list block before the SA user exists,
     * so the assignment is silently dropped).
     *
     * <p>Failure modes are non-fatal — the SA bootstrap still proceeds
     * even if this self-heal can't reach the role mapping endpoint.
     * Subsequent calls into {@link KeycloakAdminService} will surface
     * the missing-role error with a clearer log line in that case.
     */
    private void ensureServiceAccountRoles(Keycloak master, String realmName, String confidentialClientId) {
        try {
            List<ClientRepresentation> matches = master.realm(realmName)
                    .clients().findByClientId(confidentialClientId);
            if (matches.isEmpty()) {
                log.warn("KeycloakBootstrap: no confidential client '{}' in realm={} — "
                        + "skipping service-account role sync.", confidentialClientId, realmName);
                return;
            }
            String clientUuid = matches.get(0).getId();
            UserRepresentation saUser = master.realm(realmName)
                    .clients().get(clientUuid).getServiceAccountUser();
            if (saUser == null) {
                log.warn("KeycloakBootstrap: confidential client '{}' in realm={} has no "
                        + "service-account user (serviceAccountsEnabled=false?) — "
                        + "skipping role sync.", confidentialClientId, realmName);
                return;
            }

            List<ClientRepresentation> rmMatches = master.realm(realmName)
                    .clients().findByClientId("realm-management");
            if (rmMatches.isEmpty()) {
                log.warn("KeycloakBootstrap: realm={} has no 'realm-management' client — "
                        + "skipping SA role sync.", realmName);
                return;
            }
            String rmUuid = rmMatches.get(0).getId();

            RoleMappingResource roleMappings = master.realm(realmName)
                    .users().get(saUser.getId()).roles();
            Set<String> already = new HashSet<>();
            for (RoleRepresentation r : roleMappings.clientLevel(rmUuid).listAll()) {
                already.add(r.getName());
            }

            List<RoleRepresentation> toAdd = new ArrayList<>();
            for (String roleName : REALM_MANAGEMENT_ROLES) {
                if (already.contains(roleName)) continue;
                RoleRepresentation full = master.realm(realmName)
                        .clients().get(rmUuid).roles().get(roleName).toRepresentation();
                RoleRepresentation slim = new RoleRepresentation();
                slim.setId(full.getId());
                slim.setName(full.getName());
                toAdd.add(slim);
            }

            if (toAdd.isEmpty()) {
                return; // already correct — quiet no-op
            }
            roleMappings.clientLevel(rmUuid).add(toAdd);
            log.info("KeycloakBootstrap: granted realm-management roles to service-account "
                            + "user of clientId={} in realm={} (added: {}).",
                    confidentialClientId, realmName,
                    toAdd.stream().map(RoleRepresentation::getName).toList());
        } catch (Exception e) {
            log.warn("KeycloakBootstrap: couldn't sync service-account roles for "
                    + "clientId={} in realm={} ({}). KeycloakAdminService calls into "
                    + "this realm may fail with HTTP 403 until the role is granted "
                    + "manually in the Keycloak admin console.",
                    confidentialClientId, realmName, e.getMessage());
        }
    }

    /**
     * Idempotently ensures a public FE client has both
     * {@code fullScopeAllowed=true} (so realm roles land in JWTs) and
     * {@code directAccessGrantsEnabled=true} (so the FE can use the ROPC
     * token grant for its custom login UI). When the realm was first
     * imported with either flag wrong, {@code --import-realm} won't
     * overwrite it on later runs — so we patch it from the backend at
     * boot. Safe to call repeatedly; logs only on a state change.
     */
    private void ensureFrontendClientConfig(Keycloak master, String realmName, String clientId) {
        try {
            List<ClientRepresentation> matches = master.realm(realmName)
                    .clients().findByClientId(clientId);
            if (matches.isEmpty()) {
                log.warn("KeycloakBootstrap: no client '{}' in realm={} — skipping FE-client sync.",
                        clientId, realmName);
                return;
            }
            ClientRepresentation client = matches.get(0);
            boolean fullScopeOk = Boolean.TRUE.equals(client.isFullScopeAllowed());
            boolean directGrantsOk = Boolean.TRUE.equals(client.isDirectAccessGrantsEnabled());
            if (fullScopeOk && directGrantsOk) {
                return; // already correct — quiet no-op
            }
            client.setFullScopeAllowed(true);
            client.setDirectAccessGrantsEnabled(true);
            master.realm(realmName).clients().get(client.getId()).update(client);
            log.info("KeycloakBootstrap: synced FE client config in realm={} clientId={} "
                            + "(fullScopeAllowed: {}→true, directAccessGrantsEnabled: {}→true).",
                    realmName, clientId, fullScopeOk, directGrantsOk);
        } catch (Exception e) {
            log.warn("KeycloakBootstrap: couldn't sync FE client config for clientId={} in realm={} ({}). "
                    + "If logins fail with 'not authorized' or token requests 401, flip "
                    + "fullScopeAllowed=true and directAccessGrantsEnabled=true manually in "
                    + "the Keycloak admin console.", clientId, realmName, e.getMessage());
        }
    }
}
