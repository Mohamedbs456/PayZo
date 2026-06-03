package com.payzo.backend.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.payzo.backend.domain.enums.UserStatus;
import com.payzo.backend.dto.response.common.ApiResponse;
import com.payzo.backend.repository.UserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

/** Per-request guard that checks {@code UserStatus} from a 30s Caffeine cache and returns 403 when the user is BLOCKED, JIT-provisioning SuperAdmins from Keycloak. */
@Component
@Slf4j
public class BlockedUserFilter extends OncePerRequestFilter {

    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;
    private final JitProvisioningService jitProvisioningService;

    /** Caches keycloakId → UserStatus for 30 seconds to avoid per-request DB hits. */
    private final Cache<UUID, UserStatus> statusCache = Caffeine.newBuilder()
            .maximumSize(10_000)
            .expireAfterWrite(30, TimeUnit.SECONDS)
            .build();

    public BlockedUserFilter(UserRepository userRepository, ObjectMapper objectMapper,
                             JitProvisioningService jitProvisioningService) {
        this.userRepository = userRepository;
        this.objectMapper = objectMapper;
        this.jitProvisioningService = jitProvisioningService;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        if (authentication instanceof JwtAuthenticationToken jwtAuth) {
            UUID keycloakId = UUID.fromString(jwtAuth.getToken().getSubject());

            UserStatus status = statusCache.get(keycloakId, id ->
                    userRepository.findByKeycloakId(id)
                            .map(u -> u.getStatus())
                            .orElse(null)
            );

            if (status == null) {
                // User not in DB yet. SuperAdmins are created manually in Keycloak so
                // provision them on first request rather than requiring a backend restart.
                if (JitProvisioningService.hasSuperAdminRole(jwtAuth.getToken())) {
                    jitProvisioningService.provisionSuperAdmin(jwtAuth.getToken());
                    statusCache.put(keycloakId, UserStatus.ACTIVE);
                } else {
                    SecurityContextHolder.clearContext();
                    response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                    objectMapper.writeValue(response.getOutputStream(),
                            ApiResponse.error("Account not found. Contact your administrator.", "USER_NOT_FOUND"));
                    return;
                }
            } else if (status == UserStatus.BLOCKED) {
                SecurityContextHolder.clearContext();
                response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                objectMapper.writeValue(response.getOutputStream(),
                        ApiResponse.error("Your account has been suspended. Contact support.", "USER_BLOCKED"));
                return;
            }
        }

        filterChain.doFilter(request, response);
    }

    /** Call this when a user's status changes (block/unblock) to invalidate the cache immediately. */
    public void evictUser(UUID keycloakId) {
        statusCache.invalidate(keycloakId);
    }
}
