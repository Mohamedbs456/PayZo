import { api } from "@/lib/api/client";
import type { PagedResponse } from "@/lib/api/types";

export interface ClientAccount {
  accountNumber: string;
  bankCode: string;
  bankName: string;
  type: "CHECKING" | "SAVINGS";
  balance: number;
  bankActive: boolean;
  branch?: string;
  openedAt?: string;
  lastActivityAt?: string;
}

export function getAccounts() {
  return api.get<ClientAccount[]>("/client/accounts");
}

export interface ClientTransaction {
  id: string;
  reference: string;
  type: "DEBIT" | "CREDIT";
  amount: number;
  counterpartName: string | null;
  counterpartAccount: string | null;
  description: string | null;
  timestamp: string;
  status?:
    | "PENDING_OTP"
    | "PENDING_SCORING"
    | "APPROVED"
    | "SUSPENDED_PENDING_ANALYST"
    | "REJECTED"
    | "CANCELLED";
  riskLevel?: "LOW" | "MED" | "HIGH" | null;
  counterpartUsername?: string;
  counterpartProfilePictureUrl?: string | null;
  sourceMaskedAccount?: string;
  destMaskedAccount?: string;
  sourceBankCode?: string;
  destBankCode?: string;
  internal?: boolean;
  subtitleSuffix?: string;
  mlScore?: number;
  finalStatusLabel?: string;
  otpConfirmedAt?: string;
  origin?: "PAYZO" | "EXTERNAL";
}

export function getRecentTransactions(size = 4) {
  return api.get<PagedResponse<ClientTransaction>>("/client/transactions", {
    query: { page: 0, size },
  });
}

export interface ClientAlert {
  id: string;
  transactionId: string;
  transactionReference: string;
  counterpartName: string;
  amount: number;
  riskLevel: "LOW" | "MED" | "HIGH";
  status: "PENDING_ANALYST" | "APPROVED" | "REJECTED" | "CANCELLED";
  createdAt: string;
  reason: string | null;
  counterpartUsername?: string;
  sourceMaskedAccount?: string;
  destMaskedAccount?: string;
  sourceBankCode?: string;
  destBankCode?: string;
  mlReasons?: string[];
  decidedAt?: string;
  decidedByName?: string;
  decisionComment?: string;
  trustDelta?: number;
}

export interface ClientAlertSummary {
  alerts: ClientAlert[];
  totalCount: number;
  underReviewCount: number;
  rejectedCount: number;
}

export function getAlertSummary() {
  return api.get<ClientAlertSummary>("/client/alerts/summary");
}
