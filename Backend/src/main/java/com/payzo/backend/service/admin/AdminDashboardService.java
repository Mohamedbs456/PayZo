package com.payzo.backend.service.admin;

import com.payzo.backend.domain.entity.Bank;
import com.payzo.backend.domain.entity.Client;
import com.payzo.backend.domain.enums.UserStatus;
import com.payzo.backend.dto.response.admin.AdminDashboardResponse;
import com.payzo.backend.dto.response.admin.AdminDashboardResponse.*;
import com.payzo.backend.repository.AuditLogRepository;
import com.payzo.backend.repository.BankRepository;
import com.payzo.backend.repository.ClientRepository;
import com.payzo.backend.service.integration.CbsIntegrationService;
import com.payzo.backend.util.PeriodUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/** KPI cards and chart data for the Admin dashboard, scoped to the calling admin's audit footprint via {@code adminId}. */
@Service
@RequiredArgsConstructor
@Slf4j
public class AdminDashboardService {

    private final ClientRepository clientRepository;
    private final AuditLogRepository auditLogRepository;
    private final BankRepository bankRepository;
    private final CbsIntegrationService cbsIntegrationService;

    @Transactional(readOnly = true)
    public AdminDashboardResponse getStats(String period, UUID adminId) {
        OffsetDateTime periodStart = PeriodUtils.parsePeriodStart(period);
        OffsetDateTime todayStart = OffsetDateTime.now().truncatedTo(ChronoUnit.DAYS);

        KpiData kpis = KpiData.builder()
                .pendingSubscriptions(clientRepository.countByStatus(UserStatus.PENDING))
                .activeClients(clientRepository.countByStatus(UserStatus.ACTIVE))
                .blockedClients(clientRepository.countByStatus(UserStatus.BLOCKED))
                .decisionsToday(auditLogRepository.countByActorIdAndCreatedAtAfter(adminId, todayStart))
                .build();

        List<DateCount> subscriptionsOverTime = buildSubscriptionsOverTime(periodStart);

        List<StatusCount> clientStatusDistribution = List.of(
                StatusCount.builder().status("ACTIVE")
                        .count(clientRepository.countByStatus(UserStatus.ACTIVE)).build(),
                StatusCount.builder().status("BLOCKED")
                        .count(clientRepository.countByStatus(UserStatus.BLOCKED)).build(),
                StatusCount.builder().status("PENDING")
                        .count(clientRepository.countByStatus(UserStatus.PENDING)).build(),
                StatusCount.builder().status("REJECTED")
                        .count(clientRepository.countByStatus(UserStatus.REJECTED)).build()
        );

        return AdminDashboardResponse.builder()
                .kpis(kpis)
                .subscriptionsOverTime(subscriptionsOverTime)
                .clientStatusDistribution(clientStatusDistribution)
                .clientsPerBank(buildClientsPerBank())
                .build();
    }

    /**
     * Distribution of ACTIVE PayZo clients by bank. A client is counted in
     * EVERY bank they hold an account at — so a 4-bank client contributes +1
     * to each of 4 slices. The slice totals can therefore sum higher than the
     * total active-client count, which is the correct read for "how many of
     * my clients use each bank?".
     *
     * <p>Approach: one CBS round-trip pulls every {@code (bankCode → CINs)}
     * pair; we intersect with the active-client CIN set to get per-bank
     * counts. O(accounts) memory, single query — replaces the previous
     * per-client loop that took {@code findFirst()} and lost multi-bank
     * memberships.
     */
    private List<BankClientCount> buildClientsPerBank() {
        Set<String> activeCins = clientRepository.findByStatus(UserStatus.ACTIVE).stream()
                .map(Client::getCin)
                .collect(Collectors.toSet());
        if (activeCins.isEmpty()) {
            return Collections.emptyList();
        }

        Map<String, Set<String>> cinsByBank;
        try {
            cinsByBank = cbsIntegrationService.findCinsByBank();
        } catch (Exception e) {
            log.warn("clientsPerBank: CBS aggregation failed ({}); returning empty.", e.getMessage());
            return Collections.emptyList();
        }

        return cinsByBank.entrySet().stream()
                .map(e -> {
                    long count = e.getValue().stream().filter(activeCins::contains).count();
                    return BankClientCount.builder()
                            .bankCode(e.getKey())
                            .bankName(bankRepository.findByCode(e.getKey())
                                    .map(Bank::getName).orElse(e.getKey()))
                            .count(count)
                            .build();
                })
                .filter(b -> b.getCount() > 0)
                .sorted(Comparator.comparingLong(BankClientCount::getCount).reversed())
                .toList();
    }

    private List<DateCount> buildSubscriptionsOverTime(OffsetDateTime periodStart) {
        if (periodStart == null) {
            return Collections.emptyList();
        }
        List<Client> recent = clientRepository.findByCreatedAtAfter(periodStart);
        Map<LocalDate, Long> grouped = recent.stream()
                .collect(Collectors.groupingBy(
                        c -> c.getCreatedAt().toLocalDate(), Collectors.counting()));
        return grouped.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(e -> DateCount.builder()
                        .date(e.getKey().format(DateTimeFormatter.ISO_LOCAL_DATE))
                        .count(e.getValue())
                        .build())
                .toList();
    }
}
