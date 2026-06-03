import { useEffect, useRef, useState } from "react";
import { fetchClientsForAccounts } from "./api";
import type { ClientListItem } from "@/features/clients/api";

const PAGE_SIZE = 10;

interface UseAccountsListArgs {
  bank: string | null;
  q: string;
}

export interface UseAccountsListResult {
  items: ClientListItem[];
  totalElements: number;
  loadingInitial: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => void;
}

/**
 * Infinite-scroll list hook for the Accounts page. Same shape as the Clients
 * page hook (epoch-tracked aborts, debounced filter, dedupe on append) — just
 * pinned to a different fetcher that supports the `bank` filter.
 */
export function useAccountsList({ bank, q }: UseAccountsListArgs): UseAccountsListResult {
  const [items, setItems] = useState<ClientListItem[]>([]);
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

    fetchClientsForAccounts({ bank, q, page: 0, size: PAGE_SIZE, signal: controller.signal })
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
        console.error("[accounts] initial load failed", cause);
        setError(cause instanceof Error ? cause.message : "Failed to load");
        setLoadingInitial(false);
      });

    return () => controller.abort();
  }, [bank, q]);

  const loadMore = () => {
    if (inFlightRef.current || !hasMore || loadingInitial) return;
    inFlightRef.current = true;
    const nextPage = pageRef.current + 1;
    const myEpoch = epochRef.current;
    setLoadingMore(true);

    fetchClientsForAccounts({ bank, q, page: nextPage, size: PAGE_SIZE })
      .then((response) => {
        if (myEpoch !== epochRef.current) return;
        pageRef.current = nextPage;
        setItems((prev) => {
          const seen = new Set(prev.map((c) => c.userId));
          return [...prev, ...response.content.filter((c) => !seen.has(c.userId))];
        });
        setTotalElements(response.totalElements);
        setHasMore(response.page + 1 < response.totalPages);
      })
      .catch((cause) => {
        if (myEpoch !== epochRef.current) return;
        console.error("[accounts] page load failed", cause);
        setError(cause instanceof Error ? cause.message : "Failed to load more");
      })
      .finally(() => {
        if (myEpoch === epochRef.current) setLoadingMore(false);
        inFlightRef.current = false;
      });
  };

  return { items, totalElements, loadingInitial, loadingMore, hasMore, error, loadMore };
}
