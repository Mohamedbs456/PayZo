import { api } from "@/lib/api/client";
import type { PagedResponse } from "@/lib/api/types";

/* ─── DTOs (mirror payzo-backend response shapes) ─────────────────────── */

export interface SystemKpiData {
  totalClients: number;
  totalAdmins: number;
  totalAnalysts: number;
  totalTransactions: number;
  totalFraudDetected: number;
  systemFraudRate: number;
}

export interface BankClientCount {
  bankCode: string;
  bankName: string;
  count: number;
}

export interface BankDateAmount {
  date: string;
  bankCode: string;
  totalAmount: string;
}

export interface BankVolumeCount {
  bankCode: string;
  totalAmount: string;
  count: number;
}

export interface AdminDashboardSlice {
  clientsPerBank: BankClientCount[];
}

export interface AnalystKpiData {
  pendingAlerts: number;
  decidedToday: number;
  fraudConfirmedRate: number;
  totalTransactionVolume: string;
  totalTransactionCount: number;
}

export interface AnalystDashboardSlice {
  kpis: AnalystKpiData;
  transactionVolumeByBank: BankVolumeCount[];
}

export interface SuperAdminDashboardResponse {
  adminDashboard: AdminDashboardSlice;
  analystDashboard: AnalystDashboardSlice;
  systemKpis: SystemKpiData;
  moneyFlowPerBankOverTime: BankDateAmount[];
}

export type DashboardPeriod = "today" | "7d" | "30d" | "90d" | "all";

/* ─── Transaction list (used for 1D hourly bucketing) ─────────────────── */

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
  status: string;
  riskLevel: string | null;
  createdAt: string;
}

import type { PagedResponse as Paged } from "@/lib/api/types";

export function fetchTransactions(params: {
  period?: DashboardPeriod;
  page?: number;
  size?: number;
  signal?: AbortSignal;
}): Promise<Paged<TransactionListItem>> {
  return api.get<Paged<TransactionListItem>>("/transactions", {
    query: {
      period: params.period,
      page: params.page ?? 0,
      size: params.size ?? 100,
    },
    signal: params.signal,
  });
}

/* ─── Fraud alerts (used by the recent-alerts card) ────────────────────── */

export type AlertStatus = "PENDING" | "VALIDATED" | "REJECTED";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface FraudAlertItem {
  id: string;
  transactionId: string;
  transactionReference: string;
  amount: string;
  riskLevel: RiskLevel;
  sourceBankCode: string;
  destBankCode: string;
  status: AlertStatus;
  clientCin: string;
  clientName: string;
  createdAt: string;
}

/* ─── ML model info (used by the ML model card) ───────────────────────── */

export type ActiveLayer = "PRIMARY" | "BACKUP" | "STUB";

export interface MlConfigData {
  thresholdLowMedium: number;
  thresholdMediumHigh: number;
  modelVersion: string;
  activeLayer: ActiveLayer;
  updatedAt: string;
}

export interface MlMetricsData {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  aucRoc: number;
  aucPr: number;
}

export function fetchMlConfig(signal?: AbortSignal): Promise<MlConfigData> {
  return api.get<MlConfigData>("/analyst/ml-config", { signal });
}

export function fetchMlMetrics(signal?: AbortSignal): Promise<MlMetricsData> {
  return api.get<MlMetricsData>("/analyst/ml-metrics", { signal });
}

export function fetchFraudAlerts(params: {
  status?: AlertStatus;
  page?: number;
  size?: number;
  signal?: AbortSignal;
}): Promise<Paged<FraudAlertItem>> {
  return api.get<Paged<FraudAlertItem>>("/fraud-alerts", {
    query: {
      status: params.status,
      page: params.page ?? 0,
      size: params.size ?? 20,
    },
    signal: params.signal,
  });
}

/* ─── Fetchers ────────────────────────────────────────────────────────── */

export function fetchSuperAdminDashboard(
  period: DashboardPeriod,
  signal?: AbortSignal,
): Promise<SuperAdminDashboardResponse> {
  return api.get<SuperAdminDashboardResponse>("/superadmin/dashboard", {
    query: { period },
    signal,
  });
}

/* ─── Admin / Analyst dashboard payloads (subset of the SA shape) ────── */

export interface AdminDashboardKpiData {
  pendingSubscriptions: number;
  activeClients: number;
  blockedClients: number;
  decisionsToday: number;
}

export interface AdminDashboardResponse {
  kpis: AdminDashboardKpiData;
  subscriptionsOverTime: { date: string; count: number }[];
  clientStatusDistribution: { status: string; count: number }[];
  clientsPerBank: BankClientCount[];
}

export function fetchAdminDashboard(
  period: DashboardPeriod,
  signal?: AbortSignal,
): Promise<AdminDashboardResponse> {
  return api.get<AdminDashboardResponse>("/admin/dashboard/stats", {
    query: { period },
    signal,
  });
}

export interface AnalystDashboardResponseData {
  kpis: AnalystKpiData;
  alertsOverTime: { date: string; count: number }[];
  riskLevelDistribution: { level: string; count: number }[];
  alertStatusDistribution: { status: string; count: number }[];
  transactionVolumeByBank: BankVolumeCount[];
  transactionsByHour: { hour: number; count: number }[];
}

export function fetchAnalystDashboard(
  period: DashboardPeriod,
  signal?: AbortSignal,
): Promise<AnalystDashboardResponseData> {
  return api.get<AnalystDashboardResponseData>("/analyst/dashboard", {
    query: { period },
    signal,
  });
}

/**
 * Banks list — used to count banks (paged, size capped at 100 backend-side).
 * For a count in 0-100 banks the first page is sufficient.
 *
 * NOTE: backend's `BankResponse` uses `active` (not `isActive`). Match the
 * wire format here exactly so consumers don't end up with `undefined`.
 */
export interface BankSummary {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export function fetchBanks(
  signal?: AbortSignal,
): Promise<PagedResponse<BankSummary>> {
  return api.get<PagedResponse<BankSummary>>("/superadmin/banks", {
    query: { page: 0, size: 100 },
    signal,
  });
}
