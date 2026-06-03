package com.payzo.backend.service;

import com.payzo.backend.domain.entity.Client;
import com.payzo.backend.domain.enums.OtpPurpose;
import com.payzo.backend.domain.enums.UserStatus;
import com.payzo.backend.dto.client.ClientProfile;
import com.payzo.backend.exception.ConflictException;
import com.payzo.backend.exception.PasswordPolicyException;
import com.payzo.backend.exception.ResourceNotFoundException;
import com.payzo.backend.repository.ClientRepository;
import com.payzo.backend.service.audit.AuditService;
import com.payzo.backend.service.auth.OtpService;
import com.payzo.backend.service.auth.PasswordResetService;
import com.payzo.backend.service.auth.PasswordResetTokenService;
import com.payzo.backend.service.auth.PasswordResetTokenService.ResetClaims;
import com.payzo.backend.service.client.ClientProfileService;
import com.payzo.backend.service.integration.KeycloakAdminService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import com.payzo.backend.dto.response.auth.ForgotPasswordStartResponse;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PasswordResetServiceTest {

    @Mock private ClientRepository clientRepository;
    @Mock private OtpService otpService;
    @Mock private PasswordResetTokenService tokenService;
    @Mock private KeycloakAdminService keycloakAdminService;
    @Mock private AuditService auditService;
    @Mock private ClientProfileService clientProfileService;

    @InjectMocks
    private PasswordResetService passwordResetService;

    private static final String CIN = "12345678";
    private static final ClientProfile STUB_PROFILE = new ClientProfile(
            UUID.randomUUID(), null, CIN, "user", "Sara", "Mansouri",
            null, 50, null, null, false,
            "sara@payzo.tn", "+21622145678", null, null, null);

    // ── start ──────────────────────────────────────────────────────────────────

    @Test
    void start_generatesOtp_forActiveClient() {
        Client client = activeClient();
        when(clientRepository.findByCin(CIN)).thenReturn(Optional.of(client));
        when(clientProfileService.forClient(client)).thenReturn(STUB_PROFILE);

        ForgotPasswordStartResponse response = passwordResetService.start(CIN);

        verify(otpService).generate(eq(CIN), eq(OtpPurpose.PASSWORD_CHANGE),
                eq(STUB_PROFILE.email()), eq(STUB_PROFILE.phone()));
        assertThat(response.getDeliveryChannel()).isEqualTo("EMAIL");
    }

    @Test
    void start_silentNoOp_whenCinUnknown() {
        // Anti-enumeration per D44: always 200 with a placeholder masked
        // destination, even when the CIN doesn't exist. No OTP fires.
        when(clientRepository.findByCin(CIN)).thenReturn(Optional.empty());

        ForgotPasswordStartResponse response = passwordResetService.start(CIN);

        assertThat(response.getMaskedDestination()).isEqualTo("your registered email");
        verify(otpService, never()).generate(any(), any(), any(), any());
    }

    @Test
    void start_silentNoOp_whenAccountIsBlocked() {
        Client client = activeClient();
        client.setStatus(UserStatus.BLOCKED);
        when(clientRepository.findByCin(CIN)).thenReturn(Optional.of(client));

        ForgotPasswordStartResponse response = passwordResetService.start(CIN);

        assertThat(response.getMaskedDestination()).isEqualTo("your registered email");
        verify(otpService, never()).generate(any(), any(), any(), any());
    }

    @Test
    void start_silentNoOp_whenAccountIsPending() {
        Client client = activeClient();
        client.setStatus(UserStatus.PENDING);
        when(clientRepository.findByCin(CIN)).thenReturn(Optional.of(client));

        ForgotPasswordStartResponse response = passwordResetService.start(CIN);

        assertThat(response.getMaskedDestination()).isEqualTo("your registered email");
        verify(otpService, never()).generate(any(), any(), any(), any());
    }

    @Test
    void start_silentNoOp_whenFirstLoginNotCompleted() {
        // ACTIVE but firstLoginCompleted=false ("Accepted" UX state) — the
        // user should complete first-login through the dashboard modal,
        // not via forgot-password. No OTP should fire.
        Client client = activeClient();
        client.setFirstLoginCompleted(false);
        when(clientRepository.findByCin(CIN)).thenReturn(Optional.of(client));

        ForgotPasswordStartResponse response = passwordResetService.start(CIN);

        assertThat(response.getMaskedDestination()).isEqualTo("your registered email");
        verify(otpService, never()).generate(any(), any(), any(), any());
    }

    // ── verifyOtp ──────────────────────────────────────────────────────────────

    @Test
    void verifyOtp_returnsResetToken_onValidOtp() {
        Client client = activeClient();
        when(clientRepository.findByCin(CIN)).thenReturn(Optional.of(client));
        when(tokenService.mint(client.getId(), CIN)).thenReturn("token-123");

        String token = passwordResetService.verifyOtp(CIN, "123456");

        assertThat(token).isEqualTo("token-123");
        verify(otpService).validate(CIN, OtpPurpose.PASSWORD_CHANGE, "123456");
    }

    // ── reset ──────────────────────────────────────────────────────────────────

    @Test
    void reset_setsKeycloakPassword_andInvalidatesSessions() {
        Client client = activeClient();
        ResetClaims claims = new ResetClaims(client.getId(), CIN);
        when(tokenService.verify("good-token")).thenReturn(claims);
        when(clientRepository.findById(client.getId())).thenReturn(Optional.of(client));

        passwordResetService.reset("good-token", "New@Password1234");

        verify(keycloakAdminService).changePassword(client.getKeycloakId(), "clients", "New@Password1234");
        verify(keycloakAdminService).invalidateUserSessions(client.getKeycloakId(), "clients");
        verify(auditService).writeLog(eq(client.getId()), eq("CLIENT"), eq("PASSWORD_RESET"),
                eq("USER"), eq(client.getId()), any());
    }

    @Test
    void reset_rejectsWeakPassword_withPolicyException() {
        Client client = activeClient();
        ResetClaims claims = new ResetClaims(client.getId(), CIN);
        when(tokenService.verify("good-token")).thenReturn(claims);
        when(clientRepository.findById(client.getId())).thenReturn(Optional.of(client));

        assertThatThrownBy(() -> passwordResetService.reset("good-token", "weak"))
                .isInstanceOf(PasswordPolicyException.class);

        verify(keycloakAdminService, never()).changePassword(any(), any(), any());
        verify(keycloakAdminService, never()).invalidateUserSessions(any(), any());
    }

    @Test
    void reset_throwsConflict_whenCinClaimMismatchesDb() {
        Client client = activeClient();
        ResetClaims claims = new ResetClaims(client.getId(), "WRONGCIN");
        when(tokenService.verify("good-token")).thenReturn(claims);
        when(clientRepository.findById(client.getId())).thenReturn(Optional.of(client));

        assertThatThrownBy(() -> passwordResetService.reset("good-token", "Strong@1"))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("mismatch");
    }

    @Test
    void reset_throwsConflict_whenClientStatusBlocked() {
        Client client = activeClient();
        client.setStatus(UserStatus.BLOCKED);
        ResetClaims claims = new ResetClaims(client.getId(), CIN);
        when(tokenService.verify("good-token")).thenReturn(claims);
        when(clientRepository.findById(client.getId())).thenReturn(Optional.of(client));

        assertThatThrownBy(() -> passwordResetService.reset("good-token", "Strong@1"))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("not eligible");
    }

    @Test
    void reset_throwsConflict_whenClientHasNoKeycloakId() {
        Client client = activeClient();
        client.setKeycloakId(null);
        ResetClaims claims = new ResetClaims(client.getId(), CIN);
        when(tokenService.verify("good-token")).thenReturn(claims);
        when(clientRepository.findById(client.getId())).thenReturn(Optional.of(client));

        assertThatThrownBy(() -> passwordResetService.reset("good-token", "Strong@1"))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("Keycloak credentials");
    }

    @Test
    void reset_throwsConflict_whenUserVanishedAfterTokenIssue() {
        UUID userId = UUID.randomUUID();
        ResetClaims claims = new ResetClaims(userId, CIN);
        when(tokenService.verify("good-token")).thenReturn(claims);
        when(clientRepository.findById(userId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> passwordResetService.reset("good-token", "Strong@1"))
                .isInstanceOf(ConflictException.class);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private Client activeClient() {
        Client c = new Client();
        c.setId(UUID.randomUUID());
        c.setCin(CIN);
        c.setEmail("client@payzo.tn");
        c.setPhone("+21650000000");
        c.setStatus(UserStatus.ACTIVE);
        c.setKeycloakId(UUID.randomUUID());
        // Forgot-password is gated to fully-bootstrapped clients (post
        // first-login). The fixture mirrors that contract.
        c.setFirstLoginCompleted(true);
        return c;
    }

    private static org.assertj.core.api.AbstractStringAssert<?> assertThat(String value) {
        return org.assertj.core.api.Assertions.assertThat(value);
    }
}
