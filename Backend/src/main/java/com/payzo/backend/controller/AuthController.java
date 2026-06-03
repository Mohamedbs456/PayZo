package com.payzo.backend.controller;

import com.payzo.backend.domain.entity.Client;
import com.payzo.backend.domain.entity.User;
import com.payzo.backend.domain.enums.OtpChannel;
import com.payzo.backend.domain.enums.OtpPurpose;
import com.payzo.backend.domain.enums.UserStatus;
import com.payzo.backend.dto.request.auth.FirstLoginCompleteRequest;
import com.payzo.backend.dto.request.auth.ForgotPasswordResetRequest;
import com.payzo.backend.dto.request.auth.ForgotPasswordStartRequest;
import com.payzo.backend.dto.request.auth.ForgotPasswordVerifyRequest;
import com.payzo.backend.dto.request.auth.LoginOtpInitiateRequest;
import com.payzo.backend.dto.request.auth.OtpResendRequest;
import com.payzo.backend.dto.request.auth.OtpVerificationRequest;
import com.payzo.backend.dto.request.auth.PreviewLoginChannelsRequest;
import com.payzo.backend.dto.request.auth.RegistrationStep1Request;
import com.payzo.backend.dto.request.auth.RegistrationStep2Request;
import com.payzo.backend.dto.request.auth.ResolveClientIdentifierRequest;
import com.payzo.backend.dto.request.auth.SendRegistrationOtpRequest;
import com.payzo.backend.dto.response.auth.ForgotPasswordStartResponse;
import com.payzo.backend.dto.response.auth.ForgotPasswordTokenResponse;
import com.payzo.backend.dto.response.auth.PreviewLoginChannelsResponse;
import com.payzo.backend.dto.response.auth.RegistrationPreviewResponse;
import com.payzo.backend.dto.response.common.ApiResponse;
import com.payzo.backend.util.OtpDestinationMasker;
import com.payzo.backend.exception.AccountBlockedException;
import com.payzo.backend.exception.ResourceNotFoundException;
import com.payzo.backend.dto.client.ClientProfile;
import com.payzo.backend.repository.ClientRepository;
import com.payzo.backend.repository.UserRepository;
import com.payzo.backend.security.SecurityUtils;
import com.payzo.backend.service.audit.AuditService;
import com.payzo.backend.service.auth.OtpService;
import com.payzo.backend.service.auth.PasswordResetService;
import com.payzo.backend.service.auth.RegistrationService;
import com.payzo.backend.service.client.ClientProfileService;
import com.payzo.backend.service.integration.KeycloakAdminService;
import com.payzo.backend.util.PasswordPolicy;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/**
 * Unauthenticated entry points for both realms: registration (CIN-driven, two-step OTP),
 * login (ROPC + channel-scoped OTP per D27), forgot-password (D44 three-call flow), and
 * identifier resolution (D23, prevents CIN-vs-username enumeration). Every endpoint here
 * is permitAll in SecurityConfig.
 */
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final RegistrationService registrationService;
    private final OtpService otpService;
    private final PasswordResetService passwordResetService;
    private final UserRepository userRepository;
    private final ClientRepository clientRepository;
    private final ClientProfileService clientProfileService;
    private final SecurityUtils securityUtils;
    private final AuditService auditService;
    private final JwtDecoder clientsJwtDecoder;
    private final KeycloakAdminService keycloakAdminService;

    public AuthController(RegistrationService registrationService,
                          OtpService otpService,
                          PasswordResetService passwordResetService,
                          UserRepository userRepository,
                          ClientRepository clientRepository,
                          ClientProfileService clientProfileService,
                          SecurityUtils securityUtils,
                          AuditService auditService,
                          @Qualifier("clientsJwtDecoder") JwtDecoder clientsJwtDecoder,
                          KeycloakAdminService keycloakAdminService) {
        this.registrationService = registrationService;
        this.otpService = otpService;
        this.passwordResetService = passwordResetService;
        this.userRepository = userRepository;
        this.clientRepository = clientRepository;
        this.clientProfileService = clientProfileService;
        this.securityUtils = securityUtils;
        this.auditService = auditService;
        this.clientsJwtDecoder = clientsJwtDecoder;
        this.keycloakAdminService = keycloakAdminService;
    }

    @PostMapping("/register/step1")
    public ResponseEntity<ApiResponse<Void>> registerStep1(
            @Valid @RequestBody RegistrationStep1Request request) {
        registrationService.step1(request.getCin());
        return ResponseEntity.ok(ApiResponse.success("OTP sent", null));
    }

    /**
     * Signup step 1 — fetches the CIN's CBS profile so the
     * "Verify your identity" page can render a read-only preview.
     * <b>No OTP fires</b> — that happens after the user picks a
     * channel on {@code /signup/channel}.
     */
    @PostMapping("/register/preview")
    public ResponseEntity<ApiResponse<RegistrationPreviewResponse>> registerPreview(
            @Valid @RequestBody RegistrationStep1Request request) {
        return ResponseEntity.ok(ApiResponse.success("OK",
                registrationService.preview(request.getCin())));
    }

    /**
     * Signup step 2a — dispatches the registration OTP via the chosen
     * channel only. Same channel-scoped pattern as
     * {@code /login/initiate-otp}: never sprays to both email and SMS.
     */
    @PostMapping("/register/send-otp")
    public ResponseEntity<ApiResponse<Void>> registerSendOtp(
            @Valid @RequestBody SendRegistrationOtpRequest request) {
        registrationService.sendOtp(request.getCin(), request.getChannel());
        return ResponseEntity.ok(ApiResponse.success("OTP sent", null));
    }

    @PostMapping("/register/step2")
    public ResponseEntity<ApiResponse<Void>> registerStep2(
            @Valid @RequestBody RegistrationStep2Request request) {
        registrationService.step2(request.getCin(), request.getOtpCode());
        return ResponseEntity.ok(ApiResponse.success("Registration submitted. Pending admin approval.", null));
    }

    @GetMapping("/register/status/{cin}")
    public ResponseEntity<ApiResponse<Map<String, String>>> registerStatus(
            @PathVariable String cin) {
        UserStatus status = registrationService.getStatus(cin);
        return ResponseEntity.ok(ApiResponse.success("OK",
                Map.of("status", status.name())));
    }

    @PostMapping("/login/initiate-otp")
    public ResponseEntity<ApiResponse<Void>> loginInitiateOtp(
            @Valid @RequestBody LoginOtpInitiateRequest request) {

        User user = resolveUserFromAccessToken(request.getAccessToken());
        ContactChannels channels = resolveContactChannels(user);

        // Channel-scoped dispatch: pass the chosen recipient and null for
        // the other side. NotificationService.send skips null branches, so
        // exactly one transport (email OR SMS) fires per request.
        if (request.getChannel() == OtpChannel.EMAIL) {
            otpService.generate(user.getId().toString(), OtpPurpose.LOGIN,
                    channels.email(), null);
        } else {
            otpService.generate(user.getId().toString(), OtpPurpose.LOGIN,
                    null, channels.phone());
        }

        return ResponseEntity.ok(ApiResponse.success("OTP sent", null));
    }

    /**
     * Channel-chooser preview (D27, channel split). Decodes the just-minted
     * KC access token, looks the user up, and returns masked email/phone
     * strings for the picker. <b>No OTP is dispatched.</b>
     */
    @PostMapping("/login/preview-channels")
    public ResponseEntity<ApiResponse<PreviewLoginChannelsResponse>> previewLoginChannels(
            @Valid @RequestBody PreviewLoginChannelsRequest request) {

        User user = resolveUserFromAccessToken(request.getAccessToken());
        ContactChannels channels = resolveContactChannels(user);

        return ResponseEntity.ok(ApiResponse.success("OK",
                new PreviewLoginChannelsResponse(
                        user.getId(),
                        OtpDestinationMasker.maskEmail(channels.email()),
                        OtpDestinationMasker.maskPhone(channels.phone()))));
    }

    /**
     * Decode the access token, find the matching user, and assert the
     * account is in a state that can complete login (ACTIVE / ACCEPTED).
     * Used by both {@code /login/initiate-otp} and
     * {@code /login/preview-channels} so blocked/pending accounts get the
     * same 403 on either entry point.
     */
    private User resolveUserFromAccessToken(String accessToken) {
        Jwt jwt = clientsJwtDecoder.decode(accessToken);
        UUID keycloakId = UUID.fromString(jwt.getSubject());

        User user = userRepository.findByKeycloakId(keycloakId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        if (user.getStatus() == UserStatus.BLOCKED) {
            throw new AccountBlockedException("Your account has been suspended. Contact support.");
        }
        if (user.getStatus() != UserStatus.ACTIVE && user.getStatus() != UserStatus.ACCEPTED) {
            throw new AccountBlockedException("Your account is not active");
        }
        return user;
    }

    /**
     * Resolve email/phone for a user. Clients pull both from CBS via
     * {@code ClientProfileService} (Batch 9 — un-duplicated identity).
     * Staff carry them on the User row.
     */
    private ContactChannels resolveContactChannels(User user) {
        if (user instanceof Client client) {
            ClientProfile profile = clientProfileService.forClient(client);
            return new ContactChannels(profile.email(), profile.phone());
        }
        return new ContactChannels(user.getEmail(), user.getPhone());
    }

    private record ContactChannels(String email, String phone) {}

    @PostMapping("/login/verify-otp")
    public ResponseEntity<ApiResponse<Map<String, Boolean>>> loginVerifyOtp(
            @Valid @RequestBody OtpVerificationRequest request) {

        otpService.validate(request.getUserId().toString(), OtpPurpose.LOGIN,
                request.getOtpCode());

        return ResponseEntity.ok(ApiResponse.success("Login verified",
                Map.of("sessionConfirmed", true)));
    }

    @PostMapping("/otp/resend")
    public ResponseEntity<ApiResponse<Void>> resendOtp(
            @Valid @RequestBody OtpResendRequest request) {

        String email = null;
        String phone = null;

        if (request.getPurpose() == OtpPurpose.REGISTRATION) {
            Client client = clientRepository.findByCin(request.getIdentifier()).orElse(null);
            if (client != null) {
                ClientProfile profile = clientProfileService.forClient(client);
                email = profile.email();
                phone = profile.phone();
            }
        } else {
            try {
                UUID userId = UUID.fromString(request.getIdentifier());
                User user = userRepository.findById(userId).orElse(null);
                if (user instanceof Client client) {
                    ClientProfile profile = clientProfileService.forClient(client);
                    email = profile.email();
                    phone = profile.phone();
                } else if (user != null) {
                    email = user.getEmail();
                    phone = user.getPhone();
                }
            } catch (IllegalArgumentException ignored) {
                // identifier is not a UUID — lookup by other means if needed
            }
        }

        otpService.resend(request.getIdentifier(), request.getPurpose(), email, phone);

        return ResponseEntity.ok(ApiResponse.success("OTP resent", null));
    }

    /**
     * Pre-login resolver (D23): clients can type either their CIN or their PayZo
     * username; this endpoint translates whichever they typed into the value Keycloak
     * expects as the username. For clients, Keycloak's username is the CIN (set in
     * KeycloakAdminService.createClientUser), so we always return the CIN.
     *
     * Returns 404 if the identifier doesn't resolve to any client, or if the matching
     * client is not in ACTIVE / ACCEPTED status (so blocked / pending / rejected
     * accounts can't infer "this CIN exists" by trying to log in).
     */
    @PostMapping("/resolve-client-identifier")
    public ResponseEntity<ApiResponse<Map<String, String>>> resolveClientIdentifier(
            @Valid @RequestBody ResolveClientIdentifierRequest request) {

        String identifier = request.getIdentifier().trim();
        User user = userRepository.findByCinOrUsername(identifier)
                .orElseThrow(() -> new ResourceNotFoundException("No matching client"));

        if (!(user instanceof Client client)) {
            throw new ResourceNotFoundException("No matching client");
        }
        UserStatus status = client.getStatus();
        if (status != UserStatus.ACTIVE && status != UserStatus.ACCEPTED) {
            throw new ResourceNotFoundException("No matching client");
        }

        return ResponseEntity.ok(ApiResponse.success("OK",
                Map.of("keycloakUsername", client.getCin())));
    }

    // ── Forgot password (D44 / Impact 20) ─────────────────────────────────────
    // 3 unauthenticated endpoints. Errors are deliberately uniform (404) when a
    // CIN is unknown OR the matching account is not ACTIVE/ACCEPTED, to limit
    // account-existence enumeration.

    @PostMapping("/forgot-password/start")
    public ResponseEntity<ApiResponse<ForgotPasswordStartResponse>> forgotPasswordStart(
            @Valid @RequestBody ForgotPasswordStartRequest request) {
        ForgotPasswordStartResponse response = passwordResetService.start(request.getCin());
        return ResponseEntity.ok(ApiResponse.success("OTP sent", response));
    }

    @PostMapping("/forgot-password/verify-otp")
    public ResponseEntity<ApiResponse<ForgotPasswordTokenResponse>> forgotPasswordVerify(
            @Valid @RequestBody ForgotPasswordVerifyRequest request) {
        String token = passwordResetService.verifyOtp(request.getCin(), request.getOtpCode());
        return ResponseEntity.ok(ApiResponse.success("OTP verified",
                new ForgotPasswordTokenResponse(token)));
    }

    @PostMapping("/forgot-password/reset")
    public ResponseEntity<ApiResponse<Void>> forgotPasswordReset(
            @Valid @RequestBody ForgotPasswordResetRequest request) {
        passwordResetService.reset(request.getResetToken(), request.getNewPassword());
        return ResponseEntity.ok(ApiResponse.success("Password reset", null));
    }

    /**
     * Forced first-login password rotation (D45). The freshly-approved
     * client typed a new password into the un-dismissable modal on the
     * dashboard; this call:
     *   1. Validates the new password against {@link PasswordPolicy}.
     *   2. Pushes it into Keycloak (replacing the admin-issued temp
     *      credential) so the next ROPC succeeds with the new value.
     *   3. Flips {@code firstLoginCompleted=true} on the PayZo row so
     *      the modal never reappears.
     *
     * <p>Without step 2 the rotation is a no-op — the temp password
     * remains valid, which is exactly the dev-mode bug we hit before
     * wiring this up.
     */
    @PostMapping("/first-login-complete")
    public ResponseEntity<ApiResponse<Void>> firstLoginComplete(
            @Valid @RequestBody FirstLoginCompleteRequest request) {
        UUID keycloakId = securityUtils.getCurrentUserId();

        User user = userRepository.findByKeycloakId(keycloakId)
                .orElseThrow(() -> new ResourceNotFoundException("Client not found"));

        if (!(user instanceof Client client)) {
            throw new ResourceNotFoundException("Client not found");
        }
        if (client.getKeycloakId() == null) {
            throw new ResourceNotFoundException("Client has no Keycloak credentials");
        }

        PasswordPolicy.enforce(request.getNewPassword());

        // Push into Keycloak FIRST. If this throws (policy / 4xx /
        // network), we leave firstLoginCompleted=false so the modal
        // re-appears on the next dashboard load and the user can retry.
        keycloakAdminService.changePassword(client.getKeycloakId(), "clients",
                request.getNewPassword());

        client.setFirstLoginCompleted(true);
        client.setStatus(UserStatus.ACTIVE);
        clientRepository.save(client);

        auditService.writeLog(client.getId(), "CLIENT", "FIRST_LOGIN_COMPLETE",
                "USER", client.getId(), null);

        return ResponseEntity.ok(ApiResponse.success("First login completed", null));
    }
}
