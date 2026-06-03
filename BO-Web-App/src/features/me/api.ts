import { api } from "@/lib/api/client";

/**
 * Backoffice "me" API. All three endpoints land at `/api/v1/me/**` and are
 * locked to ADMIN / ANALYST / SUPERADMIN by SecurityConfig.
 *
 *   GET   /me                       → live BO profile payload
 *   POST  /me/password/initiate     → step 1: verify current password + send OTP
 *   PATCH /me/password              → step 2: validate OTP + rotate password
 *
 * Email delivery currently goes through OtpService's dev path (logs the OTP
 * to backend stdout when `otp.delivery.enabled=false`). The OTP itself is
 * fully wired — when SMTP is enabled, the OTP arrives by email with no
 * frontend changes needed.
 */

/* ─── Profile ─────────────────────────────────────────────────────────── */

export type BoMeRole = "ADMIN" | "ANALYST" | "SUPERADMIN";

export type BoMeStatus = "PENDING" | "ACCEPTED" | "ACTIVE" | "BLOCKED" | "REJECTED";

export interface BoMe {
  userId: string;
  keycloakId: string | null;
  username: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  governorate: string | null;
  address: string | null;
  /** ISO yyyy-MM-dd; null for backoffice users that don't store one. */
  dateOfBirth: string | null;
  profilePictureUrl: string | null;
  role: BoMeRole;
  status: BoMeStatus;
  createdAt: string;
  updatedAt: string;
  /** False until the user rotates the emailed temp password — drives the
   *  auto-popped change-password modal on first dashboard mount. */
  firstLoginCompleted: boolean;
}

export function fetchBoMe(signal?: AbortSignal): Promise<BoMe> {
  return api.get<BoMe>("/me", { signal });
}

/**
 * Upload a new profile picture. Sends multipart/form-data with a single
 * "file" field. Backend caps at 5 MB and accepts JPEG / PNG / WEBP.
 * Returns the publicly-served URL (already cache-busted server-side).
 */
export async function uploadProfilePicture(file: File): Promise<string> {
  const session = (await import("@/lib/auth/session")).session.get();
  if (!session) throw new Error("Not authenticated");
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(
    `${(await import("@/lib/env")).env.apiBaseUrl}/me/picture`,
    {
      method: "PUT",
      body: form,
      headers: { Authorization: `Bearer ${session.tokens.accessToken}` },
    },
  );
  const json = (await res.json()) as {
    success: boolean;
    message?: string;
    data?: { profilePictureUrl: string };
  };
  if (!res.ok || !json.success || !json.data?.profilePictureUrl) {
    throw new Error(json.message ?? "Upload failed");
  }
  return json.data.profilePictureUrl;
}

/* ─── Password change (2-step OTP) ────────────────────────────────────── */

export interface InitiatePasswordChangeBody {
  currentPassword: string;
}

export function initiatePasswordChange(body: InitiatePasswordChangeBody): Promise<void> {
  return api.post<void>("/me/password/initiate", body);
}

export interface ConfirmPasswordChangeBody {
  otp: string;
  newPassword: string;
}

export function confirmPasswordChange(body: ConfirmPasswordChangeBody): Promise<void> {
  return api.patch<void>("/me/password", body);
}

/* ─── First-login one-shot rotation (no OTP, no current pw) ─────────── */

export interface FirstLoginPasswordBody {
  newPassword: string;
}

/**
 * Single-call endpoint used by the forced first-login modal. The JWT itself
 * proves identity (the caller just authenticated with the emailed temp
 * password); backend rejects with 409 if `firstLoginCompleted=true`.
 */
export function firstLoginPasswordChange(
  body: FirstLoginPasswordBody,
): Promise<void> {
  return api.patch<void>("/me/password/first-login", body);
}
