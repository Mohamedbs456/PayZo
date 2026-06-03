import { useEffect, useRef, useState } from "react";
import {
  fetchAdmins,
  fetchAnalysts,
  fetchBanksList,
  type BankRow,
  type StaffMember,
} from "./api";

const PAGE_SIZE = 10;

export type StaffTab = "ADMINS" | "ANALYSTS" | "BANKS";

/* ─── Generic infinite-scroll hook (admins / analysts) ────────────────── */

interface UseStaffMembersArgs {
  tab: "ADMINS" | "ANALYSTS";
  q: string;
}

export interface UseStaffMembersResult {
  items: StaffMember[];
  totalElements: number;
  loadingInitial: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => void;
  removeItem: (userId: string) => void;
  updateItem: (member: StaffMember) => void;
  reload: () => void;
}

/**
 * Same epoch-tracked / dedupe / abort-on-tab-flip pattern as useInfiniteClients.
 * Branches between fetchAdmins / fetchAnalysts based on the active tab.
 */
export function useStaffMembers({ tab, q }: UseStaffMembersArgs): UseStaffMembersResult {
  const [items, setItems] = useState<StaffMember[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const epochRef = useRef(0);
  const pageRef = useRef(0);
  const inFlightRef = useRef(false);
  const reloadTickRef = useRef(0);
  const [resetTick, setResetTick] = useState(0);

  const fetcher = tab === "ADMINS" ? fetchAdmins : fetchAnalysts;

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
    fetcher({ q, page: 0, size: PAGE_SIZE, signal: controller.signal })
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
        console.error("[staff] initial load failed", cause);
        setError(cause instanceof Error ? cause.message : "Failed to load");
        setLoadingInitial(false);
      });
    return () => controller.abort();
    // fetcher derives from tab, no need to list it separately
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, q, resetTick]);

  const loadMore = () => {
    if (inFlightRef.current || !hasMore || loadingInitial) return;
    inFlightRef.current = true;
    const nextPage = pageRef.current + 1;
    const myEpoch = epochRef.current;
    setLoadingMore(true);

    fetcher({ q, page: nextPage, size: PAGE_SIZE })
      .then((response) => {
        if (myEpoch !== epochRef.current) return;
        pageRef.current = nextPage;
        setItems((prev) => {
          const seen = new Set(prev.map((c) => c.id));
          return [...prev, ...response.content.filter((c) => !seen.has(c.id))];
        });
        setTotalElements(response.totalElements);
        setHasMore(response.page + 1 < response.totalPages);
      })
      .catch((cause) => {
        if (myEpoch !== epochRef.current) return;
        console.error("[staff] page load failed", cause);
        setError(cause instanceof Error ? cause.message : "Failed to load more");
      })
      .finally(() => {
        if (myEpoch === epochRef.current) setLoadingMore(false);
        inFlightRef.current = false;
      });
  };

  const removeItem = (userId: string) =>
    setItems((prev) => {
      const next = prev.filter((m) => m.id !== userId);
      if (next.length !== prev.length) setTotalElements((t) => Math.max(0, t - 1));
      return next;
    });

  const updateItem = (m: StaffMember) =>
    setItems((prev) => prev.map((x) => (x.id === m.id ? m : x)));

  const reload = () => {
    reloadTickRef.current += 1;
    setResetTick(reloadTickRef.current);
  };

  return {
    items,
    totalElements,
    loadingInitial,
    loadingMore,
    hasMore,
    error,
    loadMore,
    removeItem,
    updateItem,
    reload,
  };
}

/* ─── Banks list hook (offset-paged, simpler — banks rarely need infinite) ─ */

interface UseBanksListArgs {
  q: string;
}

export interface UseBanksListResult {
  items: BankRow[];
  totalElements: number;
  loadingInitial: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => void;
  removeItem: (id: string) => void;
  updateItem: (bank: BankRow) => void;
  reload: () => void;
}

const BANK_PAGE_SIZE = 20;

export function useBanksList({ q }: UseBanksListArgs): UseBanksListResult {
  const [items, setItems] = useState<BankRow[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const epochRef = useRef(0);
  const pageRef = useRef(0);
  const inFlightRef = useRef(false);
  const reloadTickRef = useRef(0);
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
    fetchBanksList({ q, page: 0, size: BANK_PAGE_SIZE, signal: controller.signal })
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
        console.error("[staff] banks load failed", cause);
        setError(cause instanceof Error ? cause.message : "Failed to load");
        setLoadingInitial(false);
      });
    return () => controller.abort();
  }, [q, resetTick]);

  const loadMore = () => {
    if (inFlightRef.current || !hasMore || loadingInitial) return;
    inFlightRef.current = true;
    const nextPage = pageRef.current + 1;
    const myEpoch = epochRef.current;
    setLoadingMore(true);

    fetchBanksList({ q, page: nextPage, size: BANK_PAGE_SIZE })
      .then((response) => {
        if (myEpoch !== epochRef.current) return;
        pageRef.current = nextPage;
        setItems((prev) => {
          const seen = new Set(prev.map((b) => b.id));
          return [...prev, ...response.content.filter((b) => !seen.has(b.id))];
        });
        setTotalElements(response.totalElements);
        setHasMore(response.page + 1 < response.totalPages);
      })
      .catch((cause) => {
        if (myEpoch !== epochRef.current) return;
        console.error("[staff] banks page failed", cause);
        setError(cause instanceof Error ? cause.message : "Failed to load more");
      })
      .finally(() => {
        if (myEpoch === epochRef.current) setLoadingMore(false);
        inFlightRef.current = false;
      });
  };

  const removeItem = (id: string) =>
    setItems((prev) => {
      const next = prev.filter((b) => b.id !== id);
      if (next.length !== prev.length) setTotalElements((t) => Math.max(0, t - 1));
      return next;
    });

  const updateItem = (b: BankRow) =>
    setItems((prev) => prev.map((x) => (x.id === b.id ? b : x)));

  const reload = () => {
    reloadTickRef.current += 1;
    setResetTick(reloadTickRef.current);
  };

  return {
    items,
    totalElements,
    loadingInitial,
    loadingMore,
    hasMore,
    error,
    loadMore,
    removeItem,
    updateItem,
    reload,
  };
}
