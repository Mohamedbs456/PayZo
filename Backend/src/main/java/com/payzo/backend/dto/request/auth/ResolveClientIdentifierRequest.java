package com.payzo.backend.dto.request.auth;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * Pre-login translation: takes a CIN or a PayZo username and returns the value the
 * frontend should pass to Keycloak as the username (D23). For clients, Keycloak's
 * username is always the CIN — see KeycloakAdminService.createClientUser.
 */
@Data
public class ResolveClientIdentifierRequest {

    @NotBlank
    private String identifier;
}
