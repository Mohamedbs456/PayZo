package com.payzo.backend.config;

import com.payzo.backend.security.BlockedUserFilter;
import com.payzo.backend.security.JwtAuthenticationConverter;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.AuthenticationManagerResolver;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationProvider;
import org.springframework.security.oauth2.server.resource.authentication.JwtIssuerAuthenticationManagerResolver;
import org.springframework.security.oauth2.server.resource.web.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import jakarta.servlet.http.HttpServletRequest;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Multi-issuer JWT setup: one AuthenticationManager per realm (clients + backoffice),
 * plus aliases that accept tokens whose iss claim points at localhost:8080 (the Vite
 * dev origin) while still fetching JWKs via the Docker-internal Keycloak URL.
 * BlockedUserFilter runs after BearerTokenAuthenticationFilter so it sees the
 * validated subject. CORS is locked to ports 5173 and 5174.
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final BlockedUserFilter blockedUserFilter;
    private final JwtAuthenticationConverter jwtAuthenticationConverter;

    @Value("${keycloak.auth-server-url}")
    private String keycloakBaseUrl;

    @Value("${keycloak.realms.clients.realm}")
    private String clientsRealm;

    @Value("${keycloak.realms.backoffice.realm}")
    private String backofficeRealm;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .csrf(csrf -> csrf.disable())
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(
                                "/api/v1/auth/register/**",
                                "/api/v1/auth/login/**",
                                "/api/v1/auth/otp/**",
                                "/api/v1/auth/resolve-client-identifier",
                                "/api/v1/auth/forgot-password/**"
                        ).permitAll()
                        .requestMatchers("/actuator/health").permitAll()
                        .requestMatchers("/swagger-ui/**", "/swagger-ui.html", "/v3/api-docs/**").permitAll()
                        .requestMatchers("/api/v1/uploads/**").permitAll()
                        .requestMatchers("/api/v1/client/**").hasRole("CLIENT")
                        .requestMatchers("/api/v1/clients/me/**").hasRole("CLIENT")
                        .requestMatchers("/api/v1/users/**").hasRole("CLIENT")
                        .requestMatchers("/api/v1/admin/**").hasAnyRole("ADMIN", "SUPERADMIN")
                        .requestMatchers("/api/v1/analyst/**").hasAnyRole("ANALYST", "SUPERADMIN")
                        .requestMatchers("/api/v1/superadmin/**").hasRole("SUPERADMIN")
                        // Cancel-pending is a SuperAdmin override on a stuck alert (Impact 8e)
                        .requestMatchers(org.springframework.http.HttpMethod.DELETE,
                                "/api/v1/fraud-alerts/*/cancel-pending").hasRole("SUPERADMIN")
                        // Approve / reject / list / detail are open to ANALYST + SUPERADMIN
                        .requestMatchers("/api/v1/fraud-alerts/**").hasAnyRole("ANALYST", "SUPERADMIN")
                        // Backoffice transactions list/detail
                        .requestMatchers("/api/v1/transactions/**")
                                .hasAnyRole("ADMIN", "ANALYST", "SUPERADMIN")
                        // Backoffice cursor-paginated notification feed (Impact 26)
                        .requestMatchers("/api/v1/backoffice/notifications/**")
                                .hasAnyRole("ADMIN", "ANALYST", "SUPERADMIN")
                        // Backoffice "me" — profile + in-profile password change OTP flow.
                        .requestMatchers("/api/v1/me/**")
                                .hasAnyRole("ADMIN", "ANALYST", "SUPERADMIN")
                        .requestMatchers("/api/v1/notifications/**").authenticated()
                        .anyRequest().authenticated()
                )
                .oauth2ResourceServer(oauth2 -> oauth2
                        .authenticationManagerResolver(authenticationManagerResolver())
                )
                .addFilterAfter(blockedUserFilter, BearerTokenAuthenticationFilter.class);

        return http.build();
    }

    private AuthenticationManagerResolver<HttpServletRequest> authenticationManagerResolver() {
        String clientsIssuer    = keycloakBaseUrl + "/realms/" + clientsRealm;
        String backofficeIssuer = keycloakBaseUrl + "/realms/" + backofficeRealm;

        Map<String, AuthenticationManager> managers = new HashMap<>();
        // Primary issuers — Docker-internal Keycloak URL
        managers.put(clientsIssuer,    jwtAuthManager(clientsIssuer, clientsIssuer));
        managers.put(backofficeIssuer, jwtAuthManager(backofficeIssuer, backofficeIssuer));

        // Localhost aliases — browser hits Keycloak on localhost:8080 so the JWT iss
        // contains localhost, but JWKs must still be fetched via the Docker-internal URL.
        if (!keycloakBaseUrl.startsWith("http://localhost")) {
            String localBase = "http://localhost:8080";
            managers.put(localBase + "/realms/" + clientsRealm,
                    jwtAuthManager(localBase + "/realms/" + clientsRealm, clientsIssuer));
            managers.put(localBase + "/realms/" + backofficeRealm,
                    jwtAuthManager(localBase + "/realms/" + backofficeRealm, backofficeIssuer));
        }

        return new JwtIssuerAuthenticationManagerResolver(managers::get);
    }

    // issuerUri   — validated against the JWT's "iss" claim
    // jwkFetchUri — base URL used to fetch the JWK set (may differ when running in Docker)
    private AuthenticationManager jwtAuthManager(String issuerUri, String jwkFetchUri) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder
                .withJwkSetUri(jwkFetchUri + "/protocol/openid-connect/certs")
                .build();
        decoder.setJwtValidator(JwtValidators.createDefaultWithIssuer(issuerUri));

        JwtAuthenticationProvider provider = new JwtAuthenticationProvider(decoder);
        provider.setJwtAuthenticationConverter(jwtAuthenticationConverter);
        return provider::authenticate;
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration cors = new CorsConfiguration();
        cors.setAllowedOrigins(List.of(
                "http://localhost:5173",
                "http://localhost:5174"
        ));
        cors.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        cors.setAllowedHeaders(List.of("*"));
        cors.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cors);
        return source;
    }
}
