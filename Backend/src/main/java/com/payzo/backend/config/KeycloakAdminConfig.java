package com.payzo.backend.config;

import org.keycloak.OAuth2Constants;
import org.keycloak.admin.client.Keycloak;
import org.keycloak.admin.client.KeycloakBuilder;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimNames;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;

import java.util.List;
import java.util.Set;

/** Two Keycloak admin clients (one per realm) plus the client-realm JWT decoder, using the service-account / client-credentials flow. */
@Configuration
public class KeycloakAdminConfig {

    @Value("${keycloak.auth-server-url}")
    private String authServerUrl;

    @Value("${keycloak.realms.clients.realm}")
    private String clientsRealm;

    @Value("${keycloak.realms.clients.client-id}")
    private String clientsClientId;

    @Value("${keycloak.realms.clients.client-secret}")
    private String clientsClientSecret;

    @Value("${keycloak.realms.backoffice.realm}")
    private String backofficeRealm;

    @Value("${keycloak.realms.backoffice.client-id}")
    private String backofficeClientId;

    @Value("${keycloak.realms.backoffice.client-secret}")
    private String backofficeClientSecret;

    @Bean
    public Keycloak clientsKeycloak() {
        return KeycloakBuilder.builder()
                .serverUrl(authServerUrl)
                .realm(clientsRealm)
                .clientId(clientsClientId)
                .clientSecret(clientsClientSecret)
                .grantType(OAuth2Constants.CLIENT_CREDENTIALS)
                .build();
    }

    @Bean("clientsJwtDecoder")
    public JwtDecoder clientsJwtDecoder() {
        // The FE may ROPC against either the Docker-internal Keycloak URL
        // (matches `keycloak.auth-server-url`) OR the host-side localhost
        // URL the browser hits on dev (matches the alias in SecurityConfig).
        // The decoder accepts whichever issuer the token carries; the JWK
        // set is always fetched via the Docker-internal URL because that's
        // the only one reachable from inside the container.
        String dockerIssuer = authServerUrl + "/realms/" + clientsRealm;
        Set<String> allowedIssuers = Set.of(
                dockerIssuer,
                "http://localhost:8080/realms/" + clientsRealm
        );
        NimbusJwtDecoder decoder = NimbusJwtDecoder
                .withJwkSetUri(dockerIssuer + "/protocol/openid-connect/certs")
                .build();
        OAuth2TokenValidator<Jwt> validator = new DelegatingOAuth2TokenValidator<>(
                JwtValidators.createDefault(),
                token -> {
                    String iss = token.getClaimAsString(JwtClaimNames.ISS);
                    if (iss != null && allowedIssuers.contains(iss)) {
                        return org.springframework.security.oauth2.core.OAuth2TokenValidatorResult.success();
                    }
                    return org.springframework.security.oauth2.core.OAuth2TokenValidatorResult.failure(
                            new org.springframework.security.oauth2.core.OAuth2Error(
                                    "invalid_issuer",
                                    "Issuer " + iss + " not in " + allowedIssuers,
                                    null));
                }
        );
        decoder.setJwtValidator(validator);
        return decoder;
    }

    @Bean
    public Keycloak backofficeKeycloak() {
        return KeycloakBuilder.builder()
                .serverUrl(authServerUrl)
                .realm(backofficeRealm)
                .clientId(backofficeClientId)
                .clientSecret(backofficeClientSecret)
                .grantType(OAuth2Constants.CLIENT_CREDENTIALS)
                .build();
    }
}
