import { useEffect, useState } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { ProfilePanel } from "@/components/layout/ProfilePanel";
import { useMe, deriveInitials } from "@/features/me/MeProvider";
import { FirstLoginPasswordModal } from "@/features/auth/FirstLoginPasswordModal";
import { isDemoMode } from "@/lib/demoMode";
import { ApiError } from "@/lib/api";
import {
  type ClientAccount,
  type ClientAlertSummary,
  type ClientTransaction,
  getAccounts,
  getAlertSummary,
} from "@/features/dashboard/api";
import { listTransactions } from "@/features/transactions/api";
import {
  DEMO_ACCOUNTS,
  DEMO_ALERT_SUMMARY,
  DEMO_RECENT_TRANSACTIONS,
} from "@/features/dashboard/mockData";
import { BalanceHeroCard } from "@/features/dashboard/components/BalanceHeroCard";
import { SendMoneyCard } from "@/features/dashboard/components/SendMoneyCard";
import { RecentTransactionsCard } from "@/features/dashboard/components/RecentTransactionsCard";
import { FraudAlertsCard } from "@/features/dashboard/components/FraudAlertsCard";

/**
 * The first internal page after sign-in (Figma 109:2). Light TopBar
 * with personalized welcome + live date subtitle, then a 2-row × 2-col
 * grid:
 *   ┌───────────── Balance hero ─────────────┐ ┌── Send money ──┐
 *   │            (gradient, wide)            │ │   (white CTA)  │
 *   └────────────────────────────────────────┘ └────────────────┘
 *   ┌────────── Recent transactions ─────────┐ ┌── Fraud alerts ┐
 *   │              (white, wide)             │ │   (white, sm)  │
 *   └────────────────────────────────────────┘ └────────────────┘
 *
 * Below lg the 2-col grid collapses to a single column so the page
 * stays useful on tablets / phones. Body never scrolls — the content
 * area below the TopBar has its own `overflow-y-auto` so the TopBar
 * stays pinned.
 */
export function DashboardPage() {
  const { me, patch } = useMe();
  const demo = isDemoMode();

  const [accounts, setAccounts] = useState<ClientAccount[] | null>(null);
  const [recent, setRecent] = useState<ClientTransaction[] | null>(null);
  const [alerts, setAlerts] = useState<ClientAlertSummary | null>(null);
  const [profilePanelOpen, setProfilePanelOpen] = useState(false);

  // Live date / time stamp under the welcome line. Updates every minute
  // — that's enough for the 14:32 display while keeping renders cheap.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const handle = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(handle);
  }, []);

  // Demo mode short-circuits every BE call — production hits the wire.
  useEffect(() => {
    if (demo) {
      setAccounts(DEMO_ACCOUNTS);
      setRecent(DEMO_RECENT_TRANSACTIONS);
      setAlerts(DEMO_ALERT_SUMMARY);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const accs = await getAccounts();
        if (cancelled) return;
        setAccounts(accs);
        // One call to the aggregate /client/transactions endpoint — already
        // merges payzo_db.transactions with cbs_db.cbs_transactions, so the
        // recent card surfaces externals + PayZo transfers in the same view.
        // Previously this used per-account getAccountTransactions which only
        // hits payzo_db → externals never showed in the dashboard card.
        const recentResult = await listTransactions({ page: 0, size: 4 });
        if (cancelled) return;
        setRecent(recentResult.content);
      } catch (err) {
        if (cancelled) return;
        if (!(err instanceof ApiError)) throw err;
        setAccounts([]);
        setRecent([]);
      }

      try {
        const summary = await getAlertSummary();
        if (cancelled) return;
        setAlerts(summary);
      } catch (err) {
        if (cancelled) return;
        if (!(err instanceof ApiError)) throw err;
        // Endpoint may not be implemented yet — fall back to "no alerts"
        // so the dashboard still renders cleanly.
        setAlerts({
          alerts: [],
          totalCount: 0,
          underReviewCount: 0,
          rejectedCount: 0,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [demo]);

  const totalBalance = (accounts ?? []).reduce((s, a) => s + a.balance, 0);
  const bankCodes = Array.from(new Set((accounts ?? []).map((a) => a.bankCode)));
  const accountCount = accounts?.length ?? 0;
  const firstName = me?.firstName ?? "there";
  const initials = deriveInitials(me);
  const trustScore = me?.trustScore ?? undefined;

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-surface-soft">
      <TopBar
        variant="light"
        showBack={false}
        pageName={`Welcome back, ${firstName}`}
        subtitle={formatWelcomeDate(now)}
        me={me ? { initials, trustScore, profilePictureUrl: me.profilePictureUrl } : null}
        onAvatarClick={() => setProfilePanelOpen(true)}
      />

      <ProfilePanel
        open={profilePanelOpen}
        onClose={() => setProfilePanelOpen(false)}
        me={me}
      />

      {/* Forced first-login password rotation. Mounted only when the
          backend says this user hasn't rotated yet — the modal blocks
          everything until they set a password. Optimistically flip the
          flag locally on success so the modal unmounts immediately. */}
      {me?.firstLoginCompleted === false && (
        <FirstLoginPasswordModal
          firstName={firstName === "there" ? "" : firstName}
          onSuccess={() => patch({ firstLoginCompleted: true })}
        />
      )}

      <main className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-8 sm:py-5 lg:overflow-hidden lg:gap-5">
        {/* ─── Hero row ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr] lg:flex-1 lg:min-h-0">
          <BalanceHeroCard
            totalBalance={totalBalance}
            bankCodes={bankCodes}
            accountCount={accountCount}
          />
          <SendMoneyCard />
        </div>

        {/* ─── Content row ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr] lg:flex-1 lg:min-h-0">
          <RecentTransactionsCard transactions={recent ?? []} />
          <FraudAlertsCard
            summary={
              alerts ?? {
                alerts: [],
                totalCount: 0,
                underReviewCount: 0,
                rejectedCount: 0,
              }
            }
          />
        </div>
      </main>
    </div>
  );
}

/** "Saturday, May 2 · 14:32" — matches the TopBar subtitle in Figma. */
function formatWelcomeDate(d: Date): string {
  const date = d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} · ${time}`;
}
