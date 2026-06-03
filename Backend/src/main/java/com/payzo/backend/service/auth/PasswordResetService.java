package com.payzo.backend.service.auth;

import com.payzo.backend.domain.entity.Client;
import com.payzo.backend.domain.enums.OtpPurpose;
import com.payzo.backend.domain.enums.UserStatus;
import com.payzo.backend.exception.ConflictException;
import com.payzo.backend.exception.ResourceNotFoundException;
import com.payzo.backend.dto.client.ClientProfile;
import com.payzo.backend.dto.response.auth.ForgotPasswordStartResponse;
import com.payzo.backend.repository.ClientRepository;
import com.payzo.backend.service.audit.AuditService;
import com.payzo.backend.service.auth.PasswordResetTokenService.ResetClaims;
import com.payzo.backend.service.client.ClientProfileService;
import com.payzo.backend.service.integration.KeycloakAdminService;
import com.payzo.backend.util.OtpDestinationMasker;
import com.payzo.backend.util.PasswordPolicy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

/**
 * Three-step forgot-password flow (DECISIONS.md D44 / BACKEND_IMPACTS.md Impact 20):
 *
 *   1. {@link #start(String)}      — generate + dispatch OTP for a CIN
 *   2. {@link #verifyOtp(String, String)} — validate OTP, return short-lived reset token
 *   3. {@link #reset(String, String)}     — consume reset token, set new password,
 *                                           invalidate Keycloak sessions
 *
 * Each step returns a clean error envelope on failure (404 if CIN unknown, 400/429
 * for OTP problems via OtpService, 409 for token problems, 422 for policy violations).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PasswordResetService {

    private final ClientRepository clientRepository;
    private final OtpService otpService;
    private final PasswordResetTokenService tokenService;
    private final KeycloakAdminService keycloakAdminService;
    private final AuditService auditService;
    private final ClientProfileService clientProfileService;

    /**
     * Always returns 200 with a masked destination — anti-enumeration per
     * D44. Internally:
     * <ul>
     *   <li>Unknown CIN → silent no-op + placeholder destination.</li>
     *   <li>Client status != ACTIVE OR firstLoginCompleted=false →
     *       silent no-op + placeholder. Forgot-password is for users who
     *       already completed first-login; "Accepted but not yet
     *       Active" clients should finish their first-login rotation
     *       through the dashboard modal instead.</li>
     *   <li>Eligible (ACTIVE + firstLoginCompleted=true) → OTP fires
     *       via {@link OtpService} and the response carries the real
     *       masked email.</li>
     * </ul>
     */
    @Transactional
    public ForgotPasswordStartResponse start(String cin) {
        Optional<Client> opt = clientRepository.findByCin(cin);
        if (opt.isEmpty()) {
            log.info("Forgot-password: unknown CIN={} — silent 200", cin);
            return new ForgotPasswordStartResponse("EMAIL", "your registered email");
        }
        Client client = opt.get();
        if (client.getStatus() != UserStatus.ACTIVE || !client.isFirstLoginCompleted()) {
            log.info("Forgot-password: ineligible cin={}, status={}, firstLoginCompleted={} — silent 200",
                    cin, client.getStatus(), client.isFirstLoginCompleted());
            return new ForgotPasswordStartResponse("EMAIL", "your registered email");
        }

        ClientProfile profile = clientProfileService.forClient(client);
        otpService.generate(cin, OtpPurpose.PASSWORD_CHANGE,
                profile.email(), profile.phone());
        log.info("Forgot-password: OTP generated for cin={}", cin);

        String masked = OtpDestinationMasker.maskEmail(profile.email());
        return new ForgotPasswordStartResponse("EMAIL",
                masked != null ? masked : "your registered email");
    }

    @Transactional
    public String verifyOtp(String cin, String otpCode) {
        otpService.validate(cin, OtpPurpose.PASSWORD_CHANGE, otpCode);
        Client client = loadActiveClient(cin);
        String token = tokenService.mint(client.getId(), client.getCin());
        log.info("Forgot-password: reset token minted for cin={}", cin);
        return token;
    }

    @Transactional
    public void reset(String resetToken, String newPassword) {
        ResetClaims claims = tokenService.verify(resetToken);

        // Re-fetch the client by the token's userId — defends against the unlikely
        // case where the user has been deleted between OTP and reset.
        Client client = clientRepository.findById(claims.userId())
                .orElseThrow(() -> new ConflictException(
                        "Client no longer exists", "RESET_TOKEN_INVALID"));

        // Cross-check CIN: token claim must still match the DB row. CINs are
        // immutable in practice, so a mismatch indicates tampering or a stale token.
        if (!client.getCin().equals(claims.cin())) {
            throw new ConflictException("Reset token mismatch", "RESET_TOKEN_INVALID");
        }
        if (client.getStatus() != UserStatus.ACTIVE
                || !client.isFirstLoginCompleted()) {
            throw new ConflictException("Account is not eligible for password reset",
                    "ACCOUNT_NOT_ACTIVE");
        }
        if (client.getKeycloakId() == null) {
            throw new ConflictException("Account has no Keycloak credentials yet",
                    "ACCOUNT_NOT_PROVISIONED");
        }

        PasswordPolicy.enforce(newPassword);

        keycloakAdminService.changePassword(client.getKeycloakId(), "clients", newPassword);
        keycloakAdminService.invalidateUserSessions(client.getKeycloakId(), "clients");

        auditService.writeLog(client.getId(), "CLIENT", "PASSWORD_RESET",
                "USER", client.getId(), "via forgot-password");

        log.info("Forgot-password: completed for clientId={}, cin={}",
                client.getId(), client.getCin());
    }

    /**
     * Stricter than {@link #start}: by the time we get to verifyOtp /
     * reset, the client must be fully eligible. PENDING / REJECTED /
     * BLOCKED / first-login-not-completed all return a generic 404.
     */
    private Client loadActiveClient(String cin) {
        Client client = clientRepository.findByCin(cin)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "No client found for the provided CIN"));
        if (client.getStatus() != UserStatus.ACTIVE
                || !client.isFirstLoginCompleted()) {
            // Generic 404 — never reveal "this CIN is blocked" / "this CIN is pending".
            throw new ResourceNotFoundException("No client found for the provided CIN");
        }
        return client;
    }
}
