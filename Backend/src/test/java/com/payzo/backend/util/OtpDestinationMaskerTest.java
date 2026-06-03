package com.payzo.backend.util;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class OtpDestinationMaskerTest {

    @Test
    void maskEmail_keepsFirstTwoCharsAndDomain() {
        assertThat(OtpDestinationMasker.maskEmail("ahmed.benali@gmail.com"))
                .isEqualTo("ah***@gmail.com");
        assertThat(OtpDestinationMasker.maskEmail("xy@test.tn"))
                .isEqualTo("xy***@test.tn");
    }

    @Test
    void maskEmail_handlesShortLocal() {
        // Local part shorter than the prefix length — entire local + asterisks.
        assertThat(OtpDestinationMasker.maskEmail("a@example.com"))
                .isEqualTo("a***@example.com");
    }

    @Test
    void maskEmail_returnsNull_forNullOrBlankOrInvalid() {
        assertThat(OtpDestinationMasker.maskEmail(null)).isNull();
        assertThat(OtpDestinationMasker.maskEmail("")).isNull();
        assertThat(OtpDestinationMasker.maskEmail("   ")).isNull();
        assertThat(OtpDestinationMasker.maskEmail("noatsign")).isNull();
        assertThat(OtpDestinationMasker.maskEmail("@nolocal.com")).isNull();
        assertThat(OtpDestinationMasker.maskEmail("local@")).isNull();
    }

    @Test
    void maskPhone_appliesFixedTunisianShape() {
        assertThat(OtpDestinationMasker.maskPhone("+21671234567"))
                .isEqualTo("+216 71 2** ***");
    }

    @Test
    void maskPhone_handlesNoPlus() {
        assertThat(OtpDestinationMasker.maskPhone("21671234567"))
                .isEqualTo("216 71 2** ***");
    }

    @Test
    void maskPhone_returnsNull_forNullBlankOrTooShort() {
        assertThat(OtpDestinationMasker.maskPhone(null)).isNull();
        assertThat(OtpDestinationMasker.maskPhone("")).isNull();
        assertThat(OtpDestinationMasker.maskPhone("+216")).isNull();
        assertThat(OtpDestinationMasker.maskPhone("21671")).isNull();
    }
}
