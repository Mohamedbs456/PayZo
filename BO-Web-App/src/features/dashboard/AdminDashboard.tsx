import { useState } from "react";
import { ClientsPerBankCard } from "@/features/dashboard/components/ClientsPerBankCard";
import { MoneyPerBankCard } from "@/features/dashboard/components/MoneyPerBankCard";
import { RecentTransactionsCard } from "@/features/dashboard/components/RecentTransactionsCard";
import { PendingClientsCard } from "@/features/dashboard/components/PendingClientsCard";
import type { DashboardPeriod } from "@/features/dashboard/api";

/**
 * Admin dashboard — 3 cols × 2 rows.
 *
 *   ┌────────────────────┬────────────────────┬─────────────────┐
 *   │ Clients per bank   │ Recent transactions│ Pending clients │
 *   │ (C1, 1×1)          │ (C2, 1×1)          │ (C4, 1×2)       │
 *   ├────────────────────┴────────────────────┤                 │
 *   │ Money sent per bank — line (C3, 1×2)    │                 │
 *   └─────────────────────────────────────────┴─────────────────┘
 *
 * C1 (donut click) drives C3 (line chart) — same selectedBank lift
 * pattern as the SA dashboard. C4 sits in a single column but spans
 * both rows so it has room to list a queue.
 *
 * Data sources (under the hood — see `useDashboard` adapter):
 *   - C1 → /admin/dashboard/stats → clientsPerBank
 *   - C2 → /transactions
 *   - C3 → /transactions (bucketed client-side)
 *   - C4 → /admin/clients?status=PENDING
 */
export function AdminDashboard() {
  const [period] = useState<DashboardPeriod>("30d");
  const [selectedBank, setSelectedBank] = useState<string | null>(null);

  return (
    <div
      className="grid h-full min-h-0 w-full grid-cols-3 gap-4 overflow-hidden p-5"
      style={{ gridTemplateRows: "1fr 1fr" }}
    >
      {/* Row 1, Col 1 */}
      <ClientsPerBankCard
        period={period}
        selectedBank={selectedBank}
        onSelectBank={setSelectedBank}
      />

      {/* Row 1, Col 2 */}
      <RecentTransactionsCard />

      {/* Col 3, both rows */}
      <PendingClientsCard />

      {/* Row 2, Cols 1–2 — MoneyPerBankCard already declares col-span-2 internally */}
      <MoneyPerBankCard selectedBank={selectedBank} />
    </div>
  );
}
