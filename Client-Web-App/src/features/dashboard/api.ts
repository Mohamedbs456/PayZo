import { api, type PagedResponse } from "@/lib/api";

/** Mirror of the backend AccountResponse DTO under /client/accounts.
 *  Optional fields are surfaced on the Accounts page (Figma 117:2) and
 *  populated by CBS — once the partner BE extends the account DTO they
 *  flow through naturally; the dashboard tolerates them being absent. */
export interface ClientAccount {
  accountNumber: string;
  bankCode: string;
  bankName: string;
  type: "CHECKING" | "SAVINGS";
  balance: number;
  bankActive: boolean;
  /** Branch/agency name from CBS, e.g. "BIAT . Bennane". */
  branch?: string;
  /** ISO date when the account was opened in CBS. */
  openedAt?: string;
  /** ISO timestamp of the most recent transaction on the account. */
  lastActivityAt?: string;
}

export function getAccounts() {
  return api.get<ClientAccount[]>("/client/accounts");
}

/** Mirror of TransactionResponse under /client/accounts/{n}/transactions. */
export interface ClientTransaction {
  id: string;
  reference: string;
  /** "DEBIT" (money out, you sent) | "CREDIT" (money in, you received). */
  type: "DEBIT" | "CREDIT";
  amount: number;
  counterpartName: string | null;
  counterpartAccount: string | null;
  description: string | null;
  /** ISO-8601 timestamp from the BE OffsetDateTime. */
  timestamp: string;
  /** Status from `transactions.status`; not all values land in the
   *  client view but we keep them in the type to match the BE shape. */
  status?:
    | "PENDING_OTP"
    | "PENDING_SCORING"
    | "APPROVED"
    | "SUSPENDED_PENDING_ANALYST"
    | "REJECTED"
    | "CANCELLED";
  /** Optional ML risk level — drives the "CLEARED" pill on the dashboard row. */
  riskLevel?: "LOW" | "MED" | "HIGH" | null;

  /* ─── Extra fields surfaced by the Transactions page ──────────────────
   * These are optional because the dashboard's `getAccountTransactions`
   * BE call doesn't include them yet; the partner backend will populate
   * them once the unified `/client/transactions` aggregate endpoint
   * lands (B4 in the plan). Until then `mockData.ts` fills them in.
   */

  /** Counterpart's @username — surfaced under the row in the list view. */
  counterpartUsername?: string;
  /** Counterpart's profile picture URL (server-relative). The recent-trx
   *  card and transactions row render this when set; otherwise they
   *  fall back to a colored initials chip. */
  counterpartProfilePictureUrl?: string | null;
  /** Your masked source account, e.g. "BIAT ••8421". */
  sourceMaskedAccount?: string;
  /** Counterpart's masked account, e.g. "BIAT ••4521". */
  destMaskedAccount?: string;
  /** Bank codes for the FROM/TO halves of the transfer. */
  sourceBankCode?: string;
  destBankCode?: string;
  /** True for "between my own accounts" transfers — shown with the
   *  arrow-left-right icon and the "No OTP" subtitle suffix. */
  internal?: boolean;
  /** Optional subtitle suffix appended after the bank route line, e.g.
   *  "Awaiting OTP", "Flagged HIGH risk", "Rejected by analyst". */
  subtitleSuffix?: string;
  /** ML score in the [0..1] range — shown alongside the risk level in
   *  the expanded row's "ML DECISION" cell. */
  mlScore?: number;
  /** Human-friendly label for the FINAL STATUS column, e.g.
   *  "Auto-Approved", "Awaiting OTP", "Held by ML", "Rejected · Analyst". */
  finalStatusLabel?: string;
  /** ISO timestamp the user confirmed the OTP (transfers only). */
  otpConfirmedAt?: string;
  /** Source of the transaction. "PAYZO" = initiated through the PayZo
   *  app (P2P or internal), "EXTERNAL" = pre-existing bank transaction
   *  or originated outside PayZo (legacy CBS row). */
  origin?: "PAYZO" | "EXTERNAL";
}

export function getAccountTransactions(
  accountNumber: string,
  page = 0,
  size = 20,
) {
  return api.get<PagedResponse<ClientTransaction>>(
    `/client/accounts/${accountNumber}/transactions`,
    { query: { page, size } },
  );
}

/** Alert summary used by the dashboard's "Fraud alerts" card. */
export interface ClientAlertSummary {
  alerts: ClientAlert[];
  /** Total alerts across all statuses — drives the "+5" badge. */
  totalCount: number;
  underReviewCount: number;
  rejectedCount: number;
}

export interface ClientAlert {
  id: string;
  transactionId: string;
  transactionReference: string;
  counterpartName: string;
  amount: number;
  /** Snapshot of the transfer's risk classification. */
  riskLevel: "LOW" | "MED" | "HIGH";
  status: "PENDING_ANALYST" | "APPROVED" | "REJECTED" | "CANCELLED";
  /** ISO-8601 timestamp. */
  createdAt: string;
  /** Free-text reason the analyst (or ML) flagged it. */
  reason: string | null;

  /* ─── Extra fields surfaced by the Alerts page ────────────────────────
   * Optional so the existing dashboard summary card stays compatible —
   * the partner BE will populate these once the unified alerts payload
   * lands. mockData fills them in for demo mode.
   */

  /** Counterpart's @username for the "@x · BIAT ••8421 → STB ••9947" line. */
  counterpartUsername?: string;
  /** Source/dest masked accounts + bank codes for the route line + bank filter. */
  sourceMaskedAccount?: string;
  destMaskedAccount?: string;
  sourceBankCode?: string;
  destBankCode?: string;

  /** Bullet list of ML reasons surfaced by "Why we flagged this". */
  mlReasons?: string[];

  /** ISO timestamp when the analyst decided (APPROVED / REJECTED). */
  decidedAt?: string;
  /** Analyst's display name + role. */
  decidedByName?: string;
  /** Analyst's free-text quote shown next to their name. */
  decisionComment?: string;
  /** Trust score delta this decision applied — positive on approve,
   *  negative on reject (and small negative on approved-with-friction). */
  trustDelta?: number;
}

export function getAlertSummary() {
  return api.get<ClientAlertSummary>("/client/alerts/summary");
}
