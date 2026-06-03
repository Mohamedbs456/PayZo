package com.payzo.backend.util;

import com.payzo.backend.exception.PasswordPolicyException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PasswordPolicyTest {

    @Test
    void enforce_passes_forValidPassword() {
        // All ≥12 chars, ≥1 upper, ≥1 digit, ≥1 allowed special.
        assertThatNoException().isThrownBy(() -> PasswordPolicy.enforce("StrongPass12!"));
        assertThatNoException().isThrownBy(() -> PasswordPolicy.enforce("Aa1@bcdefghi"));
        assertThatNoException().isThrownBy(() -> PasswordPolicy.enforce("MyP@ssw0rd123"));
    }

    @Test
    void enforce_rejects_passwordShorterThanMin() {
        // 8 chars — meets every other rule but fails MIN_LENGTH=12.
        assertThatThrownBy(() -> PasswordPolicy.enforce("Aa1!bcde"))
                .isInstanceOf(PasswordPolicyException.class)
                .extracting("violations")
                .asList()
                .anyMatch(s -> s.toString().contains("at least 12"));
    }

    @Test
    void enforce_rejects_passwordLongerThanMax() {
        String tooLong = "Aa1!".repeat(20); // 80 chars
        assertThatThrownBy(() -> PasswordPolicy.enforce(tooLong))
                .isInstanceOf(PasswordPolicyException.class)
                .extracting("violations")
                .asList()
                .anyMatch(s -> s.toString().contains("at most 64"));
    }

    @Test
    void enforce_rejects_missingUppercase() {
        // ≥12 chars, has digit + special, but no uppercase.
        assertThatThrownBy(() -> PasswordPolicy.enforce("nouppercase12!"))
                .isInstanceOf(PasswordPolicyException.class)
                .extracting("violations")
                .asList()
                .anyMatch(s -> s.toString().contains("uppercase"));
    }

    @Test
    void enforce_rejects_missingDigit() {
        // ≥12 chars, has upper + special, but no digit.
        assertThatThrownBy(() -> PasswordPolicy.enforce("NoDigitsHere!"))
                .isInstanceOf(PasswordPolicyException.class)
                .extracting("violations")
                .asList()
                .anyMatch(s -> s.toString().contains("digit"));
    }

    @Test
    void enforce_rejects_missingSpecial() {
        // ≥12 chars, has upper + digit, but no allowed special.
        assertThatThrownBy(() -> PasswordPolicy.enforce("NoSpecial1234"))
                .isInstanceOf(PasswordPolicyException.class)
                .extracting("violations")
                .asList()
                .anyMatch(s -> s.toString().contains(PasswordPolicy.ALLOWED_SPECIALS));
    }

    @Test
    void enforce_rejects_disallowedCharacters() {
        // Currency sign — not in the allowed special set. Otherwise valid (≥12 + upper + digit).
        assertThatThrownBy(() -> PasswordPolicy.enforce("StrongPass12€"))
                .isInstanceOf(PasswordPolicyException.class)
                .extracting("violations")
                .asList()
                .anyMatch(s -> s.toString().contains("allowed set"));
    }

    @Test
    void enforce_rejects_nullPassword() {
        assertThatThrownBy(() -> PasswordPolicy.enforce(null))
                .isInstanceOf(PasswordPolicyException.class)
                .extracting("violations")
                .asList()
                .anyMatch(s -> s.toString().contains("required"));
    }

    @Test
    void check_returnsAllViolations_atOnce() {
        // Too short, no uppercase, no digit, no special — should report 4 violations
        var violations = PasswordPolicy.check("ab");
        assertThat(violations).hasSize(4);
    }

    @Test
    void check_returnsEmpty_forValidPassword() {
        assertThat(PasswordPolicy.check("Valid@Pass1234")).isEmpty();
    }
}
