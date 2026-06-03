import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { TopBar } from "@/components/layout/TopBar";
import { ProfilePanel } from "@/components/layout/ProfilePanel";
import { useMe, deriveInitials } from "@/features/me/MeProvider";
import { isDemoMode } from "@/lib/demoMode";
import { ApiError } from "@/lib/api";
import {
  type ClientAccount,
  type ClientTransaction,
  getAccounts,
} from "@/features/dashboard/api";
import { listTransactions } from "@/features/transactions/api";
import { DEMO_ACCOUNTS } from "@/features/dashboard/mockData";
import { DEMO_TRANSACTIONS } from "@/features/transactions/mockData";
import { useEnterSearch } from "@/lib/hooks/useEnterSearch";
import {
  type OriginFilter,
  type PeriodFilter,
  type StatusFilter,
  type TypeSegment,
  FilterBar,
} from "@/features/transactions/components/FilterBar";
import { TransactionRow } from "@/features/transactions/components/TransactionRow";

/**
 * Transactions page (Figma 207:2).
 *
 * Top-bar + filter bar + a date-grouped list. The filter bar drives
 * client-side filtering on whatever the BE returned for now; once the
 * `/client/transactions` aggregate endpoint with server-side filters
 * lands (B4), the same filter state can be forwarded as query params.
 *
 * Deep-link support:
 *   - `?account=NNNN…NNNN` — pre-filter by source account (entered from
 *     the Accounts page's "View transactions →" link).
 *   - `?ref=TX-2026-…`     — auto-expands the matching transaction (used
 *     by the Alerts page's "View transaction" link, Phase 7).
 */
export function TransactionsPage() {
  const { me } = useMe();
  const demo = isDemoMode();
  const [params] = useSearchParams();
  const accountParam = params.get("account");
  const refParam = params.get("ref");

  const [profilePanelOpen, setProfilePanelOpen] = useState(false);
  const [accounts, setAccounts] = useState<ClientAccount[] | null>(null);
  const [transactions, setTransactions] = useState<ClientTransaction[] | null>(
    null,
  );

  // Filter state. Defaults match the Figma frame.
  // Search uses the Enter-to-commit pattern (same hook as the BO) so the
  // user typing doesn't fire 10 BE calls per word. `search.draft` drives
  // the input value; `search.committed` is what we ship to the data
  // hook + the client-side filter.
  const search = useEnterSearch();
  const q = search.committed;
  const [type, setType] = useState<TypeSegment>("ALL");
  const [bank, setBank] = useState<string>("ALL");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [origin, setOrigin] = useState<OriginFilter>("ALL");
  const [period, setPeriod] = useState<PeriodFilter>("all");

  // Auto-expand the row matching `?ref=`. Defers to user's manual toggles
  // afterwards.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement | null>());

  // Pagination — drives the "load more on scroll" behavior. In demo mode
  // we ship one page (the full demo set) and immediately set hasMore=false.
  // For real BE we keep fetching pages of 20 across all accounts merged.
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingNext, setLoadingNext] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  /* ─── Account list (drives the bank dropdown) ──────────────────────── */

  useEffect(() => {
    if (demo) {
      setAccounts(DEMO_ACCOUNTS);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const accs = await getAccounts();
        if (!cancelled) setAccounts(accs);
      } catch (err) {
        if (cancelled) return;
        if (!(err instanceof ApiError)) throw err;
        setAccounts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [demo]);

  /* ─── Refetch list whenever filter state changes ────────────────────
   * The aggregate `/client/transactions` endpoint applies all filters
   * server-side. Each filter change resets to page=0 + refetches; old
   * results are cleared so the list shows a fresh skeleton.
   */
  useEffect(() => {
    if (demo) {
      // Demo mode has no BE — apply the same filter contract client-side
      // so the search bar + every dropdown actually does something. Same
      // semantics as the BE's listMergedTransactions.
      setTransactions(applyDemoFilters(DEMO_TRANSACTIONS, {
        q: q.trim(),
        type,
        status,
        bank,
        period,
        origin,
        account: accountParam ?? undefined,
      }));
      setHasMore(false);
      return;
    }
    let cancelled = false;
    setTransactions(null);
    setPage(0);
    setHasMore(true);
    void (async () => {
      try {
        const result = await listTransactions({
          page: 0,
          size: PAGE_SIZE,
          q: q.trim() || undefined,
          type,
          status,
          bank,
          period,
          origin,
          account: accountParam ?? undefined,
        });
        if (cancelled) return;
        setTransactions(result.content);
        setHasMore(result.content.length >= PAGE_SIZE);
      } catch (err) {
        if (cancelled) return;
        if (!(err instanceof ApiError)) throw err;
        setTransactions([]);
        setHasMore(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, q, type, status, bank, period, origin, accountParam]);

  /* ─── Load more on scroll-to-bottom ──────────────────────────────────
   * IntersectionObserver watches a sentinel div placed below the list;
   * when it scrolls into view we fetch the next page with the same
   * filter set and append. Demo mode skips this entirely.
   */
  useEffect(() => {
    if (demo || !hasMore || loadingNext) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        void loadNextPage();
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, hasMore, loadingNext, page, q, type, status, bank, period, origin]);

  async function loadNextPage() {
    if (loadingNext || !hasMore) return;
    const nextPage = page + 1;
    setLoadingNext(true);
    try {
      const result = await listTransactions({
        page: nextPage,
        size: PAGE_SIZE,
        q: q.trim() || undefined,
        type,
        status,
        bank,
        period,
        origin,
        account: accountParam ?? undefined,
      });
      if (result.content.length === 0) {
        setHasMore(false);
      } else {
        setTransactions((prev) => [...(prev ?? []), ...result.content]);
        setPage(nextPage);
        setHasMore(result.content.length >= PAGE_SIZE);
      }
    } catch {
      // Stop trying on any error — user can still scroll back to what loaded.
      setHasMore(false);
    } finally {
      setLoadingNext(false);
    }
  }

  /* ─── Auto-expand + scroll-into-view from `?ref=` deep-link ─────────
   * When the alerts page links here with `?ref=…`, we expand the
   * matching row AND scroll it into view so the user lands on the
   * detail they came for instead of having to hunt through the list.
   */
  useEffect(() => {
    if (!refParam || !transactions) return;
    const match = transactions.find((t) => t.reference === refParam);
    if (!match) return;
    setExpandedId(match.id);
    // Defer the scroll until after the row mounts in expanded form so
    // the layout pass uses the final height.
    const handle = window.setTimeout(() => {
      const node = rowRefs.current.get(match.id);
      node?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    return () => window.clearTimeout(handle);
  }, [refParam, transactions]);

  /* ─── Bank options for the dropdown ───────────────────────────────── */

  const bankOptions = useMemo(() => {
    const set = new Set<string>();
    (accounts ?? []).forEach((a) => set.add(a.bankCode));
    (transactions ?? []).forEach((t) => {
      if (t.sourceBankCode) set.add(t.sourceBankCode);
      if (t.destBankCode) set.add(t.destBankCode);
    });
    return Array.from(set).sort();
  }, [accounts, transactions]);

  /* ─── Apply filters client-side ───────────────────────────────────── */

  const filtered = useMemo(() => {
    if (!transactions) return [] as ClientTransaction[];
    const periodCutoff = computePeriodCutoff(period);
    const qLower = q.trim().toLowerCase();

    return transactions.filter((t) => {
      // Account deep-link narrows to a single source/dest account.
      if (accountParam) {
        if (
          t.counterpartAccount !== accountParam &&
          t.sourceMaskedAccount?.endsWith(accountParam.slice(-4)) !== true &&
          t.destMaskedAccount?.endsWith(accountParam.slice(-4)) !== true
        ) {
          return false;
        }
      }

      // Period
      if (periodCutoff) {
        const ts = new Date(t.timestamp).getTime();
        if (ts < periodCutoff) return false;
      }

      // Type segment
      const category = t.internal
        ? "INTERNAL"
        : t.type === "DEBIT"
          ? "SENT"
          : "RECEIVED";
      if (type !== "ALL" && category !== type) return false;

      // Status filter — collapses our 6 BE values into 4 user buckets.
      if (status !== "ALL") {
        const bucket = collapseStatus(t.status);
        if (bucket !== status) return false;
      }

      // Bank filter
      if (bank !== "ALL") {
        if (t.sourceBankCode !== bank && t.destBankCode !== bank) return false;
      }

      // Origin filter — PayZo-originated vs external bank rows.
      if (origin !== "ALL") {
        // Treat unknown origin (legacy demo rows without `origin`) as PAYZO.
        const txOrigin = t.origin ?? "PAYZO";
        if (txOrigin !== origin) return false;
      }

      // Search query — name, account, masked account, amount, ref
      if (qLower) {
        const haystack = [
          t.counterpartName,
          t.counterpartUsername,
          t.counterpartAccount,
          t.sourceMaskedAccount,
          t.destMaskedAccount,
          t.reference,
          String(t.amount),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(qLower)) return false;
      }

      return true;
    });
  }, [transactions, accountParam, period, type, status, bank, q, origin]);

  /* ─── Group by date ───────────────────────────────────────────────── */

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  const initials = deriveInitials(me);

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-surface-soft">
      <TopBar
        variant="light"
        pageName="Transactions"
        me={me ? { initials, trustScore: me.trustScore, profilePictureUrl: me.profilePictureUrl } : null}
        onAvatarClick={() => setProfilePanelOpen(true)}
      />

      <ProfilePanel
        open={profilePanelOpen}
        onClose={() => setProfilePanelOpen(false)}
        me={me}
      />

      <main className="flex flex-1 flex-col overflow-y-auto px-4 pb-12 pt-6 sm:px-8">
        <div className="mx-auto flex w-full max-w-[1376px] flex-col gap-5">
          <FilterBar
            qDraft={search.draft}
            onQDraftChange={search.setDraft}
            onQCommit={search.commit}
            onQClear={search.clear}
            type={type}
            onTypeChange={setType}
            bank={bank}
            bankOptions={bankOptions}
            onBankChange={setBank}
            status={status}
            onStatusChange={setStatus}
            origin={origin}
            onOriginChange={setOrigin}
            period={period}
            onPeriodChange={setPeriod}
          />

          {/* Section head */}
          <div className="flex items-center gap-3 pt-1">
            <h1 className="font-sans text-[18px] font-bold text-text-primary">
              Recently
            </h1>
            <span className="inline-flex h-[22px] items-center rounded-full bg-surface-raised px-2 font-sans text-[11px] font-semibold text-text-secondary">
              {filtered.length} {filtered.length === 1 ? "transaction" : "transactions"}
            </span>
          </div>

          {/* List */}
          <div className="overflow-hidden rounded-[14px] border border-border-soft bg-surface-card">
            {transactions === null && <ListSkeleton />}
            {transactions !== null && filtered.length === 0 && <EmptyState />}
            {grouped.map((group) => (
              <div key={group.label} className="flex flex-col">
                <div className="flex h-10 items-center justify-between bg-surface-raised px-6">
                  <p
                    className="font-sans text-[11px] font-bold uppercase tracking-[0.08em] text-text-secondary"
                    style={{ fontVariationSettings: "'wdth' 100" }}
                  >
                    {group.label}
                  </p>
                </div>
                {group.items.map((tx, i) => (
                  <div
                    key={tx.id}
                    ref={(node) => {
                      if (node) rowRefs.current.set(tx.id, node);
                      else rowRefs.current.delete(tx.id);
                    }}
                    className="flex flex-col"
                  >
                    <TransactionRow
                      tx={tx}
                      expanded={expandedId === tx.id}
                      onToggle={() =>
                        setExpandedId((cur) => (cur === tx.id ? null : tx.id))
                      }
                    />
                    {i < group.items.length - 1 && (
                      <div
                        aria-hidden
                        className="h-px w-full bg-border-soft"
                      />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Load-more sentinel + footer status */}
          {transactions !== null && filtered.length > 0 && (
            <div ref={sentinelRef} className="flex justify-center py-4">
              {loadingNext ? (
                <p className="font-sans text-[12px] text-text-secondary">
                  Loading more transactions…
                </p>
              ) : hasMore ? (
                <p className="font-sans text-[12px] text-text-muted">
                  Scroll for more
                </p>
              ) : (
                <p className="font-sans text-[12px] text-text-muted">
                  You've reached the end of your transactions.
                </p>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────────────── */

/**
 * Mirror of the BE's `listMergedTransactions` filter contract — applied
 * over the demo data set so the search bar and every dropdown actually
 * narrow the visible rows under `?demo`. Without this the demo page
 * dumps the full mock list regardless of input, which made the search
 * bar appear broken.
 */
function applyDemoFilters(
  rows: ClientTransaction[],
  filters: {
    q: string;
    type: TypeSegment;
    status: StatusFilter;
    bank: string;
    period: PeriodFilter;
    origin: OriginFilter;
    account?: string;
  },
): ClientTransaction[] {
  const periodCutoff = computePeriodCutoff(filters.period);
  const qLower = filters.q.toLowerCase();

  return rows.filter((t) => {
    if (filters.account) {
      const tail = filters.account.slice(-4);
      const hitsAccount =
        t.counterpartAccount === filters.account ||
        t.sourceMaskedAccount?.endsWith(tail) === true ||
        t.destMaskedAccount?.endsWith(tail) === true;
      if (!hitsAccount) return false;
    }

    if (periodCutoff !== null) {
      if (new Date(t.timestamp).getTime() < periodCutoff) return false;
    }

    const category = t.internal
      ? "INTERNAL"
      : t.type === "DEBIT"
        ? "SENT"
        : "RECEIVED";
    if (filters.type !== "ALL" && category !== filters.type) return false;

    if (filters.status !== "ALL") {
      if (collapseStatus(t.status) !== filters.status) return false;
    }

    if (filters.bank !== "ALL") {
      if (t.sourceBankCode !== filters.bank && t.destBankCode !== filters.bank)
        return false;
    }

    // Origin: demo rows mark internal/transfer PayZo-originated implicitly
    // via `mlScore` or `finalStatusLabel`; pure CBS rows have no PayZo
    // signature. Approximate the BE rule with: "any row that has a
    // counterpartUsername or mlScore is PAYZO; everything else is EXTERNAL."
    if (filters.origin !== "ALL") {
      const isPayZo =
        !!t.counterpartUsername || typeof t.mlScore === "number" || t.internal;
      if (filters.origin === "PAYZO" && !isPayZo) return false;
      if (filters.origin === "EXTERNAL" && isPayZo) return false;
    }

    if (qLower) {
      const haystack = [
        t.reference,
        t.counterpartName,
        t.counterpartUsername,
        t.counterpartAccount,
        t.sourceMaskedAccount,
        t.destMaskedAccount,
        String(t.amount),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(qLower)) return false;
    }

    return true;
  });
}

function collapseStatus(
  s: ClientTransaction["status"],
): "APPROVED" | "PENDING" | "REJECTED" | "CANCELLED" {
  switch (s) {
    case "APPROVED":
      return "APPROVED";
    case "PENDING_OTP":
    case "PENDING_SCORING":
    case "SUSPENDED_PENDING_ANALYST":
      return "PENDING";
    case "REJECTED":
      return "REJECTED";
    case "CANCELLED":
      return "CANCELLED";
    default:
      return "APPROVED";
  }
}

function computePeriodCutoff(period: PeriodFilter): number | null {
  if (period === "all") return null;
  const now = new Date();
  if (period === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);
  return cutoff.getTime();
}

interface DateGroup {
  /** Display label for the date strip. */
  label: string;
  /** Sort key — calendar day timestamp at midnight. */
  key: number;
  items: ClientTransaction[];
}

function groupByDate(transactions: ClientTransaction[]): DateGroup[] {
  const map = new Map<number, DateGroup>();
  for (const tx of transactions) {
    const d = new Date(tx.timestamp);
    d.setHours(0, 0, 0, 0);
    const key = d.getTime();
    if (!map.has(key)) {
      map.set(key, { key, label: dateGroupLabel(d), items: [] });
    }
    map.get(key)!.items.push(tx);
  }
  // Newest day first; rows already arrive newest-first because the
  // initial fetch sorted them that way.
  return Array.from(map.values()).sort((a, b) => b.key - a.key);
}

function dateGroupLabel(d: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const formatted = d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  if (d.getTime() === today.getTime()) return `TODAY · ${formatted}`;
  if (d.getTime() === yesterday.getTime()) return `YESTERDAY · ${formatted}`;
  return formatted.toUpperCase();
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-px bg-border-soft">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="h-[72px] animate-pulse bg-surface-card"
          aria-hidden
        />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
      <p className="font-sans text-[15px] font-semibold text-text-primary">
        No transactions match these filters.
      </p>
      <p className="font-sans text-[13px] text-text-secondary">
        Try widening the period or clearing the search box.
      </p>
    </div>
  );
}
