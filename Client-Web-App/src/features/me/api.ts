import { api } from "@/lib/api/client";

/**
 * Mirror of the backend `ClientProfile` DTO
 * (`Backend/src/main/java/com/payzo/backend/dto/client/ClientProfile.java`).
 *
 * Joins the PayZo-owned slice of the user (status, trust score, default
 * account, first-login flag) with CBS-sourced identity fields. The CBS
 * fields are read-only in the client app.
 */
export interface ClientProfile {
  id: string;
  keycloakId: string;
  cin: string;
  username: string;

  // PayZo-owned (cached locally for search / display)
  firstName: string;
  lastName: string;
  profilePictureUrl: string | null;
  trustScore: number;
  defaultAccountId: string | null;
  status: "PENDING_APPROVAL" | "ACCEPTED" | "ACTIVE" | "BLOCKED" | "REJECTED";
  firstLoginCompleted: boolean;

  // CBS-sourced (authoritative — never duplicated locally)
  email: string;
  phone: string;
  address: string;
  governorate: string;
  /** ISO date string `YYYY-MM-DD`. */
  dateOfBirth: string;
}

export function getProfile() {
  return api.get<ClientProfile>("/client/profile");
}

/**
 * In-profile password change (D45 / Impact 21). No OTP — the JWT plus a
 * correct `currentPassword` is the proof of identity. Backend wires
 * this to PATCH `/clients/me/password` and pushes the new credential
 * into Keycloak.
 */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export function changePassword(req: ChangePasswordRequest) {
  return api.patch<void>("/clients/me/password", req);
}

/**
 * Persist the client's chosen default destination account. BE
 * validates that the account belongs to this client (CBS lookup by
 * accountNumber → assert {@code clientCin} matches) before saving;
 * a stale account-number that no longer belongs to the user surfaces
 * as a 404. Returns the saved value so the caller can patch the
 * {@code me} cache without a refetch.
 */
export interface SetDefaultAccountResponse {
  defaultAccountId: string;
}

export function setDefaultAccount(accountNumber: string) {
  return api.patch<SetDefaultAccountResponse>(
    "/client/profile/default-account",
    { accountNumber },
  );
}

/**
 * Edit the {@code @username} (D54). Caller strips the leading `@` —
 * backend defensively re-normalises. On 200 the response is the full
 * updated {@link ClientProfile}, ready to hydrate `MeProvider`.
 *
 * Backend error codes the caller should map to inline UI:
 *  - 422 `USERNAME_INVALID`  — format violation
 *  - 409 `USERNAME_TAKEN`    — case-insensitive collision
 *  - 409 `USERNAME_RESERVED` — reserved handle
 *
 * Idempotent: same value as the persisted one returns 200 without writing.
 */
export function updateUsername(username: string) {
  return api.patch<ClientProfile>("/client/profile/username", { username });
}

/** Multipart upload — backend expects field name `file`. Returns the
 *  new `profilePictureUrl` so MeProvider can patch optimistically. */
export async function uploadProfilePicture(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  // Bypass the json client wrapper for multipart by hitting fetch directly,
  // attaching the bearer ourselves.
  const { session } = await import("@/lib/auth/session");
  const { env } = await import("@/lib/env");
  const token = session.get()?.tokens.accessToken;
  const res = await fetch(`${env.apiBaseUrl}/client/profile/picture`, {
    method: "PUT",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const payload = (await res.json()) as {
    success: boolean;
    message?: string;
    data?: { profilePictureUrl: string };
  };
  if (!res.ok || !payload.success) {
    const { ApiError } = await import("@/lib/api/error");
    throw new ApiError(res.status, payload.message ?? "Upload failed");
  }
  return payload.data?.profilePictureUrl ?? "";
}
