package com.payzo.backend.util;

import lombok.experimental.UtilityClass;

import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;

/** Shared period-string parser ("today", "7d", "30d", "90d", "all") used by all dashboard services, returns null for "all" (no lower bound). */
@UtilityClass
public class PeriodUtils {

    public OffsetDateTime parsePeriodStart(String period) {
        if (period == null) period = "30d";
        return switch (period) {
            case "today" -> OffsetDateTime.now().truncatedTo(ChronoUnit.DAYS);
            case "7d" -> OffsetDateTime.now().minusDays(7);
            case "30d" -> OffsetDateTime.now().minusDays(30);
            case "90d" -> OffsetDateTime.now().minusDays(90);
            case "all" -> null;
            default -> OffsetDateTime.now().minusDays(30);
        };
    }
}
