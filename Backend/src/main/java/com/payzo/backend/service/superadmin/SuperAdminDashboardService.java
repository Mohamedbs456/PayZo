package com.payzo.backend.service.superadmin;

import com.payzo.backend.domain.entity.Transaction;
import com.payzo.backend.domain.enums.AlertStatus;
import com.payzo.backend.domain.enums.Role;
import com.payzo.backend.dto.response.admin.AdminDashboardResponse;
import com.payzo.backend.dto.response.analyst.AnalystDashboardResponse;
import com.payzo.backend.dto.response.superadmin.SuperAdminDashboardResponse;
import com.payzo.backend.dto.response.superadmin.SuperAdminDashboardResponse.*;
import com.payzo.backend.repository.FraudAlertRepository;
import com.payzo.backend.repository.TransactionRepository;
import com.payzo.backend.repository.UserRepository;
import com.payzo.backend.service.admin.AdminDashboardService;
import com.payzo.backend.service.analyst.AnalystDashboardService;
import com.payzo.backend.util.PeriodUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/** Composes the SuperAdmin view by reusing the Admin and Analyst dashboards, adding system-wide role / fraud-rate / per-bank KPIs. */
@Service
@RequiredArgsConstructor
public class SuperAdminDashboardService {

    private final AdminDashboardService adminDashboardService;
    private final AnalystDashboardService analystDashboardService;
    private final UserRepository userRepository;
    private final TransactionRepository transactionRepository;
    private final FraudAlertRepository fraudAlertRepository;

    @Transactional(readOnly = true)
    public SuperAdminDashboardResponse getStats(String period, UUID superAdminId) {
        AdminDashboardResponse adminDashboard = adminDashboardService.getStats(period, superAdminId);
        AnalystDashboardResponse analystDashboard = analystDashboardService.getStats(period);

        long totalClients = userRepository.countByRole(Role.CLIENT);
        long totalAdmins = userRepository.countByRole(Role.ADMIN);
        long totalAnalysts = userRepository.countByRole(Role.ANALYST);
        long totalTransactions = transactionRepository.count();
        long totalFraudDetected = fraudAlertRepository.countByStatus(AlertStatus.VALIDATED);
        double systemFraudRate = totalTransactions > 0
                ? (double) totalFraudDetected / totalTransactions
                : 0.0;

        SystemKpiData systemKpis = SystemKpiData.builder()
                .totalClients(totalClients)
                .totalAdmins(totalAdmins)
                .totalAnalysts(totalAnalysts)
                .totalTransactions(totalTransactions)
                .totalFraudDetected(totalFraudDetected)
                .systemFraudRate(systemFraudRate)
                .build();

        List<BankDateAmount> moneyFlowPerBankOverTime = buildMoneyFlowPerBank(period);

        List<RoleCount> userRoleDistribution = List.of(
                RoleCount.builder().role("CLIENT").count(totalClients).build(),
                RoleCount.builder().role("ADMIN").count(totalAdmins).build(),
                RoleCount.builder().role("ANALYST").count(totalAnalysts).build()
        );

        return SuperAdminDashboardResponse.builder()
                .adminDashboard(adminDashboard)
                .analystDashboard(analystDashboard)
                .systemKpis(systemKpis)
                .moneyFlowPerBankOverTime(moneyFlowPerBankOverTime)
                .userRoleDistribution(userRoleDistribution)
                .build();
    }

    private List<BankDateAmount> buildMoneyFlowPerBank(String period) {
        OffsetDateTime periodStart = PeriodUtils.parsePeriodStart(period);
        if (periodStart == null) {
            return Collections.emptyList();
        }

        List<Transaction> transactions = transactionRepository.findByCreatedAtAfter(periodStart);

        return transactions.stream()
                .collect(Collectors.groupingBy(
                        tx -> tx.getCreatedAt().toLocalDate() + "|" + tx.getSourceBankCode()))
                .entrySet().stream()
                .map(e -> {
                    String[] parts = e.getKey().split("\\|");
                    BigDecimal total = e.getValue().stream()
                            .map(Transaction::getAmount)
                            .reduce(BigDecimal.ZERO, BigDecimal::add);
                    return BankDateAmount.builder()
                            .date(parts[0])
                            .bankCode(parts[1])
                            .totalAmount(total)
                            .build();
                })
                .sorted((a, b) -> a.getDate().compareTo(b.getDate()))
                .toList();
    }

}
