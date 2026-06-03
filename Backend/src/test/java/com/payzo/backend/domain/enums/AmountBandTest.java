package com.payzo.backend.domain.enums;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

class AmountBandTest {

    @Test
    void boundsAreInclusiveLower_exclusiveUpper() {
        // 1000 belongs to BETWEEN_1K_5K, not UNDER_1K
        assertThat(AmountBand.UNDER_1K.max()).isEqualTo(new BigDecimal("1000"));
        assertThat(AmountBand.BETWEEN_1K_5K.min()).isEqualTo(new BigDecimal("1000"));
        assertThat(AmountBand.BETWEEN_1K_5K.max()).isEqualTo(new BigDecimal("5000"));

        // 5000 belongs to BETWEEN_5K_10K
        assertThat(AmountBand.BETWEEN_5K_10K.min()).isEqualTo(new BigDecimal("5000"));
        assertThat(AmountBand.BETWEEN_5K_10K.max()).isEqualTo(new BigDecimal("10000"));

        // 10000 belongs to OVER_10K
        assertThat(AmountBand.OVER_10K.min()).isEqualTo(new BigDecimal("10000"));
    }

    @Test
    void openEndedBoundsAreNull() {
        assertThat(AmountBand.UNDER_1K.min()).isNull();
        assertThat(AmountBand.OVER_10K.max()).isNull();
    }
}
