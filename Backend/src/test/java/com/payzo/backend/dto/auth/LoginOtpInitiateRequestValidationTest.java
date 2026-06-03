package com.payzo.backend.dto.auth;

import com.payzo.backend.domain.enums.OtpChannel;
import com.payzo.backend.dto.request.auth.LoginOtpInitiateRequest;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The login channel split makes {@code channel} a required field. Spring's
 * {@code @Valid} surface returns 400 when validation fails — the validator
 * itself flags the missing field, which is what these tests exercise.
 */
class LoginOtpInitiateRequestValidationTest {

    private static ValidatorFactory factory;
    private static Validator validator;

    @BeforeAll
    static void setUp() {
        factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterAll
    static void tearDown() {
        if (factory != null) factory.close();
    }

    @Test
    void valid_request_passes() {
        LoginOtpInitiateRequest req = new LoginOtpInitiateRequest();
        req.setAccessToken("eyJ.fake.token");
        req.setChannel(OtpChannel.EMAIL);

        Set<ConstraintViolation<LoginOtpInitiateRequest>> violations = validator.validate(req);
        assertThat(violations).isEmpty();
    }

    @Test
    void missing_channel_violates_NotNull() {
        LoginOtpInitiateRequest req = new LoginOtpInitiateRequest();
        req.setAccessToken("eyJ.fake.token");
        req.setChannel(null);

        Set<ConstraintViolation<LoginOtpInitiateRequest>> violations = validator.validate(req);
        assertThat(violations)
                .anyMatch(v -> v.getPropertyPath().toString().equals("channel"));
    }

    @Test
    void missing_accessToken_violates_NotBlank() {
        LoginOtpInitiateRequest req = new LoginOtpInitiateRequest();
        req.setAccessToken("");
        req.setChannel(OtpChannel.SMS);

        Set<ConstraintViolation<LoginOtpInitiateRequest>> violations = validator.validate(req);
        assertThat(violations)
                .anyMatch(v -> v.getPropertyPath().toString().equals("accessToken"));
    }
}
