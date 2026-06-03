package com.payzo.backend.dto.response.analyst;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AnalystDashboardResponse {

    private KpiData kpis;
    private List<DateCount> alertsOverTime;
    private List<LevelCount> riskLevelDistribution;
    private List<StatusCount> alertStatusDistribution;
    private List<BankVolumeCount> transactionVolumeByBank;
    private List<HourCount> transactionsByHour;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class KpiData {
        private long pendingAlerts;
        private long decidedToday;
        private double fraudConfirmedRate;
        private BigDecimal totalTransactionVolume;
        private long totalTransactionCount;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DateCount {
        private String date;
        private long count;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class LevelCount {
        private String level;
        private long count;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class StatusCount {
        private String status;
        private long count;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class BankVolumeCount {
        private String bankCode;
        private BigDecimal totalAmount;
        private long count;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class HourCount {
        private int hour;
        private long count;
    }
}
