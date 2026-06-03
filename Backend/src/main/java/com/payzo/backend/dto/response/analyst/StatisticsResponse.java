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
public class StatisticsResponse {

    private long totalTransactions;
    private long fraudAlerts;
    private double fraudRate;
    private BigDecimal totalVolume;
    private List<AnalystDashboardResponse.LevelCount> riskLevelDistribution;
    private List<AnalystDashboardResponse.StatusCount> alertStatusDistribution;
    private List<AnalystDashboardResponse.HourCount> transactionsByHour;
}
