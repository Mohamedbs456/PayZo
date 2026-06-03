import { useState } from "react";
import { Search, X } from "lucide-react";
import { useAccountsList } from "@/features/accounts/hooks";
import { AccountsTable } from "@/features/accounts/components/AccountsTable";
import { BankFilterDropdown } from "@/features/accounts/components/BankFilterDropdown";
import { useEnterSearch } from "@/lib/hooks/useEnterSearch";

/**
 * Per-client bank accounts view. Lists every PayZo client (minimal row),
 * filterable by bank — clicking a row expands and reveals the client's CBS
 * accounts pulled from cbs_db. The bank filter is server-side: backend
 * cross-references CBS by bank code to find clients with at least one
 * account in that bank.
 */
export function AccountsPage() {
  const [bank, setBank] = useState<string | null>(null);
  // Press Enter to search; typing alone doesn't refetch.
  const search = useEnterSearch();

  const {
    items,
    totalElements,
    loadingInitial,
    loadingMore,
    hasMore,
    error,
    loadMore,
  } = useAccountsList({ bank, q: search.committed });

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4 p-5 overflow-x-clip">
      {/* page is `overflow-x-clip` (not `overflow-hidden`) so the bank-filter
          dropdown can extend below the toolbar without being clipped. The
          table below uses its own internal scroll, and `<main>` clips the
          vertical extent of this whole page so layout still respects the
          chrome's "nothing scrolls" contract. */}
      {/* ── Toolbar ───────────────────────────────────────────────── */}
      <div className="flex w-full items-center gap-4">
        <BankFilterDropdown value={bank} onChange={setBank} />
        <div className="min-w-0 flex-1" />
        {/* Search — Enter to commit, X / Esc to clear. */}
        <div className="relative flex h-10 w-[320px] shrink-0 items-center rounded-full bg-white px-4 shadow-[0_1px_2px_0_rgba(42,31,20,0.04),0_8px_24px_-6px_rgba(42,31,20,0.10)]">
          <Search className="size-4 shrink-0 text-text-muted" aria-hidden />
          <input
            type="text"
            placeholder="Search by account, bank, or holder"
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
      </div>

      {/* ── Sub-header ────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-baseline gap-2">
        <span className="font-sans text-[12px] font-bold text-text-primary">
          {bank ? `Clients with accounts at ${bank}` : "All clients"}
        </span>
        <span className="font-sans text-[12px] text-text-muted">
          {totalElements.toLocaleString()} {totalElements === 1 ? "result" : "results"}
        </span>
      </div>

      {/* ── Table ─────────────────────────────────────────────────── */}
      <AccountsTable
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
