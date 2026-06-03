package com.payzo.backend.service.auth;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.JWSSigner;
import com.nimbusds.jose.JWSVerifier;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jose.crypto.MACVerifier;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.payzo.backend.exception.ConflictException;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.text.ParseException;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.UUID;

/**
 * Mints and verifies the short-lived reset token used by the forgot-password flow
 * (DECISIONS.md D44 / BACKEND_IMPACTS.md Impact 20). The token is a self-signed
 * HMAC-SHA256 JWT with a 5-minute TTL — long enough for a sender to type a new
 * password, short enough that a leaked token expires before it can be replayed.
 *
 * Statelessness was chosen deliberately: the alternative (DB row with TTL) costs
 * a write + a read per reset for negligible benefit at this scale, and the JWT's
 * exp + signature already give a tight invalidation window.
 *
 * Configuration property {@code security.password-reset.secret}:
 *  - Production: must be supplied via env var ({@code PASSWORD_RESET_SECRET}),
 *                ≥ 32 bytes after Base64 / UTF-8 decoding to satisfy HS256.
 *  - Dev:        a stable default is generated at boot if the property is blank,
 *                so {@code mvn spring-boot:run} works without extra setup. Tokens
 *                are invalidated on restart, which is acceptable for dev.
 */
@Service
@Slf4j
public class PasswordResetTokenService {

    private static final String CLAIM_PURPOSE = "purpose";
    private static final String CLAIM_CIN     = "cin";
    private static final String PURPOSE_VALUE = "PASSWORD_RESET";
    private static final Duration TTL         = Duration.ofMinutes(5);

    private final String configuredSecret;
    private byte[] signingKey;

    public PasswordResetTokenService(
            @Value("${security.password-reset.secret:}") String configuredSecret) {
        this.configuredSecret = configuredSecret;
    }

    @PostConstruct
    void init() {
        if (configuredSecret == null || configuredSecret.isBlank()) {
            byte[] generated = new byte[32];
            new SecureRandom().nextBytes(generated);
            this.signingKey = generated;
            log.warn("password-reset.secret not configured — using ephemeral dev key. "
                    + "Reset tokens will be invalidated on restart.");
        } else {
            byte[] bytes = configuredSecret.getBytes(StandardCharsets.UTF_8);
            // HS256 requires ≥ 32-byte key (RFC 7518 §3.2). Pad short configured
            // secrets via SHA-256 to keep dev configs lenient while staying safe.
            if (bytes.length < 32) {
                try {
                    bytes = java.security.MessageDigest.getInstance("SHA-256").digest(bytes);
                } catch (Exception e) {
                    throw new IllegalStateException("SHA-256 unavailable", e);
                }
            }
            this.signingKey = bytes;
        }
    }

    /**
     * Issue a reset token for the given client. {@code userId} is the PayZo user UUID
     * (preferred subject because it's stable across CIN changes — though CINs don't
     * change in practice, principle is cheap to apply). {@code cin} is included so
     * the verifier can cross-check against the latest DB row.
     */
    public String mint(UUID userId, String cin) {
        try {
            Instant now = Instant.now();
            JWTClaimsSet claims = new JWTClaimsSet.Builder()
                    .subject(userId.toString())
                    .claim(CLAIM_CIN, cin)
                    .claim(CLAIM_PURPOSE, PURPOSE_VALUE)
                    .issueTime(Date.from(now))
                    .expirationTime(Date.from(now.plus(TTL)))
                    .build();

            SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claims);
            JWSSigner signer = new MACSigner(signingKey);
            jwt.sign(signer);
            return jwt.serialize();
        } catch (JOSEException e) {
            throw new IllegalStateException("Failed to mint password-reset token", e);
        }
    }

    /**
     * Verify a token. Returns the parsed claims on success. Throws a 409
     * ConflictException with a clear errorCode when:
     *  - the token is malformed
     *  - the signature is invalid (forged or signed with a different secret)
     *  - the token has expired
     *  - the {@code purpose} claim is missing or wrong (token issued for some
     *    other workflow can't be re-used here)
     */
    public ResetClaims verify(String token) {
        if (token == null || token.isBlank()) {
            throw new ConflictException("Reset token is missing", "RESET_TOKEN_INVALID");
        }
        try {
            SignedJWT jwt = SignedJWT.parse(token);
            JWSVerifier verifier = new MACVerifier(signingKey);
            if (!jwt.verify(verifier)) {
                throw new ConflictException("Reset token signature invalid", "RESET_TOKEN_INVALID");
            }
            JWTClaimsSet claims = jwt.getJWTClaimsSet();

            if (!PURPOSE_VALUE.equals(claims.getStringClaim(CLAIM_PURPOSE))) {
                throw new ConflictException("Reset token has wrong purpose", "RESET_TOKEN_INVALID");
            }
            Date exp = claims.getExpirationTime();
            if (exp == null || exp.toInstant().isBefore(Instant.now())) {
                throw new ConflictException("Reset token has expired", "RESET_TOKEN_EXPIRED");
            }
            UUID userId = UUID.fromString(claims.getSubject());
            String cin = claims.getStringClaim(CLAIM_CIN);
            return new ResetClaims(userId, cin);
        } catch (ParseException | JOSEException e) {
            throw new ConflictException("Reset token is malformed", "RESET_TOKEN_INVALID");
        }
    }

    /** Just here so callers can survive a base64 round-trip if they prefer that shape. */
    static String base64Encode(byte[] bytes) {
        return Base64.getEncoder().encodeToString(bytes);
    }

    public record ResetClaims(UUID userId, String cin) {}
}
