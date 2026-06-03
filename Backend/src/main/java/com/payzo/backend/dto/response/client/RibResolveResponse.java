package com.payzo.backend.dto.response.client;

import lombok.Builder;
import lombok.Data;

/**
 * Result of {@code POST /api/v1/client/transfers/resolve-rib}. Returns enough
 * to render the recipient summary (bank name + masked initials) without leaking
 * the holder's full name — the sender must still type the name and call
 * {@code /verify-name} to confirm a match.
 */
@Data
@Builder
public class RibResolveResponse {

    private String bankCode;
    private String bankName;
    private String bankNumericCode;
    private String firstNameMasked;
    private String lastNameMasked;
    private boolean payzoUser;
}
