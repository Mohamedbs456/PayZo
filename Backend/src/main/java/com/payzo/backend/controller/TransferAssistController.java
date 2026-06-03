package com.payzo.backend.controller;

import com.payzo.backend.domain.entity.Client;
import com.payzo.backend.dto.request.client.NameVerifyRequest;
import com.payzo.backend.dto.request.client.RibResolveRequest;
import com.payzo.backend.dto.request.client.UsernameResolveRequest;
import com.payzo.backend.dto.response.client.NameVerifyResponse;
import com.payzo.backend.dto.response.client.RibResolveResponse;
import com.payzo.backend.dto.response.client.UsernameResolveResponse;
import com.payzo.backend.dto.response.common.ApiResponse;
import com.payzo.backend.exception.ResourceNotFoundException;
import com.payzo.backend.repository.UserRepository;
import com.payzo.backend.security.SecurityUtils;
import com.payzo.backend.service.client.TransferAssistService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Pre-transfer assist endpoints: resolve a RIB to bank + masked-name hints, and
 * verify a typed name against CBS. Used by the new send-money UI to keep the
 * flow client-first (validate cheap things on input) before the heavier
 * {@code POST /transfers} call.
 */
@RestController
@RequestMapping("/api/v1/client/transfers")
@RequiredArgsConstructor
public class TransferAssistController {

    private final TransferAssistService assistService;
    private final SecurityUtils securityUtils;
    private final UserRepository userRepository;

    @PostMapping("/resolve-rib")
    public ResponseEntity<ApiResponse<RibResolveResponse>> resolveRib(
            @Valid @RequestBody RibResolveRequest request) {
        UUID clientId = resolveClientId();
        RibResolveResponse data = assistService.resolveRib(clientId, request.getRib());
        return ResponseEntity.ok(ApiResponse.success("OK", data));
    }

    @PostMapping("/verify-name")
    public ResponseEntity<ApiResponse<NameVerifyResponse>> verifyName(
            @Valid @RequestBody NameVerifyRequest request) {
        UUID clientId = resolveClientId();
        NameVerifyResponse data = assistService.verifyName(
                clientId, request.getRib(), request.getFirstName(), request.getLastName());
        return ResponseEntity.ok(ApiResponse.success("OK", data));
    }

    @PostMapping("/resolve-username")
    public ResponseEntity<ApiResponse<UsernameResolveResponse>> resolveUsername(
            @Valid @RequestBody UsernameResolveRequest request) {
        UUID clientId = resolveClientId();
        UsernameResolveResponse data = assistService.resolveUsername(clientId, request.getUsername());
        return ResponseEntity.ok(ApiResponse.success("OK", data));
    }

    private UUID resolveClientId() {
        UUID keycloakId = securityUtils.getCurrentUserId();
        return userRepository.findByKeycloakId(keycloakId)
                .filter(u -> u instanceof Client)
                .orElseThrow(() -> new ResourceNotFoundException("Client not found"))
                .getId();
    }
}
