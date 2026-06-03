import { useEffect, useMemo, useRef, useState } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { ProfilePanel } from "@/components/layout/ProfilePanel";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useMe, deriveInitials } from "@/features/me/MeProvider";
import { isDemoMode } from "@/lib/demoMode";
import { ApiError } from "@/lib/api";
import type { ClientAlert } from "@/features/dashboard/api";
import { DEMO_ALERT_LIST } from "@/features/alerts/mockData";
import { cancelPendingAlert, listAlerts } from "@/features/alerts/api";
import { AlertsHero } from "@/features/alerts/components/AlertsHero";
import {
  type AlertStatusSegment,
  type AmountBucket,
  type PeriodFilter,
  type RiskFilter,
  AlertsFilterBar,
} from "@/features/alerts/components/AlertsFilterBar";
import { AlertCard } from "@/features/alerts/components/AlertCard";

/**
 * Fraud alerts page (Figma 208:2).
 *
 * Layout: TopBar + educational hero strip + filter bar + a stack of
 * alert cards. Filters apply client-side until the BE adds server-side
 * filter params (B4). The "View transaction" CTA on each card deep-
 * links into `/transactions?ref=…` so the row auto-expands there.
 */
export function AlertsPage() {
  const { me } = useMe();
  const toast = useToast();
  const demo = isDemoMode();

  const [profilePanelOpen, setProfilePanelOpen] = useState(false);
  const [alerts, setAlerts] = useState<ClientAlert[] | null>(null);
  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);

  const [status, setStatus] = useState<AlertStatusSegment>("ALL");
  const [bank, setBank] = useState<string>("ALL");
  const [risk, setRisk] = useState<RiskFilter>("ALL");
  const [amount, setAmount] = useState<AmountBucket>("ALL");
  const [period, setPeriod] = useState<PeriodFilter>("90d");

  // Pagination — IntersectionObserver triggers `loadNextPage` when the
  // sentinel scrolls into view. Demo mode loads everything up front.
  const PAGE_SIZE = 20;
  const [pageIdx, setPageIdx] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingNext, setLoadingNext] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  /* ─── Initial load ────────────────────────────────────────────────── */

  useEffect(() => {
    if (demo) {
      setAlerts(DEMO_ALERT_LIST);
      setHasMore(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await listAlerts({ page: 0, size: PAGE_SIZE });
        if (cancelled) return;
        setAlerts(res.content);
        setHasMore(res.content.length >= PAGE_SIZE);
      } catch (err) {
        if (cancelled) return;
        if (!(err instanceof ApiError)) throw err;
        // Endpoint may not be implemented yet — fall back to "no alerts"
        // so the page still renders the hero + filter bar cleanly.
        setAlerts([]);
        setHasMore(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [demo]);

  /* ─── Load more on scroll-to-bottom ──────────────────────────────── */

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
  }, [demo, hasMore, loadingNext, pageIdx]);

  async function loadNextPage() {
    if (loadingNext || !hasMore) return;
    const nextPage = pageIdx + 1;
    setLoadingNext(true);
    try {
      const res = await listAlerts({ page: nextPage, size: PAGE_SIZE });
      if (res.content.length === 0) {
        setHasMore(false);
      } else {
        setAlerts((prev) => [...(prev ?? []), ...res.content]);
        setPageIdx(nextPage);
        setHasMore(res.content.length >= PAGE_SIZE);
      }
    } catch {
      setHasMore(false);
    } finally {
      setLoadingNext(false);
    }
  }

  /* ─── Derived data ────────────────────────────────────────────────── */

  const bankOptions = useMemo(() => {
    const set = new Set<string>();
    (alerts ?? []).forEach((a) => {
      if (a.sourceBankCode) set.add(a.sourceBankCode);
      if (a.destBankCode) set.add(a.destBankCode);
    });
    return Array.from(set).sort();
  }, [alerts]);

  const monthlyCount = useMemo(() => {
    if (!alerts) return 0;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return alerts.filter(
      (a) => new Date(a.createdAt).getTime() >= monthStart,
    ).length;
  }, [alerts]);

  const filtered = useMemo(() => {
    if (!alerts) return [] as ClientAlert[];
    const periodCutoff = computePeriodCutoff(period);
    return alerts.filter((a) => {
      // Status segment
      if (status !== "ALL" && a.status !== status) return false;
      // Risk
      if (risk !== "ALL" && a.riskLevel !== risk) return false;
      // Bank
      if (
        bank !== "ALL" &&
        a.sourceBankCode !== bank &&
        a.destBankCode !== bank
      ) {
        return false;
      }
      // Amount bucket
      if (amount !== "ALL") {
        const v = a.amount;
        if (amount === "0-1000" && !(v < 1000)) return false;
        if (amount === "1000-5000" && !(v >= 1000 && v < 5000)) return false;
        if (amount === "5000-10000" && !(v >= 5000 && v < 10000)) return false;
        if (amount === "10000+" && !(v >= 10000)) return false;
      }
      // Period
      if (periodCutoff) {
        const ts = new Date(a.createdAt).getTime();
        if (ts < periodCutoff) return false;
      }
      return true;
    });
  }, [alerts, status, bank, risk, amount, period]);

  /* ─── Cancel-pending action ───────────────────────────────────────── */

  const pendingAlert =
    pendingCancelId !== null
      ? (alerts ?? []).find((a) => a.id === pendingCancelId)
      : null;

  async function confirmCancel() {
    if (!pendingAlert) return;
    setCancelBusy(true);
    try {
      if (!demo) {
        await cancelPendingAlert(pendingAlert.id);
      }
      setAlerts((prev) =>
        (prev ?? []).map((a) =>
          a.id === pendingAlert.id ? { ...a, status: "CANCELLED" } : a,
        ),
      );
      toast.showToast({
        tier: "success",
        message: "Transfer cancelled — money stays in your account.",
      });
      setPendingCancelId(null);
    } catch (err) {
      const msg =
        err instanceof ApiError && err.message
          ? err.message
          : "Couldn't cancel the transfer. Try again.";
      toast.showToast({ tier: "danger", message: msg });
    } finally {
      setCancelBusy(false);
    }
  }

  const initials = deriveInitials(me);

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-surface-soft">
      <TopBar
        variant="light"
        pageName="Fraud alerts"
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
          <AlertsHero monthlyCount={monthlyCount} />

          <AlertsFilterBar
            status={status}
            onStatusChange={setStatus}
            bank={bank}
            bankOptions={bankOptions}
            onBankChange={setBank}
            risk={risk}
            onRiskChange={setRisk}
            amount={amount}
            onAmountChange={setAmount}
            period={period}
            onPeriodChange={setPeriod}
          />

          {/* Cards stack */}
          {alerts === null && <ListSkeleton />}
          {alerts !== null && filtered.length === 0 && <EmptyState />}
          {filtered.map((a) => (
            <AlertCard
              key={a.id}
              alert={a}
              onCancel={() => setPendingCancelId(a.id)}
            />
          ))}

          {/* Load-more sentinel + footer status */}
          {alerts !== null && filtered.length > 0 && (
            <div ref={sentinelRef} className="flex justify-center pt-2">
              {loadingNext ? (
                <p className="font-sans text-[12px] text-text-secondary">
                  Loading more alerts…
                </p>
              ) : hasMore ? (
                <p className="font-sans text-[12px] text-text-muted">
                  Scroll for more
                </p>
              ) : (
                <p className="font-sans text-[12px] text-text-muted">
                  You've reached the end of your alerts.
                </p>
              )}
            </div>
          )}
        </div>
      </main>

      <ConfirmDialog
        open={pendingAlert !== null}
        variant="warning"
        title="Cancel this transfer?"
        message={
          pendingAlert ? (
            <>
              You're about to cancel the{" "}
              <span className="font-semibold text-text-primary">
                {formatTnd(pendingAlert.amount)} TND
              </span>{" "}
              transfer to{" "}
              <span className="font-semibold text-text-primary">
                {pendingAlert.counterpartName}
              </span>
              . The money returns to your account and the analyst will be
              notified you cancelled.
            </>
          ) : (
            ""
          )
        }
        confirmLabel="Cancel transfer"
        cancelLabel="Keep waiting"
        busy={cancelBusy}
        onConfirm={confirmCancel}
        onCancel={() => setPendingCancelId(null)}
      />
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────────────── */

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

function formatTnd(value: number): string {
  const fixed = value.toFixed(3);
  const [intPart, frac] = fixed.split(".");
  return `${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${frac}`;
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-[200px] animate-pulse rounded-[14px] bg-surface-card"
          aria-hidden
        />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[14px] border border-border-soft bg-surface-card px-6 py-16 text-center">
      <p className="font-sans text-[15px] font-semibold text-text-primary">
        No alerts match these filters.
      </p>
      <p className="font-sans text-[13px] text-text-secondary">
        Try widening the period or switching to "All" — alerts only show up
        when ML flags an outgoing transfer for review.
      </p>
    </div>
  );
}
