import { useState } from "react";
import { TransactionsPerBankCard } from "@/features/dashboard/components/TransactionsPerBankCard";
import { MoneyPerBankCard } from "@/features/dashboard/components/MoneyPerBankCard";
import { MlConfigSummaryCard } from "@/features/dashboard/components/MlConfigSummaryCard";
import { RecentFraudAlertsCard } from "@/features/dashboard/components/RecentFraudAlertsCard";

/**
 * Analyst dashboard — 3 cols × 2 rows.
 *
 *   ┌──────────────────────┬──────────────────┬─────────────────────┐
 *   │ Transactions per bank│ ML config summary│ Recent fraud alerts │
 *   │ donut (C1, 1×1)      │ (C2, 1×1)        │ (C4, 1×2)           │
 *   ├──────────────────────┴──────────────────┤                     │
 *   │ Money sent per bank — line (C3, 1×2)    │                     │
 *   └─────────────────────────────────────────┴─────────────────────┘
 *
 * Same C1↔C3 selectedBank link as the other dashboards. C2 is a
 * compact mirror of /ml-config so analysts spot a model-status change
 * without leaving the dashboard. C4 is a duplicate of the SA card —
 * fraud-triage is the analyst's home base.
 */
export function AnalystDashboard() {
  const [selectedBank, setSelectedBank] = useState<string | null>(null);

  return (
    <div
      className="grid h-full min-h-0 w-full grid-cols-3 gap-4 overflow-hidden p-5"
      style={{ gridTemplateRows: "1fr 1fr" }}
    >
      {/* Row 1, Col 1 */}
      <TransactionsPerBankCard
        selectedBank={selectedBank}
        onSelectBank={setSelectedBank}
      />

      {/* Row 1, Col 2 */}
      <MlConfigSummaryCard />

      {/* Col 3, both rows */}
      <RecentFraudAlertsCard className="row-span-2" />

      {/* Row 2, Cols 1–2 */}
      <MoneyPerBankCard selectedBank={selectedBank} />
    </div>
  );
}
