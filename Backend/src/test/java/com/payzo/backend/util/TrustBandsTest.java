package com.payzo.backend.util;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class TrustBandsTest {

    @Test
    void bandOf_returnsHigh_atOrAbove50() {
        assertThat(TrustBands.bandOf(50)).isEqualTo(TrustBands.Band.HIGH);
        assertThat(TrustBands.bandOf(75)).isEqualTo(TrustBands.Band.HIGH);
        assertThat(TrustBands.bandOf(100)).isEqualTo(TrustBands.Band.HIGH);
    }

    @Test
    void bandOf_returnsMedium_between20And49() {
        assertThat(TrustBands.bandOf(20)).isEqualTo(TrustBands.Band.MEDIUM);
        assertThat(TrustBands.bandOf(35)).isEqualTo(TrustBands.Band.MEDIUM);
        assertThat(TrustBands.bandOf(49)).isEqualTo(TrustBands.Band.MEDIUM);
    }

    @Test
    void bandOf_returnsLow_below20() {
        assertThat(TrustBands.bandOf(0)).isEqualTo(TrustBands.Band.LOW);
        assertThat(TrustBands.bandOf(10)).isEqualTo(TrustBands.Band.LOW);
        assertThat(TrustBands.bandOf(19)).isEqualTo(TrustBands.Band.LOW);
    }
}
