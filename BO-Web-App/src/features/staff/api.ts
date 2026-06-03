import { api } from "@/lib/api/client";
import type { PagedResponse } from "@/lib/api/types";

/**
 * Staff Management page DTOs. Two row shapes:
 *   - StaffMember covers admins and analysts (same backend DTO, just role differs).
 *   - BankRow covers banks (different shape, no expanded view per spec).
 *
 * All endpoints are SuperAdmin-only — Spring Security gates them server-side.
 */

export type StaffStatus = "ACTIVE" | "BLOCKED" | "PENDING";

export interface StaffMember {
  id: string;
  keycloakId: string | null;
  username: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  governorate: string | null;
  address: string | null;
  dateOfBirth: string | null;
  profilePictureUrl: string | null;
  role: "ADMIN" | "ANALYST" | "SUPERADMIN";
  status: StaffStatus;
  createdAt: string;
  updatedAt: string;

  firstLoginCompleted: boolean;

  createdByName: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
}

export interface BankRow {
  id: string;
  name: string;
  code: string;
  /** 2-digit numeric bank code from the Tunisian RIB scheme (e.g. "08"). */
  numericCode: string | null;
  logoUrl: string | null;
  active: boolean;
  /** ISO timestamp of the last successful name refresh from CBS. */
  bankNameSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Result of a manual CBS sync trigger (POST /superadmin/banks/sync). */
export interface BankSyncResult {
  firstRun: boolean;
  inserted: number;
  refreshed: number;
  deactivated: number;
}

/* ─── Admin / Analyst lists (offset-paged) ────────────────────────────── */

interface ListParams {
  q?: string;
  page?: number;
  size?: number;
  signal?: AbortSignal;
}

export function fetchAdmins(p: ListParams): Promise<PagedResponse<StaffMember>> {
  return api.get<PagedResponse<StaffMember>>("/superadmin/admins", {
    query: { q: p.q?.trim() || undefined, page: p.page ?? 0, size: p.size ?? 10 },
    signal: p.signal,
  });
}

export function fetchAnalysts(p: ListParams): Promise<PagedResponse<StaffMember>> {
  return api.get<PagedResponse<StaffMember>>("/superadmin/analysts", {
    query: { q: p.q?.trim() || undefined, page: p.page ?? 0, size: p.size ?? 10 },
    signal: p.signal,
  });
}

export function fetchBanksList(p: ListParams): Promise<PagedResponse<BankRow>> {
  return api.get<PagedResponse<BankRow>>("/superadmin/banks", {
    query: { q: p.q?.trim() || undefined, page: p.page ?? 0, size: p.size ?? 20 },
    signal: p.signal,
  });
}

/** Refetch one row by id — used after Block/Unblock to keep the list in sync. */
export function fetchAdmin(id: string): Promise<StaffMember> {
  return api.get<StaffMember>(`/superadmin/admins/${id}`);
}

export function fetchAnalyst(id: string): Promise<StaffMember> {
  return api.get<StaffMember>(`/superadmin/analysts/${id}`);
}

/* ─── Mutations ───────────────────────────────────────────────────────── */

export interface CreateStaffPayload {
  firstName: string;
  lastName: string;
  email: string;
  /** Optional — backend auto-generates `first.last[N]` if omitted. */
  phone?: string;
  governorate?: string;
  address?: string;
  /** ISO yyyy-MM-dd. */
  dateOfBirth?: string;
}

/** Same shape as CreateStaffPayload — backend treats every field as optional. */
export type UpdateStaffPayload = Partial<CreateStaffPayload>;

export function createAdmin(body: CreateStaffPayload): Promise<StaffMember> {
  return api.post<StaffMember>("/superadmin/admins", body);
}

export function createAnalyst(body: CreateStaffPayload): Promise<StaffMember> {
  return api.post<StaffMember>("/superadmin/analysts", body);
}

export function updateAdmin(id: string, body: UpdateStaffPayload): Promise<StaffMember> {
  return api.put<StaffMember>(`/superadmin/admins/${id}`, body);
}

export function updateAnalyst(id: string, body: UpdateStaffPayload): Promise<StaffMember> {
  return api.put<StaffMember>(`/superadmin/analysts/${id}`, body);
}

export function deleteAdmin(id: string): Promise<void> {
  return api.delete<void>(`/superadmin/admins/${id}`);
}

export function deleteAnalyst(id: string): Promise<void> {
  return api.delete<void>(`/superadmin/analysts/${id}`);
}

/** Block any backoffice user (admin or analyst). */
export function blockStaff(userId: string): Promise<void> {
  return api.put<void>(`/superadmin/users/${userId}/block`);
}

export function unblockStaff(userId: string): Promise<void> {
  return api.put<void>(`/superadmin/users/${userId}/unblock`);
}

/* ─── Banks ───────────────────────────────────────────────────────────── */
// CBS owns the bank catalog (D48). The SuperAdmin can only activate /
// deactivate / edit logo + trigger a CBS sync. No create / update / delete.

export interface UpdateBankLogoPayload {
  logoUrl?: string;
}

export function syncBanks(): Promise<BankSyncResult> {
  return api.post<BankSyncResult>("/superadmin/banks/sync");
}

export function updateBankLogo(
  id: string,
  body: UpdateBankLogoPayload,
): Promise<BankRow> {
  return api.put<BankRow>(`/superadmin/banks/${id}/logo`, body);
}

export function deactivateBank(id: string): Promise<void> {
  return api.put<void>(`/superadmin/banks/${id}/deactivate`);
}

export function activateBank(id: string): Promise<void> {
  return api.put<void>(`/superadmin/banks/${id}/activate`);
}
