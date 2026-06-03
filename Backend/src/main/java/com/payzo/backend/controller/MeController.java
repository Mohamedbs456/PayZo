package com.payzo.backend.controller;

import com.payzo.backend.domain.entity.Client;
import com.payzo.backend.dto.request.client.ChangePasswordRequest;
import com.payzo.backend.dto.response.common.ApiResponse;
import com.payzo.backend.exception.ResourceNotFoundException;
import com.payzo.backend.repository.UserRepository;
import com.payzo.backend.security.SecurityUtils;
import com.payzo.backend.service.client.ClientService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * "/api/v1/clients/me/..." endpoints — actions a logged-in client takes on their
 * own account. Per DECISIONS.md D45 / BACKEND_IMPACTS.md Impact 21 the in-profile
 * password change moved here, replacing the old OTP-based
 * {@code /api/v1/client/profile/password/initiate} + {@code /confirm} pair.
 */
@RestController
@RequestMapping("/api/v1/clients/me")
@RequiredArgsConstructor
public class MeController {

    private final ClientService clientService;
    private final SecurityUtils securityUtils;
    private final UserRepository userRepository;

    @PatchMapping("/password")
    public ResponseEntity<ApiResponse<Void>> changePassword(
            @Valid @RequestBody ChangePasswordRequest request) {
        UUID clientId = resolveClientId();
        clientService.changePassword(clientId,
                request.getCurrentPassword(), request.getNewPassword());
        return ResponseEntity.ok(ApiResponse.success("Password changed", null));
    }

    private UUID resolveClientId() {
        UUID keycloakId = securityUtils.getCurrentUserId();
        return userRepository.findByKeycloakId(keycloakId)
                .filter(u -> u instanceof Client)
                .orElseThrow(() -> new ResourceNotFoundException("Client not found"))
                .getId();
    }
}
