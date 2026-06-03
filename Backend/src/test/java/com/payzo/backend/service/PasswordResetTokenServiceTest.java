package com.payzo.backend.service;

import com.payzo.backend.exception.ConflictException;
import com.payzo.backend.service.auth.PasswordResetTokenService;
import com.payzo.backend.service.auth.PasswordResetTokenService.ResetClaims;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PasswordResetTokenServiceTest {

    private PasswordResetTokenService service;
    private static final String SECRET = "test-secret-must-be-at-least-32-bytes-long-x";

    @BeforeEach
    void setUp() {
        service = new PasswordResetTokenService(SECRET);
        // @PostConstruct is not invoked when we new-up the service ourselves
        ReflectionTestUtils.invokeMethod(service, "init");
    }

    @Test
    void mintAndVerify_roundTrip_returnsOriginalClaims() {
        UUID userId = UUID.randomUUID();
        String cin = "12345678";

        String token = service.mint(userId, cin);
        ResetClaims claims = service.verify(token);

        assertThat(claims.userId()).isEqualTo(userId);
        assertThat(claims.cin()).isEqualTo(cin);
    }

    @Test
    void verify_rejects_blankOrNullToken() {
        assertThatThrownBy(() -> service.verify(null))
                .isInstanceOf(ConflictException.class);
        assertThatThrownBy(() -> service.verify(""))
                .isInstanceOf(ConflictException.class);
        assertThatThrownBy(() -> service.verify("   "))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    void verify_rejects_malformedToken() {
        assertThatThrownBy(() -> service.verify("not-a-jwt"))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    void verify_rejects_tokenSignedWithDifferentSecret() {
        // Token minted by a service with a different key should fail signature check
        PasswordResetTokenService imposter =
                new PasswordResetTokenService("a-completely-different-secret-key-here-123");
        ReflectionTestUtils.invokeMethod(imposter, "init");

        String forged = imposter.mint(UUID.randomUUID(), "12345678");

        assertThatThrownBy(() -> service.verify(forged))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    void mint_producesShortJwts_thatParseCleanly() {
        String token = service.mint(UUID.randomUUID(), "12345678");
        // 3 dot-separated segments = standard JWS compact form
        assertThat(token.split("\\.")).hasSize(3);
    }

    @Test
    void devModeBootstrapsEphemeralKey_whenSecretBlank() {
        PasswordResetTokenService dev = new PasswordResetTokenService(null);
        ReflectionTestUtils.invokeMethod(dev, "init");

        UUID userId = UUID.randomUUID();
        String token = dev.mint(userId, "12345678");
        ResetClaims claims = dev.verify(token);

        assertThat(claims.userId()).isEqualTo(userId);
    }

    @Test
    void devModeKeysAreDistinct_acrossInstances() {
        PasswordResetTokenService dev1 = new PasswordResetTokenService("");
        PasswordResetTokenService dev2 = new PasswordResetTokenService("");
        ReflectionTestUtils.invokeMethod(dev1, "init");
        ReflectionTestUtils.invokeMethod(dev2, "init");

        String token = dev1.mint(UUID.randomUUID(), "12345678");
        // Different ephemeral keys → signature verification must fail across instances
        assertThatThrownBy(() -> dev2.verify(token))
                .isInstanceOf(ConflictException.class);
    }
}
