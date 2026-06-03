package com.payzo.backend.service.me;

import com.payzo.backend.domain.entity.User;
import com.payzo.backend.domain.enums.OtpPurpose;
import com.payzo.backend.domain.enums.Role;
import com.payzo.backend.dto.response.me.BoMeResponse;
import com.payzo.backend.exception.ConflictException;
import com.payzo.backend.exception.ResourceNotFoundException;
import com.payzo.backend.repository.UserRepository;
import com.payzo.backend.service.audit.AuditService;
import com.payzo.backend.service.auth.OtpService;
import com.payzo.backend.service.integration.KeycloakAdminService;
import com.payzo.backend.util.PasswordPolicy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Set;
import java.util.UUID;

/**
 * Backoffice "me" service. Owns the lifecycle for the in-profile password
 * change OTP flow (D45 / Impact 21):
 *
 *   1. {@link #initiatePasswordChange(UUID, String)} — verify current
 *      password against the backoffice realm and generate an OTP. Email
 *      delivery is wired into the existing OtpService dev/log path; once
 *      the email channel ships, the OTP will land in the user's inbox.
 *   2. {@link #confirmPasswordChange(UUID, String, String)} — validate the
 *      OTP, run the policy, set the new password in Keycloak, and log the
 *      user out of all sessions so they re-authenticate with the new one.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class BoMeService {

    private static final String BACKOFFICE_REALM = "backoffice";

    // Same constraints the client-side `/api/v1/client/profile/picture`
    // enforces — kept in sync intentionally so both surfaces share a
    // single rule set (5 MB cap, JPEG/PNG/WEBP only).
    private static final Set<String> ALLOWED_CONTENT_TYPES = Set.of(
            "image/jpeg", "image/png", "image/webp");
    private static final long MAX_FILE_SIZE = 5L * 1024 * 1024;

    private final UserRepository userRepository;
    private final KeycloakAdminService keycloakAdminService;
    private final OtpService otpService;
    private final AuditService auditService;

    @Value("${uploads.path}")
    private String uploadsPath;

    @Transactional(readOnly = true)
    public BoMeResponse getMe(UUID userId) {
        User user = loadBackofficeUser(userId);
        return BoMeResponse.builder()
                .userId(user.getId())
                .keycloakId(user.getKeycloakId())
                .username(user.getUsername())
                .firstName(user.getFirstName())
                .lastName(user.getLastName())
                .email(user.getEmail())
                .phone(user.getPhone())
                .governorate(user.getGovernorate())
                .address(user.getAddress())
                .dateOfBirth(user.getDateOfBirth())
                .profilePictureUrl(user.getProfilePictureUrl())
                .role(user.getRole())
                .status(user.getStatus())
                .createdAt(user.getCreatedAt())
                .updatedAt(user.getUpdatedAt())
                .firstLoginCompleted(user.isFirstLoginCompleted())
                .build();
    }

    @Transactional
    public void initiatePasswordChange(UUID userId, String currentPassword) {
        User user = loadBackofficeUser(userId);

        if (user.getKeycloakId() == null || user.getUsername() == null) {
            throw new ConflictException("Account has no Keycloak credentials yet",
                    "ACCOUNT_NOT_PROVISIONED");
        }

        if (!keycloakAdminService.verifyBackofficePassword(user.getUsername(), currentPassword)) {
            throw new ConflictException("Current password is incorrect",
                    "INVALID_CURRENT_PASSWORD");
        }

        // Identifier scoped to the user's UUID — same convention as LOGIN /
        // TRANSFER_CONFIRMATION OTPs (per OtpToken doc on the entity).
        otpService.generate(user.getId().toString(), OtpPurpose.PASSWORD_CHANGE,
                user.getEmail(), user.getPhone());

        log.info("BO password-change OTP generated for userId={}", userId);
    }

    /**
     * One-shot rotation for the forced first-login modal. No OTP, no
     * current-password check — the JWT in the request already proves the
     * caller just authenticated with the temp password we emailed at
     * account creation. Rejects with 409 if {@code firstLoginCompleted}
     * is already true (this endpoint is single-use per user).
     */
    @Transactional
    public void firstLoginPasswordChange(UUID userId, String newPassword) {
        User user = loadBackofficeUser(userId);

        if (user.getKeycloakId() == null) {
            throw new ConflictException("Account has no Keycloak credentials yet",
                    "ACCOUNT_NOT_PROVISIONED");
        }
        if (user.isFirstLoginCompleted()) {
            throw new ConflictException("First-login rotation already done — use the "
                    + "OTP-based change-password flow instead.",
                    "FIRST_LOGIN_ALREADY_COMPLETED");
        }

        PasswordPolicy.enforce(newPassword);
        keycloakAdminService.changePassword(user.getKeycloakId(), BACKOFFICE_REALM, newPassword);

        user.setFirstLoginCompleted(true);
        userRepository.save(user);

        auditService.writeLog(user.getId(), user.getRole().name(), "PASSWORD_CHANGED",
                "USER", user.getId(), "first-login forced rotation");

        log.info("BO first-login password rotated for userId={}", userId);
    }

    @Transactional
    public void confirmPasswordChange(UUID userId, String otp, String newPassword) {
        User user = loadBackofficeUser(userId);

        if (user.getKeycloakId() == null) {
            throw new ConflictException("Account has no Keycloak credentials yet",
                    "ACCOUNT_NOT_PROVISIONED");
        }

        otpService.validate(user.getId().toString(), OtpPurpose.PASSWORD_CHANGE, otp);
        PasswordPolicy.enforce(newPassword);

        keycloakAdminService.changePassword(user.getKeycloakId(), BACKOFFICE_REALM, newPassword);
        keycloakAdminService.invalidateUserSessions(user.getKeycloakId(), BACKOFFICE_REALM);

        // First-login workflow: the modal auto-opens for users with
        // firstLoginCompleted=false. After they successfully rotate the
        // emailed temp password it should never auto-open again.
        if (!user.isFirstLoginCompleted()) {
            user.setFirstLoginCompleted(true);
            userRepository.save(user);
        }

        auditService.writeLog(user.getId(), user.getRole().name(), "PASSWORD_CHANGED",
                "USER", user.getId(), "in-profile change");

        log.info("BO password changed in-profile for userId={}", userId);
    }

    /**
     * Saves an uploaded profile picture to the shared uploads volume,
     * overwriting any previous file for this user. Mirrors the client-side
     * flow at {@code PUT /api/v1/client/profile/picture}. Returns the
     * publicly-served URL the FE should set on its avatar.
     */
    @Transactional
    public String updateProfilePicture(UUID userId, MultipartFile file) {
        User user = loadBackofficeUser(userId);

        if (file == null || file.isEmpty()) {
            throw new ConflictException("File is empty", "INVALID_FILE");
        }
        if (file.getSize() > MAX_FILE_SIZE) {
            throw new ConflictException("File exceeds 5 MB limit", "FILE_TOO_LARGE");
        }
        if (!ALLOWED_CONTENT_TYPES.contains(file.getContentType())) {
            throw new ConflictException("Only JPEG, PNG, and WEBP are allowed",
                    "INVALID_FILE_TYPE");
        }

        try {
            Path uploadDir = Paths.get(uploadsPath, "profile-pictures");
            Files.createDirectories(uploadDir);
            // Filename keyed by userId so an upload always replaces the prior
            // file — no orphaned old pictures lingering in the volume.
            String filename = userId + ".jpg";
            Path target = uploadDir.resolve(filename);
            Files.copy(file.getInputStream(), target, StandardCopyOption.REPLACE_EXISTING);

            // Cache-bust query string so the browser doesn't keep showing
            // the previous avatar after an upload (the URL itself is
            // stable per-user, otherwise we'd never get a refresh).
            String url = "/api/v1/uploads/profile-pictures/" + filename
                    + "?v=" + System.currentTimeMillis();
            user.setProfilePictureUrl(url);
            userRepository.save(user);

            log.info("BO profile picture updated for userId={}", userId);
            return url;
        } catch (IOException e) {
            throw new RuntimeException("Failed to save profile picture", e);
        }
    }

    private User loadBackofficeUser(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found: " + userId));
        if (user.getRole() == Role.CLIENT) {
            // Defence-in-depth — the security layer should already have stopped
            // CLIENT principals from hitting /api/v1/me/**, but if a JWT slips
            // through we don't want to leak a BO-shaped response.
            throw new ConflictException("Endpoint reserved for backoffice users",
                    "NOT_BACKOFFICE_USER");
        }
        return user;
    }
}
