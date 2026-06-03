package com.payzo.backend.dto.request.analyst;

import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Body for the approve and reject endpoints.
 *
 *  - Approve: {@code comment} is optional ("looked legit, no further note needed").
 *  - Reject:  {@code comment} is required and non-blank — the service layer enforces
 *             this so the contract differs by endpoint without needing two DTOs.
 *
 * Persisted to {@code fraud_alerts.analyst_comment} verbatim per BACKEND_IMPACTS.md
 * Impact 8a / 8d.
 */
@Data
public class AlertDecisionRequest {

    @Size(max = 2000, message = "Comment must be 2000 characters or fewer")
    private String comment;
}
