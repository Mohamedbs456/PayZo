import { useState } from "react";
import { StaffCard } from "@/features/dashboard/components/StaffCard";
import { ClientsPerBankCard } from "@/features/dashboard/components/ClientsPerBankCard";
import { FraudRateCard } from "@/features/dashboard/components/FraudRateCard";
import { MoneyPerBankCard } from "@/features/dashboard/components/MoneyPerBankCard";
import { TransactionsPerBankCard } from "@/features/dashboard/components/TransactionsPerBankCard";
import { RecentTransactionsCard } from "@/features/dashboard/components/RecentTransactionsCard";
import { RecentFraudAlertsCard } from "@/features/dashboard/components/RecentFraudAlertsCard";
import { MlModelCard } from "@/features/dashboard/components/MlModelCard";
import type { DashboardPeriod } from "@/features/dashboard/api";

/**
 * SuperAdmin dashboard. Each card navigates to its own page on click —
 * StaffCard is the exception, where each bar links to its specific
 * sub-tab on /staff-management.
 *
 * The Money-per-bank line chart no longer stacks every bank's curve at
 * once — it shows ONE bank at a time, driven by the donut on the
 * Clients-per-bank card. Clicking a slice picks the bank for the line
 * chart; clicking the same slice again clears the selection (the chart
 * then falls back to whichever bank reads first in the data).
 */
export function SuperAdminDashboard() {
  const [period] = useState<DashboardPeriod>("30d");
  const [selectedBank, setSelectedBank] = useState<string | null>(null);

  return (
    <div
      className="grid h-full min-h-0 w-full grid-cols-3 gap-4 overflow-hidden p-5"
      style={{ gridTemplateRows: "0.75fr 1.6fr 1fr" }}
    >
      {/* Row 1 — small */}
      <StaffCard period={period} />
      <ClientsPerBankCard
        period={period}
        selectedBank={selectedBank}
        onSelectBank={setSelectedBank}
        // SA row-1 slot is short — single-strip layout, stat panel on
        // the left flowing full-width into the pie on the right.
        // List-below is suppressed; hover on the pie still surfaces
        // each bank's info inline via the stat panel's existing
        // hover state, so no information is lost.
        pieSize={80}
        pieSide="right"
        showBankList={false}
      />
      <FraudRateCard />

      {/* Row 2 — large; first card spans cols 1–2 */}
      <MoneyPerBankCard selectedBank={selectedBank} />
      <TransactionsPerBankCard
        selectedBank={selectedBank}
        onSelectBank={setSelectedBank}
      />

      {/* Row 3 — normal */}
      <RecentTransactionsCard />
      <RecentFraudAlertsCard />
      <MlModelCard />
    </div>
  );
}
