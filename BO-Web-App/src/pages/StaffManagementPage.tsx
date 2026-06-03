import { useEffect, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useEnterSearch } from "@/lib/hooks/useEnterSearch";
import { useBanksList, useStaffMembers, type StaffTab } from "@/features/staff/hooks";
import { StaffMembersTable } from "@/features/staff/components/StaffMembersTable";
import { BanksTable } from "@/features/staff/components/BanksTable";
import { StaffFormDialog } from "@/features/staff/components/StaffFormDialog";

/** Map the lowercased `?tab=` query value to our internal StaffTab enum. */
function paramToTab(raw: string | null): StaffTab {
  switch ((raw ?? "").toLowerCase()) {
    case "analysts":
      return "ANALYSTS";
    case "banks":
      return "BANKS";
    default:
      return "ADMINS";
  }
}

function tabToParam(tab: StaffTab): string {
  return tab.toLowerCase();
}

/**
 * Staff Management (D31) — SuperAdmin-only page with three sub-tabs:
 *   Admins   → expandable rows, +Add admin
 *   Analysts → expandable rows, +Add analyst
 *   Banks    → flat rows + activate/deactivate + logo edit. Banks come
 *              from CBS (D48); the "Sync from CBS" trigger lives inside
 *              the table strip, so the toolbar's +Add button is hidden
 *              on this tab.
 */
export function StaffManagementPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Initialise the active tab from the `?tab=` query (so the dashboard's
  // staff-bar links land on the right sub-tab) and keep them in sync as the
  // user clicks between tabs.
  const [tab, setTab] = useState<StaffTab>(() => paramToTab(searchParams.get("tab")));
  useEffect(() => {
    const fromUrl = paramToTab(searchParams.get("tab"));
    if (fromUrl !== tab) setTab(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleTabChange = (next: StaffTab) => {
    setTab(next);
    // Replace history entry — switching tabs shouldn't pollute the back stack.
    setSearchParams({ tab: tabToParam(next) }, { replace: true });
  };

  // Press Enter to search; typing alone doesn't refetch.
  const search = useEnterSearch();
  const [registerOpen, setRegisterOpen] = useState(false);

  // Each tab owns its own list state — switching tabs preserves scroll/data
  // for the destination tab and lets every list run its own infinite scroll.
  const admins = useStaffMembers({ tab: "ADMINS", q: tab === "ADMINS" ? search.committed : "" });
  const analysts = useStaffMembers({ tab: "ANALYSTS", q: tab === "ANALYSTS" ? search.committed : "" });
  const banks = useBanksList({ q: tab === "BANKS" ? search.committed : "" });

  const totalForTab =
    tab === "ADMINS" ? admins.totalElements
    : tab === "ANALYSTS" ? analysts.totalElements
    : banks.totalElements;

  const addLabel =
    tab === "ADMINS" ? "Add admin" : "Add analyst";

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4 overflow-hidden p-5">
      {/* ── Toolbar ───────────────────────────────────────────────── */}
      <div className="flex w-full items-center gap-4">
        {/* Tabs */}
        <div className="flex shrink-0 items-center gap-1 rounded-full bg-white p-1.5 shadow-[0_1px_2px_0_rgba(42,31,20,0.04),0_8px_24px_-6px_rgba(42,31,20,0.10)]">
          {TABS.map((t) => {
            const isActive = t.value === tab;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => handleTabChange(t.value)}
                className={[
                  "rounded-full px-4 py-1.5 font-sans text-[12px] font-semibold transition-all duration-150 ease-out",
                  isActive ? "bg-brand-dark text-brand-cream" : "text-text-muted hover:text-text-primary",
                ].join(" ")}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="min-w-0 flex-1" />

        {/* Search — Enter to commit, X (or Esc) to clear. */}
        <div className="relative flex h-10 w-[320px] shrink-0 items-center rounded-full bg-white px-4 shadow-[0_1px_2px_0_rgba(42,31,20,0.04),0_8px_24px_-6px_rgba(42,31,20,0.10)]">
          <Search className="size-4 shrink-0 text-text-muted" aria-hidden />
          <input
            type="text"
            placeholder={
              tab === "BANKS" ? "Search banks" : "Search"
            }
            value={search.draft}
            onChange={(e) => search.setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                search.commit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                search.clear();
              }
            }}
            className="ml-2 min-w-0 flex-1 bg-transparent font-sans text-[12px] text-text-primary placeholder:text-text-muted focus:outline-none"
          />
          {search.draft && (
            <button
              type="button"
              onClick={search.clear}
              aria-label="Clear search"
              className="ml-1 flex size-6 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors duration-150 hover:bg-brand-cream/40 hover:text-text-primary"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          )}
        </div>

        {/* +Add button — only relevant for Admins/Analysts. The Banks
            tab owns its own "Sync from CBS" trigger inside the table,
            since banks aren't created from PayZo (D48). */}
        {tab !== "BANKS" && (
          <button
            type="button"
            onClick={() => setRegisterOpen(true)}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-brand-dark px-5 font-sans text-[12px] font-semibold text-brand-cream shadow-[0_1px_2px_0_rgba(42,31,20,0.04),0_8px_24px_-6px_rgba(42,31,20,0.20)] transition-all duration-150 ease-out hover:scale-[1.02]"
          >
            <Plus className="size-4" aria-hidden />
            {addLabel}
          </button>
        )}
      </div>

      {/* ── Sub-header ────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-baseline gap-2">
        <span className="font-sans text-[12px] font-bold text-text-primary">
          {tab === "ADMINS" ? "Admins" : tab === "ANALYSTS" ? "Analysts" : "Banks"}
        </span>
        <span className="font-sans text-[12px] text-text-muted">
          {totalForTab.toLocaleString()} total
        </span>
      </div>

      {/* ── Active tab's table ────────────────────────────────────── */}
      {tab === "ADMINS" && (
        <StaffMembersTable
          role="ADMIN"
          items={admins.items}
          loadingInitial={admins.loadingInitial}
          loadingMore={admins.loadingMore}
          hasMore={admins.hasMore}
          error={admins.error}
          onLoadMore={admins.loadMore}
          onDeleted={admins.removeItem}
          onUpdated={admins.updateItem}
        />
      )}
      {tab === "ANALYSTS" && (
        <StaffMembersTable
          role="ANALYST"
          items={analysts.items}
          loadingInitial={analysts.loadingInitial}
          loadingMore={analysts.loadingMore}
          hasMore={analysts.hasMore}
          error={analysts.error}
          onLoadMore={analysts.loadMore}
          onDeleted={analysts.removeItem}
          onUpdated={analysts.updateItem}
        />
      )}
      {tab === "BANKS" && (
        <BanksTable
          items={banks.items}
          loadingInitial={banks.loadingInitial}
          loadingMore={banks.loadingMore}
          hasMore={banks.hasMore}
          error={banks.error}
          onLoadMore={banks.loadMore}
          onUpdated={banks.updateItem}
          onReload={banks.reload}
        />
      )}

      {/* ── Create dialogs (admins / analysts only; banks come from CBS) ── */}
      {(tab === "ADMINS" || tab === "ANALYSTS") && (
        <StaffFormDialog
          open={registerOpen}
          mode="create"
          role={tab === "ADMINS" ? "ADMIN" : "ANALYST"}
          onClose={() => setRegisterOpen(false)}
          onSuccess={() => (tab === "ADMINS" ? admins.reload() : analysts.reload())}
        />
      )}
    </div>
  );
}

const TABS: { label: string; value: StaffTab }[] = [
  { label: "Admins", value: "ADMINS" },
  { label: "Analysts", value: "ANALYSTS" },
  { label: "Banks", value: "BANKS" },
];
