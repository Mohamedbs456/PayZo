import { useState } from "react";
import { useTransactionsList } from "@/features/transactions/hooks";
import { TransactionsToolbar } from "@/features/transactions/components/TransactionsToolbar";
import { TransactionsTable } from "@/features/transactions/components/TransactionsTable";
import { useEnterSearch } from "@/lib/hooks/useEnterSearch";
import type {
  AmountBand,
  DashboardPeriod,
  RiskLevel,
  TransactionStatus,
} from "@/features/transactions/api";

/**
 * Platform transactions ledger (D32). View-only across all BO roles. Five
 * filter pills + full-text search; clicking any row expands it inline to
 * reveal Parties / Money trail / Pipeline. Same toolbar dropdown shape and
 * `overflow-x-clip` outer wrapper as the Accounts page so dropdowns can
 * extend below the toolbar without being clipped.
 */
export function TransactionsPage() {
  const [status, setStatus] = useState<TransactionStatus | null>(null);
  const [risk, setRisk] = useState<RiskLevel | null>(null);
  const [bank, setBank] = useState<string | null>(null);
  const [amount, setAmount] = useState<AmountBand | null>(null);
  const [period, setPeriod] = useState<DashboardPeriod | null>(null);
  // Press Enter to search — typing alone doesn't refetch.
  const search = useEnterSearch();

  const {
    items,
    totalElements,
    loadingInitial,
    loadingMore,
    hasMore,
    error,
    loadMore,
  } = useTransactionsList({
    status,
    risk,
    bank,
    amount,
    period,
    q: search.committed,
  });

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4 p-5 overflow-x-clip">
      {/* ── Toolbar ───────────────────────────────────────────────── */}
      <TransactionsToolbar
        status={status}
        risk={risk}
        bank={bank}
        amount={amount}
        period={period}
        searchInput={search.draft}
        onStatusChange={setStatus}
        onRiskChange={setRisk}
        onBankChange={setBank}
        onAmountChange={setAmount}
        onPeriodChange={setPeriod}
        onSearchChange={search.setDraft}
        onSearchSubmit={search.commit}
        onSearchClear={search.clear}
      />

      {/* ── Sub-header ────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-baseline gap-2">
        <span className="font-sans text-[12px] font-bold text-text-primary">
          Transactions
        </span>
        <span className="font-sans text-[12px] text-text-muted">
          {totalElements.toLocaleString()}{" "}
          {totalElements === 1 ? "result" : "results"}
        </span>
      </div>

      {/* ── Table ─────────────────────────────────────────────────── */}
      <TransactionsTable
        items={items}
        loadingInitial={loadingInitial}
        loadingMore={loadingMore}
        hasMore={hasMore}
        error={error}
        onLoadMore={loadMore}
      />
    </div>
  );
}
