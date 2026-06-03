package com.payzo.backend.controller;

import com.payzo.backend.dto.request.me.ConfirmPasswordChangeRequest;
import com.payzo.backend.dto.request.me.FirstLoginPasswordRequest;
import com.payzo.backend.dto.request.me.InitiatePasswordChangeRequest;
import com.payzo.backend.dto.response.common.ApiResponse;
import com.payzo.backend.dto.response.me.BoMeResponse;
import com.payzo.backend.exception.ResourceNotFoundException;
import com.payzo.backend.repository.UserRepository;
import com.payzo.backend.security.SecurityUtils;
import com.payzo.backend.service.me.BoMeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;
import java.util.UUID;

/**
 * Backoffice "/me" endpoints — the BO-side counterpart of {@link MeController}
 * (which is locked to CLIENT). Wired to the BoMeService for:
 *
 *   GET    /api/v1/me                    → live profile payload
 *   POST   /api/v1/me/password/initiate  → step 1 of the OTP flow (D45)
 *   PATCH  /api/v1/me/password           → step 2 — verify OTP + rotate password
 *
 * Authorisation is handled in SecurityConfig:
 *   /api/v1/me/** → ADMIN | ANALYST | SUPERADMIN.
 */
@RestController
@RequestMapping("/api/v1/me")
@RequiredArgsConstructor
public class BoMeController {

    private final BoMeService boMeService;
    private final SecurityUtils securityUtils;
    private final UserRepository userRepository;

    @GetMapping
    public ResponseEntity<ApiResponse<BoMeResponse>> me() {
        BoMeResponse response = boMeService.getMe(resolveUserId());
        return ResponseEntity.ok(ApiResponse.success("OK", response));
    }

    @PostMapping("/password/initiate")
    public ResponseEntity<ApiResponse<Void>> initiatePasswordChange(
            @Valid @RequestBody InitiatePasswordChangeRequest request) {
        boMeService.initiatePasswordChange(resolveUserId(), request.getCurrentPassword());
        return ResponseEntity.ok(ApiResponse.success("OTP sent", null));
    }

    @PatchMapping("/password")
    public ResponseEntity<ApiResponse<Void>> confirmPasswordChange(
            @Valid @RequestBody ConfirmPasswordChangeRequest request) {
        boMeService.confirmPasswordChange(resolveUserId(),
                request.getOtp(), request.getNewPassword());
        return ResponseEntity.ok(ApiResponse.success("Password changed", null));
    }

    /**
     * One-shot rotation used by the forced first-login modal. No OTP, no
     * current-password verification — the JWT proves the caller just
     * authenticated with the emailed temp password. The service rejects
     * subsequent calls (409) once {@code firstLoginCompleted=true}.
     */
    @PatchMapping("/password/first-login")
    public ResponseEntity<ApiResponse<Void>> firstLoginPasswordChange(
            @Valid @RequestBody FirstLoginPasswordRequest request) {
        boMeService.firstLoginPasswordChange(resolveUserId(), request.getNewPassword());
        return ResponseEntity.ok(ApiResponse.success("Password set", null));
    }

    /**
     * Profile-picture upload — multipart/form-data with field "file".
     * Mirrors the client-side {@code PUT /api/v1/client/profile/picture}.
     * Limits: 5 MB, JPEG/PNG/WEBP. Replaces any previous file in place.
     */
    @PutMapping(value = "/picture", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<Map<String, String>>> updateProfilePicture(
            @RequestParam("file") MultipartFile file) {
        String url = boMeService.updateProfilePicture(resolveUserId(), file);
        return ResponseEntity.ok(ApiResponse.success("Profile picture updated",
                Map.of("profilePictureUrl", url)));
    }

    private UUID resolveUserId() {
        UUID keycloakId = securityUtils.getCurrentUserId();
        return userRepository.findByKeycloakId(keycloakId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"))
                .getId();
    }
}
