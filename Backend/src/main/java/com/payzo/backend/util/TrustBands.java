package com.payzo.backend.util;

/**
 * Maps a 0–100 trust score to a 3-level band shown in the UI.
 *
 * Per FRONTEND_DESIGN.md the client app uses a 4-color tooltip (green/green/amber/red),
 * which collapses to 3 traffic-light bands once you ignore the green-vs-green sub-shading:
 *   50–100 → HIGH   (green dot)
 *   20–49  → MEDIUM (amber dot)
 *    0–19  → LOW    (red dot)
 *
 * Backend exposes the band as an enum-shaped string in RecipientLookupResponse (D37 / Impact 7).
 */
public final class TrustBands {

    private TrustBands() {}

    public enum Band { HIGH, MEDIUM, LOW }

    public static Band bandOf(int score) {
        if (score >= 50) return Band.HIGH;
        if (score >= 20) return Band.MEDIUM;
        return Band.LOW;
    }
}
