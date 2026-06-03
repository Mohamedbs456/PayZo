import { api } from "@/lib/api/client";
import type { PagedResponse } from "@/lib/api/types";
import type { ClientAlert } from "@/features/dashboard/api";

export function listAlerts(
  opts: {
    page?: number;
    size?: number;
    status?: "ALL" | "PENDING_ANALYST" | "APPROVED" | "REJECTED" | "CANCELLED";
    risk?: "ALL" | "LOW" | "MED" | "HIGH";
    bank?: string;
    period?: string;
  } = {},
) {
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

// Client-initiated cancel of a pending alert — sets the transaction to
// CANCELLED with reason CLIENT_CANCELLED. Only valid while PENDING_ANALYST.
export function cancelPendingAlert(alertId: string) {
  return api.delete<void>(`/client/alerts/${alertId}/cancel-pending`);
}
