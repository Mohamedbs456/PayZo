package com.payzo.backend.service;

import com.payzo.backend.domain.entity.OtpToken;
import com.payzo.backend.domain.enums.OtpPurpose;
import com.payzo.backend.exception.InvalidOtpException;
import com.payzo.backend.exception.OtpExpiredException;
import com.payzo.backend.exception.OtpMaxAttemptsException;
import com.payzo.backend.exception.ResourceNotFoundException;
import com.payzo.backend.repository.OtpTokenRepository;
import com.payzo.backend.service.auth.OtpService;
import com.payzo.backend.util.OtpGenerator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.OffsetDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class OtpServiceTest {

    @Mock
    private OtpTokenRepository otpTokenRepository;

    @Mock
    private OtpGenerator otpGenerator;

    @InjectMocks
    private OtpService otpService;

    @BeforeEach
    void setUp() {
        // @Value fields are not injected by Mockito — set via reflection
        ReflectionTestUtils.setField(otpService, "otpDeliveryEnabled", false);
    }

    // ── generate ─────────────────────────────────────────────────────────────

    @Test
    void generate_shouldMarkExistingUnusedOtpsAsUsedAndCreateNew() {
        OtpToken existing = freshToken("123456", OffsetDateTime.now().plusMinutes(5));
        when(otpTokenRepository.findByIdentifierAndPurposeAndUsedFalse("12345678", OtpPurpose.REGISTRATION))
                .thenReturn(List.of(existing));
        when(otpGenerator.generate()).thenReturn("654321");

        otpService.generate("12345678", OtpPurpose.REGISTRATION, "test@payzo.tn", "+21612345678");

        assertThat(existing.isUsed()).isTrue();
        verify(otpTokenRepository).saveAll(List.of(existing));

        ArgumentCaptor<OtpToken> captor = ArgumentCaptor.forClass(OtpToken.class);
        verify(otpTokenRepository).save(captor.capture());
        OtpToken saved = captor.getValue();
        assertThat(saved.getOtpCode()).isEqualTo("654321");
        assertThat(saved.getIdentifier()).isEqualTo("12345678");
        assertThat(saved.getPurpose()).isEqualTo(OtpPurpose.REGISTRATION);
        assertThat(saved.isUsed()).isFalse();
        assertThat(saved.getExpiresAt()).isAfter(OffsetDateTime.now());
    }

    @Test
    void generate_shouldCreateToken_whenNoPreviousOtpExists() {
        when(otpTokenRepository.findByIdentifierAndPurposeAndUsedFalse(any(), any()))
                .thenReturn(List.of());
        when(otpGenerator.generate()).thenReturn("000001");

        otpService.generate("12345678", OtpPurpose.REGISTRATION, "a@b.tn", "+21600000000");

        verify(otpTokenRepository).saveAll(List.of());
        verify(otpTokenRepository).save(any(OtpToken.class));
    }

    // ── validate ─────────────────────────────────────────────────────────────

    @Test
    void validate_shouldMarkTokenUsed_whenCodeIsCorrect() {
        OtpToken token = freshToken("123456", OffsetDateTime.now().plusMinutes(3));
        when(otpTokenRepository.findByIdentifierAndPurposeAndUsedFalse("12345678", OtpPurpose.REGISTRATION))
                .thenReturn(List.of(token));

        otpService.validate("12345678", OtpPurpose.REGISTRATION, "123456");

        assertThat(token.isUsed()).isTrue();
        verify(otpTokenRepository, atLeastOnce()).save(token);
    }

    @Test
    void validate_shouldThrowOtpExpired_whenTokenIsExpired() {
        OtpToken expired = freshToken("123456", OffsetDateTime.now().minusMinutes(1));
        when(otpTokenRepository.findByIdentifierAndPurposeAndUsedFalse(any(), any()))
                .thenReturn(List.of(expired));

        assertThatThrownBy(() -> otpService.validate("12345678", OtpPurpose.REGISTRATION, "123456"))
                .isInstanceOf(OtpExpiredException.class);
        assertThat(expired.isUsed()).isTrue();
    }

    @Test
    void validate_shouldThrowOtpMaxAttempts_whenAttemptsExceeded() {
        OtpToken token = freshToken("123456", OffsetDateTime.now().plusMinutes(5));
        token.setAttempts(3); // already 3; next increment → 4 > MAX_ATTEMPTS(3)
        when(otpTokenRepository.findByIdentifierAndPurposeAndUsedFalse(any(), any()))
                .thenReturn(List.of(token));

        assertThatThrownBy(() -> otpService.validate("12345678", OtpPurpose.REGISTRATION, "999999"))
                .isInstanceOf(OtpMaxAttemptsException.class);
        assertThat(token.isUsed()).isTrue();
    }

    @Test
    void validate_shouldThrowInvalidOtp_whenCodeIsWrong() {
        OtpToken token = freshToken("123456", OffsetDateTime.now().plusMinutes(5));
        when(otpTokenRepository.findByIdentifierAndPurposeAndUsedFalse(any(), any()))
                .thenReturn(List.of(token));

        assertThatThrownBy(() -> otpService.validate("12345678", OtpPurpose.REGISTRATION, "000000"))
                .isInstanceOf(InvalidOtpException.class);
        assertThat(token.isUsed()).isFalse(); // not marked used on wrong guess
        assertThat(token.getAttempts()).isEqualTo(1);
    }

    @Test
    void validate_shouldThrowResourceNotFound_whenNoActiveToken() {
        when(otpTokenRepository.findByIdentifierAndPurposeAndUsedFalse(any(), any()))
                .thenReturn(List.of());

        assertThatThrownBy(() -> otpService.validate("12345678", OtpPurpose.REGISTRATION, "123456"))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    // ── resend ────────────────────────────────────────────────────────────────

    @Test
    void resend_shouldThrowRateLimit_whenCalledWithinCooldown() {
        when(otpTokenRepository.findByIdentifierAndPurposeAndUsedFalse(any(), any()))
                .thenReturn(List.of());
        when(otpGenerator.generate()).thenReturn("111111");

        // First call — succeeds
        otpService.resend("12345678", OtpPurpose.REGISTRATION, "a@b.tn", "+21600000000");

        // Second call immediately after — should be rate-limited
        assertThatThrownBy(() ->
                otpService.resend("12345678", OtpPurpose.REGISTRATION, "a@b.tn", "+21600000000"))
                .isInstanceOf(OtpMaxAttemptsException.class)
                .hasMessageContaining("60 seconds");
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private OtpToken freshToken(String code, OffsetDateTime expiresAt) {
        OtpToken token = new OtpToken();
        token.setOtpCode(code);
        token.setExpiresAt(expiresAt);
        token.setUsed(false);
        token.setAttempts(0);
        return token;
    }
}
