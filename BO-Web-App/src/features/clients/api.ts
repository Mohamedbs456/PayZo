import { api } from "@/lib/api/client";
import type { PagedResponse } from "@/lib/api/types";

export type ClientStatus =
  | "PENDING"
  | "ACCEPTED"
  | "ACTIVE"
  | "BLOCKED"
  | "REJECTED";

export interface ClientListItem {
  userId: string;
  keycloakId: string | null;
  cin: string;
  username: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  governorate: string | null;
  address: string | null;
  /** ISO yyyy-MM-dd; null for backoffice users (we never list those here, but the column is nullable). */
  dateOfBirth: string | null;
  profilePictureUrl: string | null;
  status: ClientStatus;
  /** ISO datetime — when the user record was created (registration time). */
  createdAt: string;
  /** ISO datetime — last time any field on the user row changed. */
  updatedAt: string;

  firstLoginCompleted: boolean;
  /** 0–100 for clients; null for non-Client subtypes. */
  trustScore: number | null;
  /** 12-digit account number flagged as the client's default destination —
   *  the BO Accounts page renders a yellow star pill on the matching row. */
  defaultAccountId: string | null;

  /** "Self-registered" if the client signed up themselves; otherwise "Admin · First Last". */
  createdByName: string | null;

  /** Pre-formatted, e.g. "Admin · Mohamed Khelifi". Null for PENDING / never-decided rows. */
  decidedByName: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
}

/** Status filter accepted by the backend; null/undefined means "all statuses". */
export type ClientStatusFilter = ClientStatus | null;

export interface FetchClientsParams {
  status?: ClientStatusFilter;
  q?: string;
  page?: number;
  /** Backend clamps to [1, 100]; we pass 10 for the infinite-scroll page size. */
  size?: number;
  signal?: AbortSignal;
}

export function fetchClients(
  params: FetchClientsParams,
): Promise<PagedResponse<ClientListItem>> {
  return api.get<PagedResponse<ClientListItem>>("/admin/clients", {
    query: {
      // `null` is sent as the literal string "null" by URLSearchParams, so we
      // collapse "null"/undefined to undefined here — the api client drops
      // undefined query params entirely, which is what we want for "All".
      status: params.status ?? undefined,
      q: params.q?.trim() || undefined,
      page: params.page ?? 0,
      size: params.size ?? 10,
    },
    signal: params.signal,
  });
}

export interface ClientCbsSummary {
  /** Number of CBS accounts this client owns (across all banks). */
  accountCount: number;
  /** Sum of balances across those accounts (TND). String to preserve BigDecimal precision. */
  totalBalance: string;
}

export function fetchClientCbsSummary(
  userId: string,
  signal?: AbortSignal,
): Promise<ClientCbsSummary> {
  return api.get<ClientCbsSummary>(`/admin/clients/${userId}/cbs-summary`, {
    signal,
  });
}

/**
 * Fetch the current state of one client. Used after a lifecycle action
 * (approve/reject/block/unblock) so the FE has the new `status`,
 * `decidedBy/At`, etc. without reloading the whole paged list.
 *
 * Endpoint reuses GET /admin/subscriptions/{userId} which is implemented as a
 * `clientRepository.findById` lookup — works for any status, not just PENDING.
 */
export function fetchClient(userId: string): Promise<ClientListItem> {
  return api.get<ClientListItem>(`/admin/subscriptions/${userId}`);
}

/**
 * Hard-deletes a client and every record that references them (transactions,
 * fraud alerts, favorites, notifications, audit, OTPs, Keycloak account).
 * Powering the Delete button in every expanded-row layout.
 */
export function deleteClient(userId: string): Promise<void> {
  return api.delete<void>(`/admin/clients/${userId}`);
}

/**
 * Approve a PENDING registration. Backend:
 *   - creates the Keycloak user
 *   - sets status=ACTIVE (firstLoginCompleted stays false until first login)
 *   - emails credentials
 *   - records the decision in audit + sends an in-app notification
 */
export function approveClient(userId: string): Promise<void> {
  return api.post<void>(`/admin/subscriptions/${userId}/approve`);
}

/** Reject a PENDING registration. Optional reason is shown to the client. */
export function rejectClient(userId: string, reason?: string): Promise<void> {
  return api.post<void>(
    `/admin/subscriptions/${userId}/reject`,
    reason && reason.trim() ? { reason: reason.trim() } : undefined,
  );
}

/** Block an ACTIVE / ACCEPTED-derived client (disable Keycloak + status=BLOCKED). */
export function blockClient(userId: string): Promise<void> {
  return api.put<void>(`/admin/clients/${userId}/block`);
}

/** Unblock a BLOCKED client (re-enable Keycloak + status=ACTIVE). */
export function unblockClient(userId: string): Promise<void> {
  return api.put<void>(`/admin/clients/${userId}/unblock`);
}

/**
 * CBS-side identity preview shown in the Register-client dialog before the
 * admin confirms. `alreadyRegistered` flips true when the CIN already maps
 * to a PayZo client — the FE disables Create in that case.
 */
export interface CbsClientPreview {
  cin: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  governorate: string;
  address: string;
  /** ISO yyyy-MM-dd. */
  dateOfBirth: string | null;
  alreadyRegistered: boolean;
}

/** Look up a CIN in CBS without creating anything. 404 if CIN is unknown. */
export function previewCbsClient(
  cin: string,
  signal?: AbortSignal,
): Promise<CbsClientPreview> {
  return api.get<CbsClientPreview>(`/admin/cbs/clients/${cin}`, { signal });
}

/**
 * Direct subscription — admin-driven path that skips the PENDING stage.
 * Backend creates the Keycloak account, sets status=ACTIVE (firstLogin=false
 * until the client logs in), and emails credentials.
 */
export function directRegisterClient(cin: string): Promise<void> {
  return api.post<void>("/admin/subscriptions/direct", { cin });
}
