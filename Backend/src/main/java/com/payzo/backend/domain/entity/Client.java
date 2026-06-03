package com.payzo.backend.domain.entity;

import jakarta.persistence.Column;
import jakarta.persistence.DiscriminatorValue;
import jakarta.persistence.Entity;
import lombok.Getter;
import lombok.Setter;

/**
 * CLIENT subtype — extra columns land in the same `users` table (STI).
 *
 * Per D1, the personal/identity fields (cin, address, governorate, profile_picture_url,
 * first_login_completed, username) live on the User base. Client only carries fields
 * that are genuinely client-specific: trust score (D12) and default account (Impact 1d).
 */
@Entity
@DiscriminatorValue("CLIENT")
@Getter
@Setter
public class Client extends User {

    /**
     * Receiver-side reputation, 0–100, default 50. Adjusted by ML-decision outcomes per D38.
     * STI gotcha: must use columnDefinition with a default so non-Client subtypes (which
     * never touch this field) can be inserted into the shared `users` table.
     */
    @Column(name = "trust_score", columnDefinition = "integer default 50")
    private int trustScore = 50;

    /**
     * Client's preferred CBS account for <em>incoming</em> username-based transfers
     * (D53). When someone sends money via {@code @username}, this is the RIB the
     * money lands in. Auto-picked at {@code SubscriptionService.approveSubscription}
     * (first CHECKING account if available) and changeable by the client via
     * {@code PATCH /api/v1/client/profile/default-account}. 20-digit Tunisian RIB
     * (D49).
     */
    @Column(name = "default_account_id", length = 20)
    private String defaultAccountId;

    public void adjustTrustScore(int delta) {
        this.trustScore = Math.max(0, Math.min(100, this.trustScore + delta));
    }
}
