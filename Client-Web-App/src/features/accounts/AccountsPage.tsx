import { useEffect, useMemo, useState } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { ProfilePanel } from "@/components/layout/ProfilePanel";
import { useMe, deriveInitials } from "@/features/me/MeProvider";
import { isDemoMode } from "@/lib/demoMode";
import { ApiError } from "@/lib/api";
import {
  type ClientAccount,
  getAccounts,
} from "@/features/dashboard/api";
import { DEMO_ACCOUNTS } from "@/features/dashboard/mockData";
import { MoneyDistributionCard } from "@/features/accounts/components/MoneyDistributionCard";
import { BankCard } from "@/features/accounts/components/BankCard";
import type { BankBucket } from "@/features/accounts/components/BankBalanceBarChart";

/**
 * "My accounts" — Figma 117:2. Two main blocks:
 *   1. <MoneyDistributionCard /> — bar chart (banks) + donut (accounts
 *      in selected bank). Selecting a bar drives the donut; selecting
 *      a slice drives the row selection in (2).
 *   2. <BanksList /> — one expandable card per bank, each containing
 *      its accounts. Selected bank gets accent-soft tint + "SHOWN IN
 *      PIE" pill. Selected account gets a 4px accent left bar + an
 *      auto-expanded detail strip with copy-able account number, type,
 *      agency, opened date, last activity, and "View transactions →".
 *
 * Page is allowed to scroll (per the user's spec) — the TopBar stays
 * pinned outside the scroll region.
 */
export function AccountsPage() {
  const { me } = useMe();
  const demo = isDemoMode();

  const [accounts, setAccounts] = useState<ClientAccount[] | null>(null);
  const [profilePanelOpen, setProfilePanelOpen] = useState(false);

  // Fetch on mount; demo mode short-circuits to the mock.
  useEffect(() => {
    if (demo) {
      setAccounts(DEMO_ACCOUNTS);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await getAccounts();
        if (!cancelled) setAccounts(data);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError) setAccounts([]);
        else throw err;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [demo]);

  // Group accounts by bank to feed the chart + the list.
  const buckets = useMemo<BankBucket[]>(() => {
    const map = new Map<string, BankBucket>();
    for (const a of accounts ?? []) {
      const cur = map.get(a.bankCode) ?? {
        bankCode: a.bankCode,
        total: 0,
        accountCount: 0,
      };
      cur.total += a.balance;
      cur.accountCount += 1;
      map.set(a.bankCode, cur);
    }
    return Array.from(map.values()).sort((x, y) => y.total - x.total);
  }, [accounts]);

  // Selected bank defaults to the largest one (matches Figma's
  // out-of-the-box state showing BIAT).
  const [selectedBank, setSelectedBank] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedBank && buckets.length > 0) {
      setSelectedBank(buckets[0].bankCode);
    }
  }, [buckets, selectedBank]);

  // Selected account inside the donut.
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);

  // When the bank changes, drop the account selection (the previous
  // account belongs to the old bank).
  function handleSelectBank(code: string) {
    setSelectedBank(code);
    setSelectedAccount(null);
  }

  function handleSelectAccount(accountNumber: string | null) {
    setSelectedAccount(accountNumber);
    if (accountNumber) {
      // Make sure the bank that owns this account is the one driving
      // the donut, even if the click came from the list (which crosses
      // bank boundaries).
      const owner = (accounts ?? []).find(
        (a) => a.accountNumber === accountNumber,
      );
      if (owner && owner.bankCode !== selectedBank) {
        setSelectedBank(owner.bankCode);
      }
    }
  }

  const totalBalance = (accounts ?? []).reduce((s, a) => s + a.balance, 0);
  const accountsForSelectedBank = (accounts ?? []).filter(
    (a) => a.bankCode === selectedBank,
  );
  const initials = deriveInitials(me);

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-surface-soft">
      <TopBar
        variant="light"
        pageName="My accounts"
        me={me ? { initials, trustScore: me.trustScore, profilePictureUrl: me.profilePictureUrl } : null}
        onAvatarClick={() => setProfilePanelOpen(true)}
      />

      <ProfilePanel
        open={profilePanelOpen}
        onClose={() => setProfilePanelOpen(false)}
        me={me}
      />

      <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        <div className="mx-auto flex w-full max-w-[1376px] flex-col gap-6">
          <MoneyDistributionCard
            totalBalance={totalBalance}
            totalAccounts={accounts?.length ?? 0}
            buckets={buckets}
            selectedBank={selectedBank}
            onSelectBank={handleSelectBank}
            accountsForSelectedBank={accountsForSelectedBank}
            selectedAccount={selectedAccount}
            onSelectAccount={handleSelectAccount}
          />

          <section className="flex flex-col gap-4">
            <header className="flex items-center gap-3 px-1">
              <h2 className="font-sans text-[clamp(20px,2.4vw,25px)] font-bold leading-tight text-text-primary">
                Your banks
              </h2>
              <span className="inline-flex items-center rounded-full bg-surface-raised px-2 py-1">
                <span className="whitespace-nowrap font-sans text-[13px] font-semibold text-text-secondary sm:text-[15px]">
                  {buckets.length} banks · {accounts?.length ?? 0} accounts
                </span>
              </span>
            </header>

            {buckets.length === 0 && accounts !== null ? (
              <div className="rounded-2xl border border-border-soft bg-surface-card px-6 py-12 text-center">
                <p className="font-sans text-[14px] font-semibold text-text-primary">
                  No accounts on file
                </p>
                <p className="mt-1 font-sans text-[12px] text-text-muted">
                  Once your bank shares an account with PayZo, it'll appear here.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {buckets.map((b) => {
                  const list = (accounts ?? []).filter(
                    (a) => a.bankCode === b.bankCode,
                  );
                  return (
                    <BankCard
                      key={b.bankCode}
                      bankCode={b.bankCode}
                      bankName={list[0]?.bankName ?? b.bankCode}
                      total={b.total}
                      accounts={list}
                      isInPie={selectedBank === b.bankCode}
                      selectedAccount={selectedAccount}
                      onSelectAccount={handleSelectAccount}
                      defaultAccountId={me?.defaultAccountId ?? null}
                    />
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
