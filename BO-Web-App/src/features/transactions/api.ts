import { api } from "@/lib/api/client";
import type { PagedResponse } from "@/lib/api/types";

/* ─── Enums (mirror payzo-backend) ────────────────────────────────────── */

export type TransactionStatus =
  | "PENDING_OTP"
  | "PENDING_SCORING"
  | "APPROVED"
  | "REJECTED"
  | "SUSPENDED_PENDING_ANALYST"
  /** Client (or SA override) cancelled a pending transfer before it executed.
   *  Distinct from REJECTED, which is an analyst fraud verdict. Money never
   *  moved in either case, but the FE renders different pills. */
  | "CANCELLED";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type AmountBand =
  | "UNDER_1K"
  | "BETWEEN_1K_5K"
  | "BETWEEN_5K_10K"
  | "OVER_10K";

export type ActiveLayer = "PRIMARY" | "BACKUP" | "STUB";

export type DashboardPeriod = "today" | "7d" | "30d" | "90d" | "all";

/* ─── DTOs ────────────────────────────────────────────────────────────── */

export interface TransactionListItem {
  id: string;
  reference: string;
  clientCin: string;
  clientName: string;
  sourceBankCode: string;
  party: string | null;
  destAccountNumber: string;
  destBankCode: string;
  amount: string;
  status: TransactionStatus;
  riskLevel: RiskLevel | null;
  createdAt: string;
}

export interface TransactionDetail {
  id: string;
  reference: string;
  status: TransactionStatus;
  amount: string;
  motif: string | null;
  from: TransactionParty;
  to: TransactionParty;
  timeline: {
    createdAt: string;
    otpConfirmedAt: string | null;
    decidedAt: string | null;
    settledAt: string | null;
  };
  ml: {
    score: string | null;
    level: RiskLevel | null;
    activeLayer: ActiveLayer | null;
    reasons: string[];
    trustDelta: number | null;
  };
}

export interface TransactionParty {
  name: string;
  username: string | null;
  accountNumber: string;
  bankCode: string;
}

/* ─── Fetchers ────────────────────────────────────────────────────────── */

export interface FetchTransactionsParams {
  status?: TransactionStatus | null;
  risk?: RiskLevel | null;
  bankCode?: string | null;
  amount?: AmountBand | null;
  period?: DashboardPeriod | null;
  q?: string;
  page?: number;
  size?: number;
  signal?: AbortSignal;
}

export function fetchTransactions(
  params: FetchTransactionsParams,
): Promise<PagedResponse<TransactionListItem>> {
  return api.get<PagedResponse<TransactionListItem>>("/transactions", {
    query: {
      status: params.status ?? undefined,
      risk: params.risk ?? undefined,
      bankCode: params.bankCode?.trim() || undefined,
      amount: params.amount ?? undefined,
      period: params.period ?? undefined,
      q: params.q?.trim() || undefined,
      page: params.page ?? 0,
      size: params.size ?? 15,
    },
    signal: params.signal,
  });
}

export function fetchTransactionDetail(
  id: string,
  signal?: AbortSignal,
): Promise<TransactionDetail> {
  return api.get<TransactionDetail>(`/transactions/${id}`, { signal });
}
