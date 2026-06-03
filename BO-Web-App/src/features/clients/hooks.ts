import { useEffect, useRef, useState } from "react";
import {
  fetchClients,
  type ClientListItem,
  type ClientStatusFilter,
} from "./api";

const PAGE_SIZE = 10;

interface UseInfiniteClientsArgs {
  status: ClientStatusFilter;
  q: string;
}

export interface UseInfiniteClientsResult {
  items: ClientListItem[];
  /** total rows the server reports for the current filter (used for "X total clients"). */
  totalElements: number;
  /** True only on the first page of the current filter combo. */
  loadingInitial: boolean;
  /** True while a non-first page is being appended. */
  loadingMore: boolean;
  /** False once the last page has been loaded for the current filter combo. */
  hasMore: boolean;
  error: string | null;
  /** Imperatively load the next page (called by the IntersectionObserver). */
  loadMore: () => void;
  /** Hard reset + reload — used after a row mutation invalidates the list. */
  reload: () => void;
  /** Optimistically drop a row from the list (e.g. after a successful delete). */
  removeItem: (userId: string) => void;
  /** Replace a row in place after a refetch (e.g. after approve/block/unblock). */
  updateItem: (client: ClientListItem) => void;
}

/**
 * Infinite-scroll list hook for /admin/clients.
 *
 * Behavior:
 *   - Whenever `status` or `q` changes, we reset to page 0, abort any in-flight
 *     request, and load the first page.
 *   - `loadMore` advances to the next page if there is one. The page index is
 *     tracked in a ref so the IntersectionObserver-fired callback always sees
 *     the latest value (state setters in observer callbacks lag by a tick).
 *   - We dedupe by `userId` when appending, since rapid filter flips can race.
 *   - StrictMode double-mount safe: the AbortController in cleanup tears down
 *     the request that the unmounted effect started.
 */
export function useInfiniteClients({
  status,
  q,
}: UseInfiniteClientsArgs): UseInfiniteClientsResult {
  const [items, setItems] = useState<ClientListItem[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // Latest filter "epoch" — bumped on every status/q change so older in-flight
  // appends from a stale filter don't pollute the new list.
  const epochRef = useRef(0);
  const pageRef = useRef(0);
  const inFlightRef = useRef(false);
  const reloadTickRef = useRef(0);

  // Bump on every reset trigger (filter change OR explicit reload).
  const [resetTick, setResetTick] = useState(0);

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

    fetchClients({ status, q, page: 0, size: PAGE_SIZE, signal: controller.signal })
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
        console.error("[clients] initial load failed", cause);
        setError(cause instanceof Error ? cause.message : "Failed to load clients");
        setLoadingInitial(false);
      });

    return () => controller.abort();
  }, [status, q, resetTick]);

  const loadMore = () => {
    if (inFlightRef.current) return;
    if (!hasMore) return;
    if (loadingInitial) return;

    inFlightRef.current = true;
    const nextPage = pageRef.current + 1;
    const myEpoch = epochRef.current;
    setLoadingMore(true);

    fetchClients({ status, q, page: nextPage, size: PAGE_SIZE })
      .then((response) => {
        if (myEpoch !== epochRef.current) return;
        pageRef.current = nextPage;
        setItems((prev) => {
          const seen = new Set(prev.map((c) => c.userId));
          const fresh = response.content.filter((c) => !seen.has(c.userId));
          return [...prev, ...fresh];
        });
        setTotalElements(response.totalElements);
        setHasMore(response.page + 1 < response.totalPages);
      })
      .catch((cause) => {
        if (myEpoch !== epochRef.current) return;
        console.error("[clients] page load failed", cause);
        setError(cause instanceof Error ? cause.message : "Failed to load more");
      })
      .finally(() => {
        if (myEpoch === epochRef.current) {
          setLoadingMore(false);
        }
        inFlightRef.current = false;
      });
  };

  const reload = () => {
    reloadTickRef.current += 1;
    setResetTick(reloadTickRef.current);
  };

  const removeItem = (userId: string) => {
    setItems((prev) => {
      const next = prev.filter((c) => c.userId !== userId);
      // Only decrement the total when a row was actually present in our local
      // window — guards against double-fire from React strict mode.
      if (next.length !== prev.length) {
        setTotalElements((t) => Math.max(0, t - 1));
      }
      return next;
    });
  };

  const updateItem = (client: ClientListItem) => {
    setItems((prev) =>
      prev.map((c) => (c.userId === client.userId ? client : c)),
    );
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
    removeItem,
    updateItem,
  };
}

/**
 * Debounces a string value. Used for the search input so we don't issue an
 * /admin/clients call on every keystroke.
 */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
