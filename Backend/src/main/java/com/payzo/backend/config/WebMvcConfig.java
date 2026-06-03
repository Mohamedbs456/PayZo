package com.payzo.backend.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Serves uploaded files (profile pictures, etc.) under
 * {@code /api/v1/uploads/**} straight from the host filesystem path
 * configured by {@code uploads.path}. Without this, Spring matches the
 * URL but has no servlet to return bytes for it — every request 500s.
 *
 * SecurityConfig already permits this path without a JWT (so an
 * {@code <img src="…">} tag works without bearer headers).
 */
@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    @Value("${uploads.path}")
    private String uploadsPath;

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // Trailing slash on the resource location is REQUIRED by Spring's
        // file: handler — without it the directory isn't recognized as a
        // base and lookups fail. Path.toUri() emits the slash for us.
        Path absolute = Paths.get(uploadsPath).toAbsolutePath();
        String location = absolute.toUri().toString();
        registry.addResourceHandler("/api/v1/uploads/**")
                .addResourceLocations(location)
                // No CDN cache — uploads change in place (`{userId}.jpg`)
                // and we'd like the new image to show on next request.
                .setCachePeriod(0);
    }
}
