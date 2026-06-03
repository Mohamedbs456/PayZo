package com.payzo.backend.dto.response.client;

import lombok.Builder;
import lombok.Data;

import java.util.List;

/**
 * Dashboard preview shape for the client's fraud-alert card. Two latest
 * alerts plus three counts so the card can render its headline number,
 * the segmented "under review / rejected / approved" line and a paged
 * "View all →" link without an extra round trip.
 */
@Data
@Builder
public class ClientAlertSummary {
    private List<AlertResponse> alerts;
    private long totalCount;
    private long underReviewCount;
    private long rejectedCount;
}
