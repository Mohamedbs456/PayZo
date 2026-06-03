import { useState } from "react";
import { useFraudAlertsList } from "@/features/fraud-alerts/hooks";
import { FraudAlertsToolbar } from "@/features/fraud-alerts/components/FraudAlertsToolbar";
import { FraudAlertsTable } from "@/features/fraud-alerts/components/FraudAlertsTable";
import { useEnterSearch } from "@/lib/hooks/useEnterSearch";
import type { AlertStatus } from "@/features/fraud-alerts/api";
import type {
  AmountBand,
  DashboardPeriod,
  RiskLevel,
} from "@/features/transactions/api";

/**
 * Fraud alerts queue (D33). Pre-filtered to PENDING by default since that's
 * what analysts triage day-to-day; the status filter still lets them browse
 * decided history. Inline expansion exposes the full Approve / Reject panel
 * with a comment textarea (required when rejecting).
 */
export function FraudAlertsPage() {
  const [status, setStatus] = useState<AlertStatus | null>("PENDING");
  const [risk, setRisk] = useState<RiskLevel | null>(null);
  const [bank, setBank] = useState<string | null>(null);
  const [amount, setAmount] = useState<AmountBand | null>(null);
  const [period, setPeriod] = useState<DashboardPeriod | null>(null);
  const search = useEnterSearch();

  const {
    items,
    totalElements,
    loadingInitial,
    loadingMore,
    hasMore,
    error,
    loadMore,
    patchItem,
  } = useFraudAlertsList({
    status,
    risk,
    bank,
    amount,
    period,
    q: search.committed,
  });

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4 p-5 overflow-x-clip">
      <FraudAlertsToolbar
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

      <div className="flex shrink-0 items-baseline gap-2">
        <span className="font-sans text-[12px] font-bold text-text-primary">
          {status === "PENDING" ? "Pending alerts" : "Fraud alerts"}
        </span>
        <span className="font-sans text-[12px] text-text-muted">
          {totalElements.toLocaleString()}{" "}
          {totalElements === 1 ? "alert" : "alerts"}
        </span>
      </div>

      <FraudAlertsTable
        items={items}
        loadingInitial={loadingInitial}
        loadingMore={loadingMore}
        hasMore={hasMore}
        error={error}
        onLoadMore={loadMore}
        onAlertPatched={patchItem}
      />
    </div>
  );
}
