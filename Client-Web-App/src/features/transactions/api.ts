import { api, type PagedResponse } from "@/lib/api";
import type { ClientTransaction } from "@/features/dashboard/api";

/**
 * Aggregate listing across all of a client's accounts (B4). The backend
 * endpoint `/client/transactions` ships server-side filters for account,
 * type, status, bank, period, and origin — all opts below map directly to
 * query params. The `q` free-text search is processed via the backend's
 * `SearchSpecification<T>` utility.
 */
export function listTransactions(opts: {
  page?: number;
  size?: number;
  account?: string;
  q?: string;
  type?: "ALL" | "SENT" | "RECEIVED" | "INTERNAL";
  status?: "ALL" | "APPROVED" | "PENDING" | "REJECTED" | "CANCELLED";
  bank?: string;
  /** "today" | "7d" | "30d" | "90d" | "all" */
  period?: string;
  /** "ALL" | "PAYZO" (P2P + internal) | "EXTERNAL" (pre-existing bank rows) */
  origin?: "ALL" | "PAYZO" | "EXTERNAL";
} = {}) {
  return api.get<PagedResponse<ClientTransaction>>("/client/transactions", {
    query: {
      page: opts.page ?? 0,
      size: opts.size ?? 20,
      account: opts.account,
      q: opts.q,
      type: opts.type === "ALL" ? undefined : opts.type,
      status: opts.status === "ALL" ? undefined : opts.status,
      bank: opts.bank === "ALL" ? undefined : opts.bank,
      period: opts.period,
      origin: opts.origin === "ALL" ? undefined : opts.origin,
    },
  });
}
