package com.payzo.backend.dto.response.superadmin;

import com.payzo.backend.dto.response.admin.AdminDashboardResponse;
import com.payzo.backend.dto.response.analyst.AnalystDashboardResponse;
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
public class SuperAdminDashboardResponse {

    private AdminDashboardResponse adminDashboard;
    private AnalystDashboardResponse analystDashboard;
    private SystemKpiData systemKpis;
    private List<BankDateAmount> moneyFlowPerBankOverTime;
    private List<RoleCount> userRoleDistribution;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SystemKpiData {
        private long totalClients;
        private long totalAdmins;
        private long totalAnalysts;
        private long totalTransactions;
        private long totalFraudDetected;
        private double systemFraudRate;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class BankDateAmount {
        private String date;
        private String bankCode;
        private BigDecimal totalAmount;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RoleCount {
        private String role;
        private long count;
    }
}
