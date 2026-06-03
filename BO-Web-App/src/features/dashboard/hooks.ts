import { useCallback, useEffect, useState } from "react";
import {
  fetchAdminDashboard,
  fetchAnalystDashboard,
  fetchBanks,
  fetchFraudAlerts,
  fetchMlConfig,
  fetchMlMetrics,
  fetchSuperAdminDashboard,
  fetchTransactions,
  type DashboardPeriod,
  type FraudAlertItem,
  type MlConfigData,
  type MlMetricsData,
  type SuperAdminDashboardResponse,
  type TransactionListItem,
} from "@/features/dashboard/api";
import { primaryRole } from "@/lib/auth/session";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

function initial<T>(): AsyncState<T> {
  return { data: null, loading: true, error: null };
}

/**
 * Pulls the SA dashboard payload and (in parallel) the banks list to derive
 * a bank count. Returns the staff bar-chart triplet plus loading/error.
 *
 * Banks count comes from a separate endpoint because the backend dashboard
 * DTO doesn't (yet) include it.
 */
export function useStaffCounts(period: DashboardPeriod) {
  const [state, setState] = useState<
    AsyncState<{ admins: number; analysts: number; banks: number }>
  >(initial());
  const [tick, setTick] = useState(0);

  const retry = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));

    Promise.all([
      fetchSuperAdminDashboard(period, ctrl.signal),
      fetchBanks(ctrl.signal),
    ])
      .then(([dashboard, banks]) => {
        if (ctrl.signal.aborted) return;
        // Count only ACTIVE banks. The /superadmin/banks endpoint returns
        // every bank regardless of status (no `active` query param), so
        // we filter client-side. With <=100 banks (current cap), all are
        // in `content` so the count is accurate.
        const activeBanks = banks.content.filter((b) => b.active).length;
        setState({
          data: {
            admins: dashboard.systemKpis.totalAdmins,
            analysts: dashboard.systemKpis.totalAnalysts,
            banks: activeBanks,
          },
          loading: false,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        // eslint-disable-next-line no-console
        console.error("[useStaffCounts]", err);
        setState({
          data: null,
          loading: false,
          error: err instanceof Error ? err : new Error("Unknown error"),
        });
      });

    return () => ctrl.abort();
  }, [period, tick]);

  return { ...state, retry };
}

/**
 * Banks list with retry. Used as a fallback for charts that key off banks
 * (e.g. CLIENTS PER BANK pie) when their primary data source is still empty.
 */
export function useBanks() {
  const [state, setState] = useState<
    AsyncState<{ id: string; code: string; name: string; active: boolean }[]>
  >(initial());
  const [tick, setTick] = useState(0);
  const retry = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));

    fetchBanks(ctrl.signal)
      .then((paged) => {
        if (ctrl.signal.aborted) return;
        setState({ data: paged.content, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        // eslint-disable-next-line no-console
        console.error("[useBanks]", err);
        setState({
          data: null,
          loading: false,
          error: err instanceof Error ? err : new Error("Unknown error"),
        });
      });

    return () => ctrl.abort();
  }, [tick]);

  return { ...state, retry };
}

/**
 * Role-aware dashboard fetch. SA gets the full aggregate; Admin gets a
 * synthetic SA-shaped payload built from `/admin/dashboard/stats` plus
 * a per-bank money-flow series reconstructed from `/transactions`; Analyst
 * gets the same shape from `/analyst/dashboard` + `/transactions`.
 *
 * Returning a single shape lets every existing card keep using the same
 * hook regardless of who's logged in — no prop drilling, no per-role
 * branching at the card level.
 */
export function useDashboard(period: DashboardPeriod) {
  const [state, setState] = useState<AsyncState<SuperAdminDashboardResponse>>(
    initial(),
  );
  const [tick, setTick] = useState(0);
  const retry = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));

    const role = primaryRole();

    const promise: Promise<SuperAdminDashboardResponse> =
      role === "ADMIN"
        ? fetchAdminAdaptedDashboard(period, ctrl.signal)
        : role === "ANALYST"
          ? fetchAnalystAdaptedDashboard(period, ctrl.signal)
          : fetchSuperAdminDashboard(period, ctrl.signal);

    promise
      .then((data) => {
        if (ctrl.signal.aborted) return;
        setState({ data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        // eslint-disable-next-line no-console
        console.error("[useDashboard]", err);
        setState({
          data: null,
          loading: false,
          error: err instanceof Error ? err : new Error("Unknown error"),
        });
      });

    return () => ctrl.abort();
  }, [period, tick]);

  return { ...state, retry };
}

/* ─── Role-scoped dashboard adapters ─────────────────────────────────── */

async function fetchAdminAdaptedDashboard(
  period: DashboardPeriod,
  signal: AbortSignal,
): Promise<SuperAdminDashboardResponse> {
  const [admin, moneyFlow] = await Promise.all([
    fetchAdminDashboard(period, signal),
    buildMoneyFlowFromTransactions(period, signal),
  ]);
  return {
    adminDashboard: { clientsPerBank: admin.clientsPerBank ?? [] },
    analystDashboard: {
      kpis: {
        pendingAlerts: 0,
        decidedToday: 0,
        fraudConfirmedRate: 0,
        totalTransactionVolume: "0",
        totalTransactionCount: 0,
      },
      transactionVolumeByBank: [],
    },
    systemKpis: {
      totalClients: admin.kpis?.activeClients ?? 0,
      totalAdmins: 0,
      totalAnalysts: 0,
      totalTransactions: 0,
      totalFraudDetected: 0,
      systemFraudRate: 0,
    },
    moneyFlowPerBankOverTime: moneyFlow,
  };
}

async function fetchAnalystAdaptedDashboard(
  period: DashboardPeriod,
  signal: AbortSignal,
): Promise<SuperAdminDashboardResponse> {
  const [analyst, moneyFlow] = await Promise.all([
    fetchAnalystDashboard(period, signal),
    buildMoneyFlowFromTransactions(period, signal),
  ]);
  return {
    adminDashboard: { clientsPerBank: [] },
    analystDashboard: {
      kpis: analyst.kpis,
      transactionVolumeByBank: analyst.transactionVolumeByBank ?? [],
    },
    systemKpis: {
      totalClients: 0,
      totalAdmins: 0,
      totalAnalysts: 0,
      totalTransactions: analyst.kpis?.totalTransactionCount ?? 0,
      totalFraudDetected: 0,
      systemFraudRate: 0,
    },
    moneyFlowPerBankOverTime: moneyFlow,
  };
}

/**
 * Reconstructs the SA-shaped `moneyFlowPerBankOverTime` series from the
 * generic `/transactions` list — used by Admin/Analyst dashboards which
 * don't get a flow series from their own endpoint. Bucket key is
 * `(date YYYY-MM-DD, sourceBankCode)`. Approved-only is intentional —
 * the SA endpoint sums `APPROVED` flows the same way.
 */
async function buildMoneyFlowFromTransactions(
  period: DashboardPeriod,
  signal: AbortSignal,
): Promise<{ date: string; bankCode: string; totalAmount: string }[]> {
  const paged = await fetchTransactions({ period, size: 500, signal });
  const buckets = new Map<string, number>(); // key = `${date}|${bank}`
  for (const tx of paged.content) {
    if (!tx.sourceBankCode || !tx.createdAt) continue;
    if (tx.status !== "APPROVED") continue;
    const amount = parseFloat(tx.amount);
    if (!Number.isFinite(amount)) continue;
    const date = tx.createdAt.slice(0, 10); // YYYY-MM-DD
    const key = `${date}|${tx.sourceBankCode}`;
    buckets.set(key, (buckets.get(key) ?? 0) + amount);
  }
  const out: { date: string; bankCode: string; totalAmount: string }[] = [];
  for (const [key, sum] of buckets) {
    const [date, bankCode] = key.split("|");
    out.push({ date, bankCode, totalAmount: String(sum) });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

/* ─── Today's hourly per-source-bank flow ─────────────────────────────── */

interface HourlyBankSeries {
  bankCode: string;
  /** Synthetic ISO date strings of the form `<today>T<HH>:00:00Z` so the
   *  same downstream rendering pipeline (smoothPath, scrubber, etc.) works
   *  unchanged — only the formatter for the scrubber's date label needs
   *  to know it's hour-mode. */
  points: { date: string; amount: number }[];
}

/**
 * Fetches today's transactions and buckets them by (sourceBankCode, hour)
 * so the 1D Money-sent-per-bank chart can draw real hourly curves. Used
 * only when the period tab's xAxis is "hours" — other tabs go through
 * `useDashboard` and the daily aggregate.
 */
export function useTodayHourlyByBank() {
  const [state, setState] = useState<AsyncState<HourlyBankSeries[]>>(
    initial(),
  );
  const [tick, setTick] = useState(0);
  const retry = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));

    fetchTransactions({ period: "today", size: 500, signal: ctrl.signal })
      .then((paged) => {
        if (ctrl.signal.aborted) return;

        // Bucket: bankCode → (hour → summed amount).
        const buckets = new Map<string, Map<number, number>>();
        let isoDay = new Date().toISOString().substring(0, 10); // YYYY-MM-DD
        for (const tx of paged.content) {
          if (!tx.sourceBankCode || !tx.createdAt) continue;
          const created = new Date(tx.createdAt);
          if (Number.isNaN(created.getTime())) continue;
          // Pin synthetic date to the day of the first real tx so all
          // points share an ISO date and only differ in hour.
          isoDay = created.toISOString().substring(0, 10);
          const hour = created.getHours();
          const amount = parseFloat(tx.amount);
          if (!Number.isFinite(amount)) continue;
          let inner = buckets.get(tx.sourceBankCode);
          if (!inner) {
            inner = new Map();
            buckets.set(tx.sourceBankCode, inner);
          }
          inner.set(hour, (inner.get(hour) ?? 0) + amount);
        }

        // Pre-fill all 24 hours per bank, defaulting to 0 where there's
        // no data, so each bank's curve spans the full 00:00..23:00 axis
        // (zero baseline + spikes at active hours) instead of being a
        // short arc concentrated in the middle of the day.
        const series: HourlyBankSeries[] = Array.from(buckets.entries()).map(
          ([bankCode, hours]) => ({
            bankCode,
            points: Array.from({ length: 24 }, (_, hour) => ({
              // No `Z` — parsed as local time so re-parsing with
              // `getHours()` in the renderer returns the same hour we
              // bucketed by. With Z + non-UTC tz the hour shifts on read.
              date: `${isoDay}T${String(hour).padStart(2, "0")}:00:00`,
              amount: hours.get(hour) ?? 0,
            })),
          }),
        );

        setState({ data: series, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        // eslint-disable-next-line no-console
        console.error("[useTodayHourlyByBank]", err);
        setState({
          data: null,
          loading: false,
          error: err instanceof Error ? err : new Error("Unknown error"),
        });
      });

    return () => ctrl.abort();
  }, [tick]);

  return { ...state, retry };
}

/* ─── Recent transactions (Card 6) ────────────────────────────────────── */

/**
 * Fetches the N most recent platform transactions (sorted by `createdAt`
 * desc, server-side). Used by the "Recent transactions" card.
 */
export function useRecentTransactions(limit: number) {
  const [state, setState] = useState<AsyncState<TransactionListItem[]>>(
    initial(),
  );
  const [tick, setTick] = useState(0);
  const retry = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));

    fetchTransactions({ page: 0, size: limit, signal: ctrl.signal })
      .then((paged) => {
        if (ctrl.signal.aborted) return;
        setState({ data: paged.content, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        // eslint-disable-next-line no-console
        console.error("[useRecentTransactions]", err);
        setState({
          data: null,
          loading: false,
          error: err instanceof Error ? err : new Error("Unknown error"),
        });
      });

    return () => ctrl.abort();
  }, [limit, tick]);

  return { ...state, retry };
}

/* ─── Recent fraud alerts (Card 7) ─────────────────────────────────────── */

interface RecentFraudAlertsResult {
  /** The N latest pending alerts, sorted createdAt desc. */
  recent: FraudAlertItem[];
  /** Total pending count across the platform — drives the "X needing decision" subtitle. */
  totalPending: number;
}

/**
 * Fetches a generous slice of PENDING fraud alerts and returns the most
 * recent N along with the total count. Sorting is done client-side
 * because the backend's `/fraud-alerts` endpoint doesn't currently
 * apply a deterministic order (no Sort on the Pageable).
 */
export function useRecentFraudAlerts(limit: number) {
  const [state, setState] = useState<AsyncState<RecentFraudAlertsResult>>(
    initial(),
  );
  const [tick, setTick] = useState(0);
  const retry = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));

    fetchFraudAlerts({ status: "PENDING", page: 0, size: 100, signal: ctrl.signal })
      .then((paged) => {
        if (ctrl.signal.aborted) return;
        const sorted = [...paged.content].sort(
          (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
        );
        setState({
          data: {
            recent: sorted.slice(0, limit),
            totalPending: paged.totalElements,
          },
          loading: false,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        // eslint-disable-next-line no-console
        console.error("[useRecentFraudAlerts]", err);
        setState({
          data: null,
          loading: false,
          error: err instanceof Error ? err : new Error("Unknown error"),
        });
      });

    return () => ctrl.abort();
  }, [limit, tick]);

  return { ...state, retry };
}

/* ─── ML model info (Card 8) ───────────────────────────────────────────── */

interface MlInfoResult {
  config: MlConfigData;
  metrics: MlMetricsData;
}

/**
 * Fetches the active ML config and the latest performance metrics in
 * parallel. Both endpoints are read-only and live under /analyst.
 */
export function useMlInfo() {
  const [state, setState] = useState<AsyncState<MlInfoResult>>(initial());
  const [tick, setTick] = useState(0);
  const retry = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));

    Promise.all([fetchMlConfig(ctrl.signal), fetchMlMetrics(ctrl.signal)])
      .then(([config, metrics]) => {
        if (ctrl.signal.aborted) return;
        setState({ data: { config, metrics }, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        // eslint-disable-next-line no-console
        console.error("[useMlInfo]", err);
        setState({
          data: null,
          loading: false,
          error: err instanceof Error ? err : new Error("Unknown error"),
        });
      });

    return () => ctrl.abort();
  }, [tick]);

  return { ...state, retry };
}
