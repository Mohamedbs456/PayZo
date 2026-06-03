package com.payzo.backend.config;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.enums.SecuritySchemeType;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.security.SecurityScheme;
import org.springframework.context.annotation.Configuration;

/** Swagger UI metadata and the global bearer-auth scheme so every "Try it out" attaches the JWT. */
@Configuration
@OpenAPIDefinition(
        info = @Info(
                title = "PayZo Backend API",
                version = "1.0",
                description = "Tunisian digital banking platform with ML-based P2P fraud detection. " +
                              "PFE — Faculté des Sciences de Monastir 2025–2026."
        )
)
@SecurityScheme(
        name = "bearerAuth",
        type = SecuritySchemeType.HTTP,
        scheme = "bearer",
        bearerFormat = "JWT"
)
public class OpenApiConfig {
}
