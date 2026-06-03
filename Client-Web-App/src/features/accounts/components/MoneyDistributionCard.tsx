import { Sparkles } from "lucide-react";
import {
  BankBalanceBarChart,
  type BankBucket,
} from "@/features/accounts/components/BankBalanceBarChart";
import { AccountSliceDonutChart } from "@/features/accounts/components/AccountSliceDonutChart";
import type { ClientAccount } from "@/features/dashboard/api";

interface MoneyDistributionCardProps {
  totalBalance: number;
  totalAccounts: number;
  buckets: BankBucket[];
  selectedBank: string | null;
  onSelectBank: (bankCode: string) => void;
  accountsForSelectedBank: ClientAccount[];
  selectedAccount: string | null;
  onSelectAccount: (accountNumber: string) => void;
}

/**
 * The single white card at the top of the Accounts page (Figma 120:2).
 * Header: "MONEY DISTRIBUTION · ALL ACCOUNTS" eyebrow + total + count
 * + a small "click or hover to toggle" hint pill. Body: bar chart on
 * the left (bank totals), donut chart on the right (accounts within
 * the selected bank). Below `lg`, the two charts stack.
 */
export function MoneyDistributionCard({
  totalBalance,
  totalAccounts,
  buckets,
  selectedBank,
  onSelectBank,
  accountsForSelectedBank,
  selectedAccount,
  onSelectAccount,
}: MoneyDistributionCardProps) {
  const selectedBankBucket = buckets.find((b) => b.bankCode === selectedBank);
  const bankTotal = selectedBankBucket?.total ?? 0;

  return (
    <div className="flex flex-col gap-6 overflow-hidden rounded-3xl border border-border-soft bg-surface-card px-6 py-6 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.08)] sm:px-9 sm:py-7">
      {/* Header row — title block + hint pill */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <p
            className="font-sans text-[11px] font-medium uppercase tracking-[0.12em] text-accent"
            style={{ fontVariationSettings: "'wdth' 100" }}
          >
            Money distribution · All accounts
          </p>
          <div className="flex items-baseline gap-3">
            <p className="font-sans text-[clamp(32px,5vw,48px)] font-bold leading-none tracking-tight text-text-primary">
              {formatTnd(totalBalance)}
            </p>
            <p className="font-sans text-[18px] font-semibold text-text-muted">
              TND
            </p>
          </div>
          <p className="font-sans text-[12px] text-text-muted">
            {totalAccounts} accounts across {buckets.length} banks
          </p>
        </div>

        <span className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-2">
          <Sparkles className="size-3.5 text-accent" strokeWidth={2} aria-hidden />
          <span className="font-sans text-[11px] font-medium text-text-secondary">
            Click or hover to toggle
          </span>
        </span>
      </div>

      {/* Charts — side by side at lg+, stacked below */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="relative h-[320px] overflow-hidden rounded-2xl border-[1.5px] border-text-primary shadow-[5px_5px_10px_rgba(0,0,0,0.18)]">
          <BankBalanceBarChart
            buckets={buckets}
            selectedBank={selectedBank}
            onSelect={onSelectBank}
          />
        </div>
        <div className="relative h-[320px] overflow-hidden rounded-2xl border-[1.5px] border-text-primary shadow-[5px_5px_10px_rgba(0,0,0,0.18)]">
          {selectedBank && accountsForSelectedBank.length > 0 ? (
            <AccountSliceDonutChart
              bankCode={selectedBank}
              bankTotal={bankTotal}
              accounts={accountsForSelectedBank}
              selectedAccount={selectedAccount}
              onSelect={onSelectAccount}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center px-6 text-center">
              <p className="font-sans text-[12px] text-text-muted">
                Pick a bank in the bar chart to see the breakdown by account.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatTnd(value: number): string {
  const fixed = Math.abs(value).toFixed(3);
  const [intPart, fracPart] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${grouped}.${fracPart}`;
}
