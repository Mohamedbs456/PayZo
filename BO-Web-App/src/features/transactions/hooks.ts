import { useEffect, useRef, useState } from "react";
import {
  fetchTransactions,
  type AmountBand,
  type DashboardPeriod,
  type RiskLevel,
  type TransactionListItem,
  type TransactionStatus,
} from "./api";

const PAGE_SIZE = 15;

interface UseTransactionsListArgs {
  status: TransactionStatus | null;
  risk: RiskLevel | null;
  bank: string | null;
  amount: AmountBand | null;
  period: DashboardPeriod | null;
  q: string;
}

export interface UseTransactionsListResult {
  items: TransactionListItem[];
  totalElements: number;
  loadingInitial: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => void;
}

/**
 * Infinite-scroll list hook for the Transactions page. Same epoch-tracked
 * abort + dedupe-on-append pattern as the Clients/Accounts hooks — the only
 * thing that changes per filter is the fetcher's `query` payload.
 */
export function useTransactionsList(
  args: UseTransactionsListArgs,
): UseTransactionsListResult {
  const { status, risk, bank, amount, period, q } = args;

  const [items, setItems] = useState<TransactionListItem[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const epochRef = useRef(0);
  const pageRef = useRef(0);
  const inFlightRef = useRef(false);

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

    fetchTransactions({
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
        console.error("[transactions] initial load failed", cause);
        setError(cause instanceof Error ? cause.message : "Failed to load");
        setLoadingInitial(false);
      });

    return () => controller.abort();
  }, [status, risk, bank, amount, period, q]);

  const loadMore = () => {
    if (inFlightRef.current || !hasMore || loadingInitial) return;
    inFlightRef.current = true;
    const nextPage = pageRef.current + 1;
    const myEpoch = epochRef.current;
    setLoadingMore(true);

    fetchTransactions({
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
          const seen = new Set(prev.map((t) => t.id));
          return [...prev, ...response.content.filter((t) => !seen.has(t.id))];
        });
        setTotalElements(response.totalElements);
        setHasMore(response.page + 1 < response.totalPages);
      })
      .catch((cause) => {
        if (myEpoch !== epochRef.current) return;
        console.error("[transactions] page load failed", cause);
        setError(cause instanceof Error ? cause.message : "Failed to load more");
      })
      .finally(() => {
        if (myEpoch === epochRef.current) setLoadingMore(false);
        inFlightRef.current = false;
      });
  };

  return { items, totalElements, loadingInitial, loadingMore, hasMore, error, loadMore };
}
