import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { ChangePasswordModalProvider } from "@/features/me/ChangePasswordModalProvider";
import { BoMeProvider } from "@/features/me/BoMeProvider";

interface PageMeta {
  title: string;
  subtitle: string;
}

const PAGE_META: Record<string, PageMeta> = {
  "/dashboard": { title: "Dashboard", subtitle: "Platform overview " },
  "/clients": { title: "Clients", subtitle: "Manage all client accounts" },
  "/accounts": { title: "Accounts", subtitle: "All bank accounts" },
  "/staff-management": {
    title: "Staff Management",
    subtitle: "Admins-Analysts-Banks",
  },
  "/transactions": { title: "Transactions", subtitle: "All platform transfers" },
  "/fraud-alerts": {
    title: "Fraud Alerts",
    subtitle: "Pending decisions",
  },
  "/ml-config": {
    title: "ML Config",
    subtitle: "Thresholds and model status",
  },
  "/audit-log": { title: "Audit Log", subtitle: "Backoffice activity" },
};

const FALLBACK: PageMeta = { title: "Page", subtitle: "" };

/**
 * Page shell — sidebar (fixed rail) + topbar + main content area.
 *
 * Scrolling contract: NOTHING scrolls. Sidebar, topbar, and main are all
 * `overflow-hidden`. Pages must fit the available space (`min-h-0 flex-1`)
 * and shrink their own content when the viewport is short. Long lists
 * inside cards may scroll inside their card, but the page chrome never does.
 */
export function RootLayout() {
  const { pathname } = useLocation();
  const meta = PAGE_META[pathname] ?? FALLBACK;

  return (
    <BoMeProvider>
      <ChangePasswordModalProvider>
        <div className="flex h-dvh w-full overflow-hidden bg-brand-cream">
          <Sidebar />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <Topbar title={meta.title} subtitle={meta.subtitle} />
            <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-[#f0e4d0]">
              <Outlet />
            </main>
          </div>
        </div>
      </ChangePasswordModalProvider>
    </BoMeProvider>
  );
}
