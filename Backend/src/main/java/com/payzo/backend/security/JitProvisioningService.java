package com.payzo.backend.security;

import com.payzo.backend.domain.entity.SuperAdmin;
import com.payzo.backend.domain.enums.Role;
import com.payzo.backend.domain.enums.UserStatus;
import com.payzo.backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Just-in-time provisioning for SuperAdmin users.
 *
 * SuperAdmins are created manually in Keycloak (never through the app), so
 * after a volume wipe there is no row in `users` despite a valid JWT. Rather
 * than polling Keycloak Admin API, we create the DB row on the first
 * authenticated request using claims that are already in the JWT.
 *
 * Admin and Analyst users are explicitly invited and must already exist —
 * those are NOT auto-provisioned here.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class JitProvisioningService {

    private final UserRepository userRepository;

    /** Returns true if the JWT carries the SUPERADMIN realm role. */
    public static boolean hasSuperAdminRole(Jwt jwt) {
        Map<String, Object> realmAccess = jwt.getClaim("realm_access");
        if (realmAccess == null) return false;
        Object rolesObj = realmAccess.get("roles");
        if (!(rolesObj instanceof List<?> roles)) return false;
        return roles.contains("SUPERADMIN");
    }

    /**
     * Creates a SuperAdmin row in `users` from the JWT claims if one does not
     * already exist for this keycloakId. Idempotent — safe to call multiple times.
     */
    @Transactional
    public void provisionSuperAdmin(Jwt jwt) {
        UUID keycloakId = UUID.fromString(jwt.getSubject());

        if (userRepository.findByKeycloakId(keycloakId).isPresent()) return;

        String username  = jwt.getClaimAsString("preferred_username");
        String email     = jwt.getClaimAsString("email");
        String firstName = jwt.getClaimAsString("given_name");
        String lastName  = jwt.getClaimAsString("family_name");

        SuperAdmin sa = new SuperAdmin();
        sa.setKeycloakId(keycloakId);
        sa.setUsername(username != null ? username : "superadmin");
        sa.setEmail(email != null ? email : username + "@payzo.local");
        sa.setFirstName(firstName != null ? firstName : "Super");
        sa.setLastName(lastName  != null ? lastName  : "Admin");
        sa.setRole(Role.SUPERADMIN);
        sa.setStatus(UserStatus.ACTIVE);

        userRepository.save(sa);
        log.info("JIT provisioned SuperAdmin: keycloakId={} username={}", keycloakId, sa.getUsername());
    }
}
