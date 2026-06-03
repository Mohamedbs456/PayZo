import { api } from "@/lib/api/client";
import type { PagedResponse } from "@/lib/api/types";
import type { ActiveLayer } from "@/features/transactions/api";

export interface MlConfig {
  thresholdLowMedium: string;
  thresholdMediumHigh: string;
  modelVersion: string;
  activeLayer: ActiveLayer;
  updatedAt: string;
}

export interface MlMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  aucRoc: number;
  aucPr: number;
}

export interface ThresholdReport {
  id: string;
  analystId: string;
  analystName: string;
  suggestedLowMedium: string;
  suggestedMediumHigh: string;
  description: string;
  justification: string;
  submittedAt: string;
  /** Set when the SuperAdmin acknowledged the report. */
  readAt: string | null;
}

/* ─── Read (Analyst + SA) ─────────────────────────────────────────────── */

export function fetchMlConfig(signal?: AbortSignal): Promise<MlConfig> {
  return api.get<MlConfig>("/analyst/ml-config", { signal });
}

export function fetchMlMetrics(signal?: AbortSignal): Promise<MlMetrics> {
  return api.get<MlMetrics>("/analyst/ml-metrics", { signal });
}

/* ─── SA-only mutations ───────────────────────────────────────────────── */

export interface UpdateThresholdsBody {
  thresholdLowMedium: string;
  thresholdMediumHigh: string;
}

export function updateThresholds(body: UpdateThresholdsBody): Promise<void> {
  return api.put<void>("/superadmin/ml-threshold", body);
}

export function fetchThresholdReports(params: {
  page?: number;
  size?: number;
  signal?: AbortSignal;
}): Promise<PagedResponse<ThresholdReport>> {
  return api.get<PagedResponse<ThresholdReport>>("/superadmin/ml/threshold-reports", {
    query: {
      page: params.page ?? 0,
      size: params.size ?? 20,
    },
    signal: params.signal,
  });
}

export function markReportRead(id: string): Promise<ThresholdReport> {
  return api.put<ThresholdReport>(`/superadmin/ml/threshold-reports/${id}/read`);
}

/* ─── Analyst submission ──────────────────────────────────────────────── */

export interface SubmitReportBody {
  suggestedLowMedium: string;
  suggestedMediumHigh: string;
  description: string;
  justification: string;
}

export function submitThresholdReport(body: SubmitReportBody): Promise<ThresholdReport> {
  return api.post<ThresholdReport>("/analyst/ml/threshold-reports", body);
}
