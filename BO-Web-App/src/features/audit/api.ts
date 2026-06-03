import { api } from "@/lib/api/client";
import type { PagedResponse } from "@/lib/api/types";

/**
 * Audit log feed. Three scopes:
 *  - {@code ADMIN}/{@code ANALYST}: per-actor decision history
 *    ({@code /admin/decisions/history}, {@code /analyst/decisions/history}).
 *    The calling user only sees their own rows.
 *  - {@code SUPERADMIN}: system-wide feed via {@code /superadmin/audit-log}.
 *    Every row in {@code audit_logs}, newest first — admin acceptances,
 *    analyst threshold reports, SA actions, all of it.
 */
export interface AuditLogEntry {
  id: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: string | null;
  createdAt: string;
}

export type AuditScope = "ADMIN" | "ANALYST" | "SUPERADMIN";

export interface FetchAuditLogParams {
  scope: AuditScope;
  page?: number;
  size?: number;
  signal?: AbortSignal;
}

export function fetchAuditLog(
  params: FetchAuditLogParams,
): Promise<PagedResponse<AuditLogEntry>> {
  const path =
    params.scope === "SUPERADMIN"
      ? "/superadmin/audit-log"
      : params.scope === "ADMIN"
        ? "/admin/decisions/history"
        : "/analyst/decisions/history";
  return api.get<PagedResponse<AuditLogEntry>>(path, {
    query: {
      page: params.page ?? 0,
      size: params.size ?? 20,
    },
    signal: params.signal,
  });
}
