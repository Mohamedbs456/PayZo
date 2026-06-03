package com.payzo.backend.dto.response.client;

import lombok.Builder;
import lombok.Data;

/**
 * Result of {@code POST /api/v1/client/transfers/resolve-username}. The
 * sender's confirmation card on the PayZo-username send path renders from this:
 * avatar (profile picture or initials), full name, trust score (numeric + band),
 * and two buttons ("Yes, that's them" / "Wrong person, go back"). Bank info and
 * masked account included for downstream UX but the spec'd card itself uses
 * only avatar + name + trust score.
 */
@Data
@Builder
public class UsernameResolveResponse {

    private String username;
    private String firstName;
    private String lastName;
    private String profilePictureUrl;
    private int trustScore;
    private String accountNumberMasked;
    private String bankCode;
    private String bankName;
}
