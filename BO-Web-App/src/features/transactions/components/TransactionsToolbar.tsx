import { Search, Activity, Shield, Calendar, Coins, X } from "lucide-react";
import { BankFilterDropdown } from "@/features/accounts/components/BankFilterDropdown";
import { PillSelect } from "./PillSelect";
import type {
  AmountBand,
  DashboardPeriod,
  RiskLevel,
  TransactionStatus,
} from "../api";

interface TransactionsToolbarProps {
  status: TransactionStatus | null;
  risk: RiskLevel | null;
  bank: string | null;
  amount: AmountBand | null;
  period: DashboardPeriod | null;
  searchInput: string;
  onStatusChange: (s: TransactionStatus | null) => void;
  onRiskChange: (r: RiskLevel | null) => void;
  onBankChange: (b: string | null) => void;
  onAmountChange: (a: AmountBand | null) => void;
  onPeriodChange: (p: DashboardPeriod | null) => void;
  onSearchChange: (q: string) => void;
  onSearchSubmit: () => void;
  onSearchClear: () => void;
}

const STATUS_OPTIONS = [
  { value: null, label: "All statuses" },
  { value: "PENDING_OTP" as const, label: "Pending OTP" },
  { value: "PENDING_SCORING" as const, label: "Scoring" },
  { value: "APPROVED" as const, label: "Approved" },
  { value: "REJECTED" as const, label: "Rejected" },
  { value: "SUSPENDED_PENDING_ANALYST" as const, label: "Suspended" },
  { value: "CANCELLED" as const, label: "Cancelled" },
];

const RISK_OPTIONS = [
  { value: null, label: "All risk levels" },
  { value: "LOW" as const, label: "Low" },
  { value: "MEDIUM" as const, label: "Medium" },
  { value: "HIGH" as const, label: "High" },
];

const AMOUNT_OPTIONS = [
  { value: null, label: "Any amount" },
  { value: "UNDER_1K" as const, label: "Under 1k" },
  { value: "BETWEEN_1K_5K" as const, label: "1k – 5k" },
  { value: "BETWEEN_5K_10K" as const, label: "5k – 10k" },
  { value: "OVER_10K" as const, label: "Over 10k" },
];

const PERIOD_OPTIONS = [
  { value: null, label: "Any time" },
  { value: "today" as const, label: "Today" },
  { value: "7d" as const, label: "Last 7 days" },
  { value: "30d" as const, label: "Last 30 days" },
  { value: "90d" as const, label: "Last 90 days" },
];

/**
 * 5-filter toolbar for the Transactions page (D32 / Impact 9). Each pill
 * uses the same dropdown shape as the Bank filter — left-anchored panel,
 * `role="button"` trigger, click-outside + Escape close.
 */
export function TransactionsToolbar({
  status,
  risk,
  bank,
  amount,
  period,
  searchInput,
  onStatusChange,
  onRiskChange,
  onBankChange,
  onAmountChange,
  onPeriodChange,
  onSearchChange,
  onSearchSubmit,
  onSearchClear,
}: TransactionsToolbarProps) {
  return (
    <div className="flex w-full flex-wrap items-center gap-3">
      <PillSelect
        icon={<Activity className="size-4" aria-hidden />}
        placeholder="All statuses"
        value={status}
        options={STATUS_OPTIONS}
        onChange={onStatusChange}
        panelWidthPx={180}
      />
      <PillSelect
        icon={<Shield className="size-4" aria-hidden />}
        placeholder="All risk levels"
        value={risk}
        options={RISK_OPTIONS}
        onChange={onRiskChange}
        panelWidthPx={180}
      />
      <BankFilterDropdown value={bank} onChange={onBankChange} />
      <PillSelect
        icon={<Coins className="size-4" aria-hidden />}
        placeholder="Any amount"
        value={amount}
        options={AMOUNT_OPTIONS}
        onChange={onAmountChange}
        panelWidthPx={170}
      />
      <PillSelect
        icon={<Calendar className="size-4" aria-hidden />}
        placeholder="Any time"
        value={period}
        options={PERIOD_OPTIONS}
        onChange={onPeriodChange}
        panelWidthPx={180}
      />

      <div className="min-w-0 flex-1" />

      {/* Press Enter to search; X clears. Typing alone doesn't refetch. */}
      <div className="relative flex h-10 w-[300px] shrink-0 items-center rounded-full bg-white px-4 shadow-[0_1px_2px_0_rgba(42,31,20,0.04),0_8px_24px_-6px_rgba(42,31,20,0.10)]">
        <Search className="size-4 shrink-0 text-text-muted" aria-hidden />
        <input
          type="text"
          placeholder="Search by reference, account, or name"
          value={searchInput}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSearchSubmit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onSearchClear();
            }
          }}
          className="ml-2 min-w-0 flex-1 bg-transparent font-sans text-[12px] text-text-primary placeholder:text-text-muted focus:outline-none"
        />
        {searchInput && (
          <button
            type="button"
            onClick={onSearchClear}
            aria-label="Clear search"
            className="ml-1 flex size-6 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors duration-150 hover:bg-brand-cream/40 hover:text-text-primary"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
