package com.payzo.backend.service;

import com.payzo.backend.domain.entity.OtpToken;
import com.payzo.backend.domain.enums.OtpPurpose;
import com.payzo.backend.exception.InvalidOtpException;
import com.payzo.backend.exception.OtpMaxAttemptsException;
import com.payzo.backend.repository.OtpTokenRepository;
import com.payzo.backend.service.auth.OtpService;
import com.payzo.backend.util.OtpGenerator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.Mockito.when;

/**
 * Focused tests for the Impact 24a contract: wrong-OTP responses must include
 * {@code attemptsLeft} so the frontend can render "X attempts remaining" without
 * re-querying. Once attempts are exhausted, the exception type changes to
 * {@link OtpMaxAttemptsException} (HTTP 429), not InvalidOtpException.
 */
@ExtendWith(MockitoExtension.class)
class OtpAttemptsLeftTest {

    @Mock private OtpTokenRepository otpTokenRepository;
    @Mock private OtpGenerator otpGenerator;

    @InjectMocks
    private OtpService otpService;

    private static final String IDENTIFIER = "12345678";

    @BeforeEach
    void setUp() {
        org.springframework.test.util.ReflectionTestUtils.setField(
                otpService, "otpDeliveryEnabled", false);
    }

    @Test
    void wrongOtp_firstAttempt_reportsTwoLeft() {
        OtpToken token = freshToken();
        when(otpTokenRepository.findByIdentifierAndPurposeAndUsedFalse(
                IDENTIFIER, OtpPurpose.LOGIN)).thenReturn(List.of(token));

        InvalidOtpException ex = catchThrowableOfType(
                () -> otpService.validate(IDENTIFIER, OtpPurpose.LOGIN, "999999"),
                InvalidOtpException.class);

        assertThat(ex.getAttemptsLeft()).isEqualTo(2);
    }

    @Test
    void wrongOtp_secondAttempt_reportsOneLeft() {
        OtpToken token = freshToken();
        token.setAttempts(1);
        when(otpTokenRepository.findByIdentifierAndPurposeAndUsedFalse(
                IDENTIFIER, OtpPurpose.LOGIN)).thenReturn(List.of(token));

        InvalidOtpException ex = catchThrowableOfType(
                () -> otpService.validate(IDENTIFIER, OtpPurpose.LOGIN, "999999"),
                InvalidOtpException.class);

        assertThat(ex.getAttemptsLeft()).isEqualTo(1);
    }

    @Test
    void wrongOtp_thirdAttempt_reportsZeroLeft() {
        OtpToken token = freshToken();
        token.setAttempts(2);
        when(otpTokenRepository.findByIdentifierAndPurposeAndUsedFalse(
                IDENTIFIER, OtpPurpose.LOGIN)).thenReturn(List.of(token));

        InvalidOtpException ex = catchThrowableOfType(
                () -> otpService.validate(IDENTIFIER, OtpPurpose.LOGIN, "999999"),
                InvalidOtpException.class);

        assertThat(ex.getAttemptsLeft()).isEqualTo(0);
    }

    @Test
    void wrongOtp_fourthAttempt_throwsMaxAttempts_notInvalidOtp() {
        OtpToken token = freshToken();
        token.setAttempts(3); // already at the cap; the +1 inside validate trips the guard
        when(otpTokenRepository.findByIdentifierAndPurposeAndUsedFalse(
                IDENTIFIER, OtpPurpose.LOGIN)).thenReturn(List.of(token));

        assertThatThrownBy(() ->
                otpService.validate(IDENTIFIER, OtpPurpose.LOGIN, "999999"))
                .isInstanceOf(OtpMaxAttemptsException.class);
    }

    private OtpToken freshToken() {
        OtpToken token = new OtpToken();
        token.setId(UUID.randomUUID());
        token.setIdentifier(IDENTIFIER);
        token.setPurpose(OtpPurpose.LOGIN);
        token.setOtpCode("123456");
        token.setExpiresAt(OffsetDateTime.now().plusMinutes(5));
        token.setCreatedAt(OffsetDateTime.now().minusSeconds(10));
        return token;
    }
}
