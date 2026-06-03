/**
 * Demo mode — opt-in via `?demo` (or `?demo=1`) in the URL. When active,
 * sign-up pages skip backend calls and substitute mock data so the
 * flow can be walked end-to-end while the partner backend is still
 * catching up to the 4-frame Figma design.
 *
 * Production behavior is unchanged when the flag is absent.
 */

export function isDemoMode(): boolean {
  if (typeof window === "undefined") return false;
  // PROD-safety: demo mode is a dev-only walkthrough fixture. In production
  // builds the `?demo` flag is ignored so it can't be used to walk past
  // ProtectedRoute. Without this gate, anyone could browse to
  // `/dashboard?demo` and render authenticated UI (API calls would still
  // 401, but the route tree + mock fixtures would leak).
  if (!import.meta.env.DEV) return false;
  return new URLSearchParams(window.location.search).has("demo");
}

/**
 * Append `?demo` (or `&demo`) to a navigation path so the flag is
 * preserved across `navigate()` calls. No-op when demo mode isn't
 * currently active.
 */
export function withDemo(path: string): string {
  if (!isDemoMode()) return path;
  return path.includes("?") ? `${path}&demo` : `${path}?demo`;
}

/**
 * Mock profile returned by `previewRegistration` in demo mode. Matches
 * the visual filled-in state of Figma 77:38 so the verified-profile
 * card looks realistic.
 */
export const DEMO_PROFILE = {
  firstName: "Ahmed",
  lastName: "Ben Ali",
  cin: "08891234",
  email: "ahmed.benali@***.tn",
  phone: "+216 71 234 ***",
  governorate: "Tunis",
} as const;

/** Mock destination chip for the forgot-password OTP screen. */
export const DEMO_RESET_DESTINATION = "a•••@gmail.com";

/** Mock reset token surfaced in demo mode — never decoded anywhere. */
export const DEMO_RESET_TOKEN = "demo.reset.token";

/**
 * Mock `/client/profile` payload returned by `MeProvider` in demo mode.
 * Matches the shape of the backend `ClientProfile` record so the
 * production code path is unchanged. Trust score 72 mirrors Figma.
 */
export const DEMO_ME = {
  id: "00000000-0000-0000-0000-000000000000",
  keycloakId: "00000000-0000-0000-0000-000000000000",
  cin: "08891234",
  username: "ahmed.benali",
  firstName: "Ahmed",
  lastName: "Ben Ali",
  profilePictureUrl: null,
  trustScore: 72,
  // Matches the BIAT savings (•••• 8234) in DEMO_ACCOUNTS so the
  // ★ default-account marker has a visible target in demo mode.
  defaultAccountId: "001118282345",
  status: "ACTIVE" as const,
  firstLoginCompleted: true,
  email: "ahmed.benali@gmail.com",
  phone: "+216 71 234 567",
  address: "Avenue Habib Bourguiba",
  governorate: "Tunis",
  dateOfBirth: "1985-06-15",
};
