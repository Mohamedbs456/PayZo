import { api, type PagedResponse } from "@/lib/api";
import type { ClientAlert } from "@/features/dashboard/api";

/**
 * Paged listing of the client's fraud alerts. Server-side filters land
 * later (B4); for now the page applies them client-side over a single
 * fetched page.
 */
export function listAlerts(opts: {
  page?: number;
  size?: number;
  status?: "ALL" | "PENDING_ANALYST" | "APPROVED" | "REJECTED" | "CANCELLED";
  risk?: "ALL" | "LOW" | "MED" | "HIGH";
  bank?: string;
  /** "today" | "7d" | "30d" | "90d" | "all" */
  period?: string;
} = {}) {
  return api.get<PagedResponse<ClientAlert>>("/client/alerts", {
    query: {
      page: opts.page ?? 0,
      size: opts.size ?? 20,
      status: opts.status === "ALL" ? undefined : opts.status,
      risk: opts.risk === "ALL" ? undefined : opts.risk,
      bank: opts.bank,
      period: opts.period,
    },
  });
}

/**
 * Cancel a pending alert (client-initiated). Mirrors the route in
 * `BACKEND_IMPACTS.md` for D40 — sets transaction status to CANCELLED
 * with reason `CLIENT_CANCELLED`.
 */
export function cancelPendingAlert(alertId: string) {
  return api.delete<void>(`/client/alerts/${alertId}/cancel-pending`);
}
