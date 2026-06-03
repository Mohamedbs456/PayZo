import { useEffect, useRef, useState } from "react";
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
  type NotificationItem,
} from "./api";

const PAGE_SIZE = 20;
const POLL_INTERVAL_MS = 30_000;

/* ─── Unread count (always-on poll) ───────────────────────────────────── */

/**
 * Polls /notifications/unread-count every 30s while mounted. Drives the bell
 * red dot regardless of whether the dropdown is open. Increments / decrements
 * are exposed so the dropdown can keep the count in sync after a row is
 * marked read without waiting for the next poll tick.
 */
export interface UseUnreadCountResult {
  count: number;
  /** Local optimistic delta (e.g. -1 after marking one row read). */
  adjust: (delta: number) => void;
  /** Force an immediate refetch — useful after mark-all-read. */
  refresh: () => void;
}

export function useUnreadCount(): UseUnreadCountResult {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let controller = new AbortController();

    const tick = async () => {
      controller.abort();
      controller = new AbortController();
      try {
        const fresh = await fetchUnreadCount(controller.signal);
        if (!cancelled) setCount(fresh);
      } catch (cause) {
        if (controller.signal.aborted) return;
        console.warn("[notifications] unread-count fetch failed", cause);
      }
    };

    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(id);
    };
  }, []);

  const adjust = (delta: number) => setCount((c) => Math.max(0, c + delta));
  const refresh = () => fetchUnreadCount().then(setCount).catch(() => {});

  return { count, adjust, refresh };
}

/* ─── List feed (cursor-paginated, lazy on dropdown open) ─────────────── */

export interface UseNotificationsResult {
  items: NotificationItem[];
  loadingInitial: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => void;
  /** Optimistic local update — flips a row's `read` flag. */
  setRowRead: (id: string) => void;
}

interface UseNotificationsArgs {
  /** Only fetches when active is true (i.e. dropdown is open). */
  active: boolean;
}

/**
 * Cursor-paginated bell feed. The first page lands when `active` flips from
 * false → true (dropdown open). `loadMore` advances; the IntersectionObserver
 * sentinel in the dropdown calls it when scrolled into view.
 *
 * State resets every time the dropdown closes so the next open shows fresh
 * server-side state (avoids stale "marked read" flags after another tab
 * also acted on the same notification).
 */
export function useNotifications({ active }: UseNotificationsArgs): UseNotificationsResult {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cursorRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const epochRef = useRef(0);

  // Reset + first-page load when dropdown opens. Cleanup on close aborts
  // any in-flight call so a slow first-page response doesn't land in a
  // closed-then-reopened dropdown.
  useEffect(() => {
    if (!active) {
      setItems([]);
      setLoadingInitial(false);
      setLoadingMore(false);
      setHasMore(true);
      setError(null);
      cursorRef.current = null;
      inFlightRef.current = false;
      return;
    }

    epochRef.current += 1;
    const myEpoch = epochRef.current;
    const controller = new AbortController();

    setLoadingInitial(true);
    setError(null);

    fetchNotifications({ limit: PAGE_SIZE, signal: controller.signal })
      .then((page) => {
        if (myEpoch !== epochRef.current) return;
        setItems(page.items);
        cursorRef.current = page.nextCursor;
        setHasMore(page.hasMore);
        setLoadingInitial(false);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        if (myEpoch !== epochRef.current) return;
        console.error("[notifications] initial load failed", cause);
        setError(cause instanceof Error ? cause.message : "Failed to load");
        setLoadingInitial(false);
      });

    return () => controller.abort();
  }, [active]);

  const loadMore = () => {
    if (!active) return;
    if (inFlightRef.current) return;
    if (!hasMore) return;
    if (loadingInitial) return;

    inFlightRef.current = true;
    setLoadingMore(true);
    const myEpoch = epochRef.current;

    fetchNotifications({ cursor: cursorRef.current, limit: PAGE_SIZE })
      .then((page) => {
        if (myEpoch !== epochRef.current) return;
        // Dedupe by id — double-fire from observer + StrictMode re-mount
        // could otherwise duplicate the boundary row.
        setItems((prev) => {
          const seen = new Set(prev.map((i) => i.id));
          const fresh = page.items.filter((i) => !seen.has(i.id));
          return [...prev, ...fresh];
        });
        cursorRef.current = page.nextCursor;
        setHasMore(page.hasMore);
      })
      .catch((cause) => {
        if (myEpoch !== epochRef.current) return;
        console.error("[notifications] page load failed", cause);
        setError(cause instanceof Error ? cause.message : "Failed to load more");
      })
      .finally(() => {
        if (myEpoch === epochRef.current) setLoadingMore(false);
        inFlightRef.current = false;
      });
  };

  const setRowRead = (id: string) => {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
    );
  };

  return {
    items,
    loadingInitial,
    loadingMore,
    hasMore,
    error,
    loadMore,
    setRowRead,
  };
}

/* ─── Mark-read (fire-and-forget with optimistic local update) ────────── */

/**
 * Marks a notification read on the server while the local UI was already
 * updated optimistically. Returns a Promise that callers can chain off if
 * they want to react to errors; we swallow + log here so the bell flow
 * stays cheap.
 */
export function markRead(id: string): Promise<void> {
  return markNotificationRead(id).catch((cause) => {
    console.warn("[notifications] mark-read failed", cause);
  });
}
