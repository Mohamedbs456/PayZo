package com.payzo.backend.domain.enums;

import java.math.BigDecimal;

/**
 * Amount bands used by the fraud-alerts list filter (D41 / Impact 10b). The bands
 * match the dropdown values in the backoffice UI: under 1k, 1k–5k, 5k–10k, over 10k.
 *
 * Boundaries are intentionally TND-agnostic constants — the platform is TND-only
 * (CLAUDE.md), so no currency conversion is needed.
 */
public enum AmountBand {

    UNDER_1K(null,                      new BigDecimal("1000")),
    BETWEEN_1K_5K(new BigDecimal("1000"),   new BigDecimal("5000")),
    BETWEEN_5K_10K(new BigDecimal("5000"),  new BigDecimal("10000")),
    OVER_10K(new BigDecimal("10000"),       null);

    /** Inclusive lower bound. Null means "no lower bound". */
    private final BigDecimal min;
    /** Exclusive upper bound. Null means "no upper bound". */
    private final BigDecimal max;

    AmountBand(BigDecimal min, BigDecimal max) {
        this.min = min;
        this.max = max;
    }

    public BigDecimal min() { return min; }
    public BigDecimal max() { return max; }
}
