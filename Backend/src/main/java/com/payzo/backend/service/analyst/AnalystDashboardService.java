package com.payzo.backend.service.analyst;

import com.payzo.backend.domain.entity.FraudAlert;
import com.payzo.backend.domain.entity.Transaction;
import com.payzo.backend.domain.enums.AlertStatus;
import com.payzo.backend.domain.enums.RiskLevel;
import com.payzo.backend.dto.response.analyst.AnalystDashboardResponse;
import com.payzo.backend.dto.response.analyst.AnalystDashboardResponse.*;
import com.payzo.backend.repository.FraudAlertRepository;
import com.payzo.backend.repository.TransactionRepository;
import com.payzo.backend.util.PeriodUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

/** KPI cards and alert / risk charts for the Analyst dashboard, sourced directly from {@code fraud_alerts} and {@code transactions}. */
@Service
@RequiredArgsConstructor
public class AnalystDashboardService {

    private final FraudAlertRepository fraudAlertRepository;
    private final TransactionRepository transactionRepository;

    @Transactional(readOnly = true)
    public AnalystDashboardResponse getStats(String period) {
        OffsetDateTime periodStart = PeriodUtils.parsePeriodStart(period);
        OffsetDateTime todayStart = OffsetDateTime.now().truncatedTo(ChronoUnit.DAYS);

        long pendingAlerts = fraudAlertRepository.countByStatus(AlertStatus.PENDING);

        long decidedToday = fraudAlertRepository.countByStatusAndCreatedAtBetween(
                AlertStatus.VALIDATED, todayStart, OffsetDateTime.now())
                + fraudAlertRepository.countByStatusAndCreatedAtBetween(
                AlertStatus.REJECTED, todayStart, OffsetDateTime.now());

        List<Transaction> periodTransactions = periodStart != null
                ? transactionRepository.findByCreatedAtAfter(periodStart)
                : transactionRepository.findAll();

        long totalTransactionCount = periodTransactions.size();

        BigDecimal totalTransactionVolume = periodTransactions.stream()
                .map(Transaction::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        long totalAlerts = periodStart != null
                ? fraudAlertRepository.findByCreatedAtAfter(periodStart).size()
                : fraudAlertRepository.count();

        double fraudConfirmedRate = totalTransactionCount > 0
                ? (double) totalAlerts / totalTransactionCount
                : 0.0;

        List<DateCount> alertsOverTime = buildAlertsOverTime(periodStart);

        List<LevelCount> riskLevelDistribution = List.of(
                LevelCount.builder().level("LOW")
                        .count(countByRiskLevel(periodTransactions, RiskLevel.LOW)).build(),
                LevelCount.builder().level("MEDIUM")
                        .count(countByRiskLevel(periodTransactions, RiskLevel.MEDIUM)).build(),
                LevelCount.builder().level("HIGH")
                        .count(countByRiskLevel(periodTransactions, RiskLevel.HIGH)).build()
        );

        List<StatusCount> alertStatusDistribution = List.of(
                StatusCount.builder().status("PENDING")
                        .count(fraudAlertRepository.countByStatus(AlertStatus.PENDING)).build(),
                StatusCount.builder().status("VALIDATED")
                        .count(fraudAlertRepository.countByStatus(AlertStatus.VALIDATED)).build(),
                StatusCount.builder().status("REJECTED")
                        .count(fraudAlertRepository.countByStatus(AlertStatus.REJECTED)).build()
        );

        Map<String, List<Transaction>> byBank = periodTransactions.stream()
                .collect(Collectors.groupingBy(Transaction::getSourceBankCode));
        List<BankVolumeCount> transactionVolumeByBank = byBank.entrySet().stream()
                .map(e -> BankVolumeCount.builder()
                        .bankCode(e.getKey())
                        .count(e.getValue().size())
                        .totalAmount(e.getValue().stream()
                                .map(Transaction::getAmount)
                                .reduce(BigDecimal.ZERO, BigDecimal::add))
                        .build())
                .toList();

        Map<Integer, Long> byHour = periodTransactions.stream()
                .collect(Collectors.groupingBy(
                        tx -> tx.getCreatedAt().getHour(), Collectors.counting()));
        List<HourCount> transactionsByHour = IntStream.range(0, 24)
                .mapToObj(h -> HourCount.builder()
                        .hour(h)
                        .count(byHour.getOrDefault(h, 0L))
                        .build())
                .toList();

        return AnalystDashboardResponse.builder()
                .kpis(KpiData.builder()
                        .pendingAlerts(pendingAlerts)
                        .decidedToday(decidedToday)
                        .fraudConfirmedRate(fraudConfirmedRate)
                        .totalTransactionVolume(totalTransactionVolume)
                        .totalTransactionCount(totalTransactionCount)
                        .build())
                .alertsOverTime(alertsOverTime)
                .riskLevelDistribution(riskLevelDistribution)
                .alertStatusDistribution(alertStatusDistribution)
                .transactionVolumeByBank(transactionVolumeByBank)
                .transactionsByHour(transactionsByHour)
                .build();
    }

    private List<DateCount> buildAlertsOverTime(OffsetDateTime periodStart) {
        if (periodStart == null) {
            return Collections.emptyList();
        }
        List<FraudAlert> recent = fraudAlertRepository.findByCreatedAtAfter(periodStart);
        Map<LocalDate, Long> grouped = recent.stream()
                .collect(Collectors.groupingBy(
                        a -> a.getCreatedAt().toLocalDate(), Collectors.counting()));
        return grouped.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(e -> DateCount.builder()
                        .date(e.getKey().format(DateTimeFormatter.ISO_LOCAL_DATE))
                        .count(e.getValue())
                        .build())
                .toList();
    }

    private long countByRiskLevel(List<Transaction> transactions, RiskLevel level) {
        return transactions.stream()
                .filter(tx -> tx.getRiskLevel() == level)
                .count();
    }

}
