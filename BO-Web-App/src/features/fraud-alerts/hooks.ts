import { useEffect, useRef, useState } from "react";
import { fetchFraudAlerts, type AlertStatus, type FraudAlert } from "./api";
import type {
  AmountBand,
  DashboardPeriod,
  RiskLevel,
} from "@/features/transactions/api";

const PAGE_SIZE = 15;

interface UseFraudAlertsListArgs {
  status: AlertStatus | null;
  risk: RiskLevel | null;
  bank: string | null;
  amount: AmountBand | null;
  period: DashboardPeriod | null;
  q: string;
}

export interface UseFraudAlertsListResult {
  items: FraudAlert[];
  totalElements: number;
  loadingInitial: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => void;
  /** Hard reset + reload — used after a decide-action invalidates the list. */
  reload: () => void;
  /** Optimistic local update for one row (e.g. status flip after decide). */
  patchItem: (id: string, patch: Partial<FraudAlert>) => void;
  /** Drop a row locally — e.g. after rejecting it from a "PENDING only" view. */
  removeItem: (id: string) => void;
}

/**
 * Infinite-scroll hook for the fraud-alerts queue. Same epoch-tracked abort
 * + dedupe-on-append shape as Clients/Accounts/Transactions, with two extra
 * helpers (`patchItem` / `removeItem`) so the decision-panel can update the
 * list optimistically without a full reload.
 */
export function useFraudAlertsList(
  args: UseFraudAlertsListArgs,
): UseFraudAlertsListResult {
  const { status, risk, bank, amount, period, q } = args;

  const [items, setItems] = useState<FraudAlert[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const epochRef = useRef(0);
  const pageRef = useRef(0);
  const inFlightRef = useRef(false);
  const reloadTickRef = useRef(0);

  useEffect(() => {
    epochRef.current += 1;
    pageRef.current = 0;
    inFlightRef.current = false;
    setItems([]);
    setTotalElements(0);
    setHasMore(true);
    setError(null);
    setLoadingInitial(true);
    setLoadingMore(false);

    const myEpoch = epochRef.current;
    const controller = new AbortController();

    fetchFraudAlerts({
      status,
      risk,
      bankCode: bank,
      amount,
      period,
      q,
      page: 0,
      size: PAGE_SIZE,
      signal: controller.signal,
    })
      .then((response) => {
        if (myEpoch !== epochRef.current) return;
        setItems(response.content);
        setTotalElements(response.totalElements);
        setHasMore(response.page + 1 < response.totalPages);
        setLoadingInitial(false);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        if (myEpoch !== epochRef.current) return;
        console.error("[fraud-alerts] initial load failed", cause);
        setError(cause instanceof Error ? cause.message : "Failed to load");
        setLoadingInitial(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, risk, bank, amount, period, q, reloadTickRef.current]);

  const loadMore = () => {
    if (inFlightRef.current || !hasMore || loadingInitial) return;
    inFlightRef.current = true;
    const nextPage = pageRef.current + 1;
    const myEpoch = epochRef.current;
    setLoadingMore(true);

    fetchFraudAlerts({
      status,
      risk,
      bankCode: bank,
      amount,
      period,
      q,
      page: nextPage,
      size: PAGE_SIZE,
    })
      .then((response) => {
        if (myEpoch !== epochRef.current) return;
        pageRef.current = nextPage;
        setItems((prev) => {
          const seen = new Set(prev.map((a) => a.id));
          return [...prev, ...response.content.filter((a) => !seen.has(a.id))];
        });
        setTotalElements(response.totalElements);
        setHasMore(response.page + 1 < response.totalPages);
      })
      .catch((cause) => {
        if (myEpoch !== epochRef.current) return;
        console.error("[fraud-alerts] page load failed", cause);
        setError(cause instanceof Error ? cause.message : "Failed to load more");
      })
      .finally(() => {
        if (myEpoch === epochRef.current) setLoadingMore(false);
        inFlightRef.current = false;
      });
  };

  const reload = () => {
    reloadTickRef.current += 1;
    // Force the effect to refire by toggling state — we read reloadTickRef.current
    // in deps so a no-op state change isn't enough on its own. The simplest
    // way to retrigger is to reset the epoch + flip a sentinel state.
    setLoadingInitial(true);
    setItems([]);
    epochRef.current += 1; // invalidate any in-flight responses
    pageRef.current = 0;
    inFlightRef.current = false;
    const myEpoch = epochRef.current;
    fetchFraudAlerts({
      status,
      risk,
      bankCode: bank,
      amount,
      period,
      q,
      page: 0,
      size: PAGE_SIZE,
    })
      .then((response) => {
        if (myEpoch !== epochRef.current) return;
        setItems(response.content);
        setTotalElements(response.totalElements);
        setHasMore(response.page + 1 < response.totalPages);
        setLoadingInitial(false);
      })
      .catch((cause) => {
        if (myEpoch !== epochRef.current) return;
        console.error("[fraud-alerts] reload failed", cause);
        setError(cause instanceof Error ? cause.message : "Failed to reload");
        setLoadingInitial(false);
      });
  };

  const patchItem = (id: string, patch: Partial<FraudAlert>) => {
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((a) => a.id !== id));
    setTotalElements((n) => Math.max(0, n - 1));
  };

  return {
    items,
    totalElements,
    loadingInitial,
    loadingMore,
    hasMore,
    error,
    loadMore,
    reload,
    patchItem,
    removeItem,
  };
}
