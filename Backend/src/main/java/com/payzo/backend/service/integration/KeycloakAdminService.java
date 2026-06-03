package com.payzo.backend.service.integration;

import jakarta.ws.rs.NotAuthorizedException;
import jakarta.ws.rs.core.Response;
import lombok.extern.slf4j.Slf4j;
import org.keycloak.OAuth2Constants;
import org.keycloak.admin.client.Keycloak;
import org.keycloak.admin.client.KeycloakBuilder;
import org.keycloak.admin.client.resource.RealmResource;
import org.keycloak.admin.client.resource.UserResource;
import org.keycloak.admin.client.resource.UsersResource;
import org.keycloak.representations.idm.CredentialRepresentation;
import org.keycloak.representations.idm.RoleRepresentation;
import org.keycloak.representations.idm.UserRepresentation;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

/**
 * Bridges PayZo to the Keycloak Admin REST API for both realms. One Keycloak
 * client per realm (clients-realm for client signup / first-login password
 * rotation, backoffice-realm for staff CRUD) so a bug in the admin flow cannot
 * accidentally provision a CLIENT into the backoffice realm or vice versa.
 * Handles the orphan-recovery dance documented on createClientUserAttempt below.
 */
@Service
@Slf4j
public class KeycloakAdminService {

    private final Keycloak clientsKeycloak;
    private final Keycloak backofficeKeycloak;

    @Value("${keycloak.auth-server-url}")
    private String authServerUrl;

    @Value("${keycloak.realms.clients.realm}")
    private String clientsRealm;

    @Value("${keycloak.realms.clients.client-id}")
    private String clientsClientId;

    @Value("${keycloak.realms.clients.client-secret}")
    private String clientsClientSecret;

    @Value("${keycloak.realms.backoffice.realm}")
    private String backofficeRealm;

    @Value("${keycloak.realms.backoffice.client-id}")
    private String backofficeClientId;

    @Value("${keycloak.realms.backoffice.client-secret}")
    private String backofficeClientSecret;

    public KeycloakAdminService(@Qualifier("clientsKeycloak") Keycloak clientsKeycloak,
                                @Qualifier("backofficeKeycloak") Keycloak backofficeKeycloak) {
        this.clientsKeycloak = clientsKeycloak;
        this.backofficeKeycloak = backofficeKeycloak;
    }

    public UUID createClientUser(String cin, String email, String firstName,
                                 String lastName, String tempPassword) {
        return createClientUserAttempt(cin, email, firstName, lastName, tempPassword, true);
    }

    /**
     * Single-attempt create. On the first call, {@code allowOrphanRecovery=true}:
     * if Keycloak rejects with 409 (a user with the same username/email already
     * exists), we look up that orphan by username (which always equals the CIN
     * for client users — see {@code user.setUsername(cin)} below) or by email,
     * delete it, and call ourselves once more with the recovery flag off so we
     * can never loop forever. The orphan path covers the common dev-mode
     * failure: a previous {@code approveSubscription} got the KC user created
     * but threw downstream (e.g. notification or audit failure), {@code @Transactional}
     * rolled the PayZo DB back, and the KC user is left stranded — every
     * subsequent approval attempt for that CIN then 409s on create.
     */
    private UUID createClientUserAttempt(String cin, String email, String firstName,
                                         String lastName, String tempPassword,
                                         boolean allowOrphanRecovery) {
        UserRepresentation user = new UserRepresentation();
        user.setUsername(cin);
        user.setEmail(email);
        user.setFirstName(firstName);
        user.setLastName(lastName);
        user.setEnabled(true);
        user.setEmailVerified(true);
        // Pass an explicit empty list so this `UserRepresentation` doesn't
        // inherit any realm-level *default* required actions on creation.
        // The realm JSON has `UPDATE_PASSWORD.defaultAction=false`, but
        // existing realms imported before that fix landed still carry it
        // — and Keycloak refuses ROPC (direct-password-grant) tokens
        // whenever a user has any pending required action, which is the
        // exact flow our FE login uses. The forced first-login password
        // change still happens at the app level: the dashboard checks
        // `me.firstLoginCompleted` and mounts <FirstLoginPasswordModal/>
        // (DashboardPage.tsx:148 + FirstLoginPasswordModal.tsx). Same
        // approach as createBackofficeUser below.
        user.setRequiredActions(List.of());

        CredentialRepresentation credential = new CredentialRepresentation();
        credential.setType(CredentialRepresentation.PASSWORD);
        credential.setValue(tempPassword);
        credential.setTemporary(false);
        user.setCredentials(List.of(credential));

        UsersResource usersResource = clientsKeycloak.realm(clientsRealm).users();
        try (Response response = usersResource.create(user)) {
            int status = response.getStatus();
            if (status == 409 && allowOrphanRecovery) {
                deleteOrphanByUsernameOrEmail(usersResource, cin, email);
                // One retry only — recursion is bounded by the recovery flag.
                return createClientUserAttempt(cin, email, firstName, lastName, tempPassword, false);
            }
            if (status != 201) {
                // Surface the response body so 400 password-policy / username-format
                // rejections are debuggable. Without this we'd just see "Bad Request"
                // and have to dig through Keycloak server logs.
                String body = "";
                try { body = response.readEntity(String.class); } catch (Exception ignored) {}
                throw new RuntimeException("Failed to create client user in Keycloak: HTTP "
                        + status + " — " + response.getStatusInfo()
                        + (body.isEmpty() ? "" : " — body: " + body));
            }
            String location = response.getHeaderString("Location");
            String keycloakId = location.substring(location.lastIndexOf("/") + 1);

            assignRealmRole(clientsKeycloak, clientsRealm, keycloakId, "CLIENT");

            // Belt-and-braces: re-fetch the just-created user and force
            // requiredActions=[] back onto the persisted row. Some KC
            // builds apply realm-level defaults *after* honouring the
            // create payload — this second pass is what actually sticks
            // and unblocks ROPC for users created against a realm where
            // UPDATE_PASSWORD is still a default action.
            try {
                UserResource created = usersResource.get(keycloakId);
                UserRepresentation rep = created.toRepresentation();
                if (rep.getRequiredActions() != null && !rep.getRequiredActions().isEmpty()) {
                    int n = rep.getRequiredActions().size();
                    rep.setRequiredActions(List.of());
                    created.update(rep);
                    log.info("Cleared {} default required action(s) on cin={} (kcId={})",
                            n, cin, keycloakId);
                }
            } catch (Exception ex) {
                // Don't fail the approve flow on a cosmetic cleanup hiccup.
                log.warn("Post-create requiredActions clear failed for cin={} (kcId={}): {}",
                        cin, keycloakId, ex.getMessage());
            }

            log.info("Created client user in Keycloak: cin={}, keycloakId={}", cin, keycloakId);
            return UUID.fromString(keycloakId);
        }
    }

    /**
     * Look up a Keycloak user by username first, then by email, and delete
     * whichever match we find. Used by {@link #createClientUserAttempt} to
     * clean up an orphan KC row that's blocking a fresh create with 409.
     * Logs but does not throw — if we can't find anything matching, the
     * subsequent retry will surface its own error.
     */
    private void deleteOrphanByUsernameOrEmail(UsersResource usersResource,
                                               String username, String email) {
        try {
            // exact=true so "12345678" doesn't accidentally match "123456789".
            List<UserRepresentation> byUsername = usersResource.searchByUsername(username, true);
            for (UserRepresentation orphan : byUsername) {
                log.warn("Deleting orphan Keycloak user by username: kcId={}, username={}",
                        orphan.getId(), orphan.getUsername());
                try (Response del = usersResource.delete(orphan.getId())) {
                    if (del.getStatus() != 204) {
                        log.warn("Orphan delete returned HTTP {} for kcId={}", del.getStatus(), orphan.getId());
                    }
                }
            }
            // Only fall back to email lookup if the username lookup found nothing
            // — that minimises the risk of nuking a legitimate KC user who just
            // happens to share an email with the CBS fixture for this CIN.
            if (byUsername.isEmpty() && email != null && !email.isBlank()) {
                List<UserRepresentation> byEmail = usersResource.searchByEmail(email, true);
                for (UserRepresentation orphan : byEmail) {
                    log.warn("Deleting orphan Keycloak user by email: kcId={}, email={}",
                            orphan.getId(), orphan.getEmail());
                    try (Response del = usersResource.delete(orphan.getId())) {
                        if (del.getStatus() != 204) {
                            log.warn("Orphan delete returned HTTP {} for kcId={}", del.getStatus(), orphan.getId());
                        }
                    }
                }
            }
        } catch (Exception ex) {
            log.warn("Orphan cleanup before retry failed for username={}, email={}: {}",
                    username, email, ex.getMessage());
        }
    }

    public UUID createBackofficeUser(String username, String email, String firstName,
                                     String lastName, String role, String tempPassword) {
        UserRepresentation user = new UserRepresentation();
        user.setUsername(username);
        user.setEmail(email);
        user.setFirstName(firstName);
        user.setLastName(lastName);
        user.setEnabled(true);
        user.setEmailVerified(true);
        // No `requiredActions=[UPDATE_PASSWORD]` here. Keycloak refuses ROPC
        // (direct password grant) tokens whenever a user has pending required
        // actions — which is exactly the flow our FE uses. We still encourage
        // the new staff member to change their password via Profile → Change
        // password (the OTP flow), but we don't make it a Keycloak-level
        // gate, otherwise they can't log in at all.

        CredentialRepresentation credential = new CredentialRepresentation();
        credential.setType(CredentialRepresentation.PASSWORD);
        credential.setValue(tempPassword);
        credential.setTemporary(false);
        user.setCredentials(List.of(credential));

        UsersResource usersResource = backofficeKeycloak.realm(backofficeRealm).users();
        try (Response response = usersResource.create(user)) {
            if (response.getStatus() != 201) {
                throw new RuntimeException("Failed to create backoffice user in Keycloak: HTTP "
                        + response.getStatus() + " — " + response.getStatusInfo());
            }
            String location = response.getHeaderString("Location");
            String keycloakId = location.substring(location.lastIndexOf("/") + 1);

            assignRealmRole(backofficeKeycloak, backofficeRealm, keycloakId, role);

            log.info("Created backoffice user in Keycloak: username={}, role={}, keycloakId={}",
                    username, role, keycloakId);
            return UUID.fromString(keycloakId);
        }
    }

    public void disableUser(UUID keycloakId, String realm) {
        Keycloak kc = getKeycloak(realm);
        UserResource userResource = kc.realm(realm).users().get(keycloakId.toString());
        UserRepresentation user = userResource.toRepresentation();
        user.setEnabled(false);
        userResource.update(user);
        log.info("Disabled Keycloak user: keycloakId={}, realm={}", keycloakId, realm);
    }

    public void enableUser(UUID keycloakId, String realm) {
        Keycloak kc = getKeycloak(realm);
        UserResource userResource = kc.realm(realm).users().get(keycloakId.toString());
        UserRepresentation user = userResource.toRepresentation();
        user.setEnabled(true);
        userResource.update(user);
        log.info("Enabled Keycloak user: keycloakId={}, realm={}", keycloakId, realm);
    }

    public void deleteUser(UUID keycloakId, String realm) {
        Keycloak kc = getKeycloak(realm);
        try (Response response = kc.realm(realm).users().delete(keycloakId.toString())) {
            if (response.getStatus() != 204) {
                throw new RuntimeException("Failed to delete Keycloak user: HTTP "
                        + response.getStatus() + " — " + response.getStatusInfo());
            }
        }
        log.info("Deleted Keycloak user: keycloakId={}, realm={}", keycloakId, realm);
    }

    /**
     * Verify a client's current password by attempting a Resource Owner Password
     * Credentials grant against Keycloak. Returns true on a successful token mint,
     * false on 401. Used by the in-profile change-password flow (D45) so the
     * backend can confirm the user knows their current password before letting
     * them set a new one.
     *
     * Requires "Direct Access Grants" to be enabled on the {@code payzo-backend}
     * client (or whichever client we're using here) in the {@code clients} realm.
     */
    public boolean verifyClientPassword(String cin, String currentPassword) {
        try (Keycloak verifier = KeycloakBuilder.builder()
                .serverUrl(authServerUrl)
                .realm(clientsRealm)
                .grantType(OAuth2Constants.PASSWORD)
                .clientId(clientsClientId)
                .clientSecret(clientsClientSecret)
                .username(cin)
                .password(currentPassword)
                .build()) {
            // tokenManager().getAccessToken() throws when credentials are wrong
            verifier.tokenManager().getAccessToken();
            return true;
        } catch (NotAuthorizedException e) {
            log.debug("Password verification failed for cin={}", cin);
            return false;
        } catch (Exception e) {
            log.warn("Unexpected error verifying password for cin={}: {}", cin, e.getMessage());
            return false;
        }
    }

    /**
     * Mirror of {@link #verifyClientPassword(String, String)} for the backoffice
     * realm. Used by the in-profile password change flow on the backoffice UI:
     * step 1 verifies the user knows their current password before we email an
     * OTP and let them set a new one.
     */
    public boolean verifyBackofficePassword(String username, String currentPassword) {
        try (Keycloak verifier = KeycloakBuilder.builder()
                .serverUrl(authServerUrl)
                .realm(backofficeRealm)
                .grantType(OAuth2Constants.PASSWORD)
                .clientId(backofficeClientId)
                .clientSecret(backofficeClientSecret)
                .username(username)
                .password(currentPassword)
                .build()) {
            verifier.tokenManager().getAccessToken();
            return true;
        } catch (NotAuthorizedException e) {
            log.debug("BO password verification failed for username={}", username);
            return false;
        } catch (Exception e) {
            log.warn("Unexpected error verifying BO password for username={}: {}",
                    username, e.getMessage());
            return false;
        }
    }

    /**
     * Force-logout the user from all Keycloak sessions (D44). Called after a
     * password reset so any active access tokens are immediately repudiated and
     * the user has to log in again with the new password.
     */
    public void invalidateUserSessions(UUID keycloakId, String realm) {
        Keycloak kc = getKeycloak(realm);
        kc.realm(realm).users().get(keycloakId.toString()).logout();
        log.info("Invalidated all sessions for Keycloak user: keycloakId={}, realm={}",
                keycloakId, realm);
    }

    public void changePassword(UUID keycloakId, String realm, String newPassword) {
        Keycloak kc = getKeycloak(realm);
        UserResource userResource = kc.realm(realm).users().get(keycloakId.toString());
        CredentialRepresentation credential = new CredentialRepresentation();
        credential.setType(CredentialRepresentation.PASSWORD);
        credential.setValue(newPassword);
        credential.setTemporary(false);
        try {
            userResource.resetPassword(credential);
        } catch (jakarta.ws.rs.BadRequestException e) {
            // Keycloak's realm-level password policy rejected the value
            // (length / complexity / blacklist). Lift the exact reason out
            // of the response body so the FE can show it to the user
            // instead of a generic "An unexpected error occurred" toast.
            String reason = "Password rejected by Keycloak's policy.";
            try (jakarta.ws.rs.core.Response resp = e.getResponse()) {
                String body = resp.readEntity(String.class);
                if (body != null && !body.isBlank()) {
                    reason = body;
                }
            } catch (Exception ignore) { /* keep the default reason */ }
            log.warn("Keycloak rejected password change for kcId={} ({}): {}",
                    keycloakId, realm, reason);
            throw new com.payzo.backend.exception.PasswordPolicyException(
                    java.util.List.of(reason));
        }
        log.info("Changed password for Keycloak user: keycloakId={}, realm={}", keycloakId, realm);
    }

    public void setRequiredActionUpdatePassword(UUID keycloakId, String realm) {
        Keycloak kc = getKeycloak(realm);
        UserResource userResource = kc.realm(realm).users().get(keycloakId.toString());
        UserRepresentation user = userResource.toRepresentation();
        user.setRequiredActions(List.of("UPDATE_PASSWORD"));
        userResource.update(user);
        log.info("Set UPDATE_PASSWORD required action: keycloakId={}, realm={}", keycloakId, realm);
    }

    private void assignRealmRole(Keycloak kc, String realm, String userId, String roleName) {
        RealmResource realmResource = kc.realm(realm);
        RoleRepresentation role = realmResource.roles().get(roleName).toRepresentation();
        realmResource.users().get(userId).roles().realmLevel().add(List.of(role));
    }

    private Keycloak getKeycloak(String realm) {
        if (clientsRealm.equals(realm)) return clientsKeycloak;
        if (backofficeRealm.equals(realm)) return backofficeKeycloak;
        throw new IllegalArgumentException("Unknown realm: " + realm);
    }
}
