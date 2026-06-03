import { Plus, Search, X } from "lucide-react";
import type { ClientStatusFilter } from "../api";

/**
 * Tab definition for the filter pill row. `value === null` is the "All" tab,
 * which sends no `status` param to the backend (it returns all 5 statuses).
 */
interface FilterTab {
  label: string;
  value: ClientStatusFilter;
}

const TABS: FilterTab[] = [
  { label: "All",      value: null },
  { label: "Pending",  value: "PENDING" },
  { label: "Accepted", value: "ACCEPTED" },
  { label: "Active",   value: "ACTIVE" },
  { label: "Blocked",  value: "BLOCKED" },
  { label: "Rejected", value: "REJECTED" },
];

interface ClientsToolbarProps {
  status: ClientStatusFilter;
  onStatusChange: (status: ClientStatusFilter) => void;
  search: string;
  onSearchChange: (value: string) => void;
  /** Called on Enter — committing the draft as the active query. */
  onSearchSubmit: () => void;
  /** Called when the X button is clicked — resets both draft and committed. */
  onSearchClear: () => void;
  onRegisterClick: () => void;
}

export function ClientsToolbar({
  status,
  onStatusChange,
  search,
  onSearchChange,
  onSearchSubmit,
  onSearchClear,
  onRegisterClick,
}: ClientsToolbarProps) {
  return (
    <div className="flex w-full items-center gap-4">
      {/* Filter pills — left, hugs content */}
      <div className="flex shrink-0 items-center gap-1 rounded-full bg-white p-1.5 shadow-[0_1px_2px_0_rgba(42,31,20,0.04),0_8px_24px_-6px_rgba(42,31,20,0.10)]">
        {TABS.map((tab) => {
          const isActive = tab.value === status;
          return (
            <button
              key={tab.label}
              type="button"
              onClick={() => onStatusChange(tab.value)}
              className={[
                "rounded-full px-4 py-1.5 font-sans text-[12px] font-semibold transition-all duration-150 ease-out",
                isActive
                  ? "bg-brand-dark text-brand-cream"
                  : "text-text-muted hover:text-text-primary",
              ].join(" ")}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Spacer */}
      <div className="min-w-0 flex-1" />

      {/* Search — fixed width to match the screenshot. Press Enter to
          search; the X button clears. The list does NOT refetch on every
          keystroke — typing is local until commit. */}
      <div className="relative flex h-10 w-[320px] shrink-0 items-center rounded-full bg-white px-4 shadow-[0_1px_2px_0_rgba(42,31,20,0.04),0_8px_24px_-6px_rgba(42,31,20,0.10)]">
        <Search className="size-4 shrink-0 text-text-muted" aria-hidden />
        <input
          type="text"
          placeholder="Search by CIN, username, or name"
          value={search}
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
        {search && (
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

      {/* Register client — black pill button */}
      <button
        type="button"
        onClick={onRegisterClick}
        className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-brand-dark px-5 font-sans text-[12px] font-semibold text-brand-cream shadow-[0_1px_2px_0_rgba(42,31,20,0.04),0_8px_24px_-6px_rgba(42,31,20,0.20)] transition-all duration-150 ease-out hover:scale-[1.02]"
      >
        <Plus className="size-4" aria-hidden />
        Register client
      </button>
    </div>
  );
}
