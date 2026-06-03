package com.payzo.backend.dto.response.admin;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AdminDashboardResponse {

    private KpiData kpis;
    private List<DateCount> subscriptionsOverTime;
    private List<StatusCount> clientStatusDistribution;
    private List<BankClientCount> clientsPerBank;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class KpiData {
        private long pendingSubscriptions;
        private long activeClients;
        private long blockedClients;
        private long decisionsToday;
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
    public static class StatusCount {
        private String status;
        private long count;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class BankClientCount {
        private String bankCode;
        private String bankName;
        private long count;
    }
}
