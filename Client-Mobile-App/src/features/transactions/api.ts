import { api } from "@/lib/api/client";
import type { PagedResponse } from "@/lib/api/types";
import type { ClientTransaction } from "@/features/dashboard/api";

// Aggregate listing across all of a client's accounts. Filters map directly to
// query params; free-text `q` is handled by the backend SearchSpecification.
export function listTransactions(
  opts: {
    page?: number;
    size?: number;
    account?: string;
    q?: string;
    type?: "ALL" | "SENT" | "RECEIVED" | "INTERNAL";
    status?: "ALL" | "APPROVED" | "PENDING" | "REJECTED" | "CANCELLED";
    bank?: string;
    period?: string;
    origin?: "ALL" | "PAYZO" | "EXTERNAL";
  } = {},
) {
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
