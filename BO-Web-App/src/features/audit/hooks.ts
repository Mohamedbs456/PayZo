import { useEffect, useRef, useState } from "react";
import { fetchAuditLog, type AuditLogEntry, type AuditScope } from "./api";

const PAGE_SIZE = 25;

export interface UseAuditLogResult {
  items: AuditLogEntry[];
  totalElements: number;
  loadingInitial: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => void;
}

/**
 * Infinite-scroll hook for the audit log. Backed by whichever scoped
 * endpoint matches the caller's role (Admin → admin history, Analyst →
 * analyst history).
 */
export function useAuditLog(scope: AuditScope): UseAuditLogResult {
  const [items, setItems] = useState<AuditLogEntry[]>([]);
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

    fetchAuditLog({ scope, page: 0, size: PAGE_SIZE, signal: controller.signal })
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
        console.error("[audit] initial load failed", cause);
        setError(cause instanceof Error ? cause.message : "Failed to load");
        setLoadingInitial(false);
      });

    return () => controller.abort();
  }, [scope]);

  const loadMore = () => {
    if (inFlightRef.current || !hasMore || loadingInitial) return;
    inFlightRef.current = true;
    const nextPage = pageRef.current + 1;
    const myEpoch = epochRef.current;
    setLoadingMore(true);

    fetchAuditLog({ scope, page: nextPage, size: PAGE_SIZE })
      .then((response) => {
        if (myEpoch !== epochRef.current) return;
        pageRef.current = nextPage;
        setItems((prev) => {
          const seen = new Set(prev.map((e) => e.id));
          return [...prev, ...response.content.filter((e) => !seen.has(e.id))];
        });
        setTotalElements(response.totalElements);
        setHasMore(response.page + 1 < response.totalPages);
      })
      .catch((cause) => {
        if (myEpoch !== epochRef.current) return;
        console.error("[audit] page load failed", cause);
        setError(cause instanceof Error ? cause.message : "Failed to load more");
      })
      .finally(() => {
        if (myEpoch === epochRef.current) setLoadingMore(false);
        inFlightRef.current = false;
      });
  };

  return { items, totalElements, loadingInitial, loadingMore, hasMore, error, loadMore };
}
