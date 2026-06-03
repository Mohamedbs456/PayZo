import { api } from "@/lib/api/client";
import type { PagedResponse } from "@/lib/api/types";
import type {
  AmountBand,
  DashboardPeriod,
  RiskLevel,
} from "@/features/transactions/api";

export type AlertStatus = "PENDING" | "VALIDATED" | "REJECTED";

export type Role = "CLIENT" | "ADMIN" | "ANALYST" | "SUPERADMIN";

export interface FraudAlert {
  id: string;
  transactionId: string;
  transactionReference: string;
  amount: string;
  riskScore: string | null;
  riskLevel: RiskLevel;
  sourceBankCode: string;
  destBankCode: string;
  status: AlertStatus;
  clientCin: string;
  clientName: string;
  mlReasons: string[];
  analystComment: string | null;
  analystId: string | null;
  analystName: string | null;
  analystRole: Role | null;
  trustDelta: number | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface FetchFraudAlertsParams {
  status?: AlertStatus | null;
  risk?: RiskLevel | null;
  bankCode?: string | null;
  amount?: AmountBand | null;
  period?: DashboardPeriod | null;
  q?: string;
  page?: number;
  size?: number;
  signal?: AbortSignal;
}

export function fetchFraudAlerts(
  params: FetchFraudAlertsParams,
): Promise<PagedResponse<FraudAlert>> {
  return api.get<PagedResponse<FraudAlert>>("/fraud-alerts", {
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

export function fetchFraudAlert(
  id: string,
  signal?: AbortSignal,
): Promise<FraudAlert> {
  return api.get<FraudAlert>(`/fraud-alerts/${id}`, { signal });
}

/**
 * Approve = "this is NOT fraud" — the suspended transfer resumes and CBS
 * executes it. Comment is optional.
 */
export function approveAlert(id: string, comment?: string): Promise<void> {
  return api.patch<void>(
    `/fraud-alerts/${id}/approve`,
    comment && comment.trim() ? { comment: comment.trim() } : {},
  );
}

/**
 * Reject = "this IS fraud" — the suspended transfer is killed and the
 * receiver's trust score takes a hit. Comment is required (backend enforces).
 */
export function rejectAlert(id: string, comment: string): Promise<void> {
  return api.patch<void>(`/fraud-alerts/${id}/reject`, { comment });
}
