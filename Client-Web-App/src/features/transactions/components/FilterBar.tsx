import { useEffect, useRef, useState, type ReactNode } from "react";
import { Calendar, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";

export type TypeSegment = "ALL" | "SENT" | "RECEIVED" | "INTERNAL";
export type StatusFilter =
  | "ALL"
  | "APPROVED"
  | "PENDING"
  | "REJECTED"
  | "CANCELLED";
export type PeriodFilter = "today" | "7d" | "30d" | "90d" | "all";
export type OriginFilter = "ALL" | "PAYZO" | "EXTERNAL";

interface FilterBarProps {
  /** Live draft value — what the user is typing right now. */
  qDraft: string;
  /** Update the draft on each keystroke (no refetch yet). */
  onQDraftChange: (q: string) => void;
  /** Commit the current draft as the search query (Enter or icon click). */
  onQCommit: () => void;
  /** Wipe both draft and committed value — fires a refetch with no filter. */
  onQClear: () => void;

  type: TypeSegment;
  onTypeChange: (t: TypeSegment) => void;

  bank: string;
  bankOptions: string[];
  onBankChange: (b: string) => void;

  status: StatusFilter;
  onStatusChange: (s: StatusFilter) => void;

  origin: OriginFilter;
  onOriginChange: (o: OriginFilter) => void;

  period: PeriodFilter;
  onPeriodChange: (p: PeriodFilter) => void;
}

const TYPE_SEGMENTS: { value: TypeSegment; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "SENT", label: "Sent" },
  { value: "RECEIVED", label: "Received" },
  { value: "INTERNAL", label: "Internal" },
];

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "APPROVED", label: "Approved" },
  { value: "PENDING", label: "Pending review" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
];

const ORIGIN_OPTIONS: { value: OriginFilter; label: string }[] = [
  { value: "ALL", label: "All sources" },
  { value: "PAYZO", label: "PayZo only" },
  { value: "EXTERNAL", label: "External" },
];

const PERIOD_OPTIONS: { value: PeriodFilter; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

/**
 * The full filter bar pinned above the list (Figma 207:25). Search +
 * 4-segment type toggle + bank dropdown + status dropdown + date period
 * dropdown — all in one row inside a white card. Filter changes are
 * driven entirely by props so the page can serialize them into URL
 * query params later (B4 / Phase 6).
 */
export function FilterBar({
  qDraft,
  onQDraftChange,
  onQCommit,
  onQClear,
  type,
  onTypeChange,
  bank,
  bankOptions,
  onBankChange,
  status,
  onStatusChange,
  origin,
  onOriginChange,
  period,
  onPeriodChange,
}: FilterBarProps) {
  const periodLabel =
    PERIOD_OPTIONS.find((o) => o.value === period)?.label ?? "Last 30 days";
  const statusLabel =
    STATUS_OPTIONS.find((o) => o.value === status)?.label ?? "All";
  const originLabel =
    ORIGIN_OPTIONS.find((o) => o.value === origin)?.label ?? "All sources";

  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-border-soft bg-surface-card px-6 py-4">
      {/* ── Row 1 — type segments left, search right ─────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="tablist"
          aria-label="Transaction direction"
          className="flex items-stretch gap-1 rounded-[12px] bg-surface-soft p-1"
        >
          {TYPE_SEGMENTS.map((seg) => {
            const active = seg.value === type;
            return (
              <button
                key={seg.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onTypeChange(seg.value)}
                className={cn(
                  "flex h-[34px] items-center justify-center rounded-[8px] px-4 font-sans text-[13px] transition-colors duration-150 ease-out",
                  active
                    ? "bg-surface-card font-semibold text-text-primary shadow-[0px_1px_3px_0px_rgba(0,0,0,0.08)]"
                    : "font-medium text-text-secondary hover:text-text-primary",
                )}
              >
                {seg.label}
              </button>
            );
          })}
        </div>

        {/* Spacer pushes the search to the far right of the row. */}
        <div className="flex-1" />

        <div className="flex h-[42px] min-w-[260px] items-center gap-2.5 rounded-[10px] bg-positive-soft px-4 sm:w-[360px]">
          <Search
            className="size-[18px] shrink-0 text-text-muted"
            strokeWidth={2}
            aria-hidden
          />
          <input
            type="text"
            value={qDraft}
            onChange={(e) => onQDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onQCommit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                onQClear();
              }
            }}
            placeholder="Search by reference, account, or name"
            className="min-w-0 flex-1 bg-transparent font-sans text-[13px] text-text-primary outline-none placeholder:text-text-muted"
          />
          {qDraft && (
            <button
              type="button"
              onClick={onQClear}
              aria-label="Clear search"
              className="flex size-6 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors duration-150 ease-out hover:bg-surface-card hover:text-text-primary"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
      </div>

      {/* ── Row 2 — secondary filters, bottom-left ────────────────────── */}
      <div className="flex flex-wrap items-center gap-2.5">
        <FilterDropdown
          label="Bank"
          value={bank === "ALL" ? "All banks" : bank}
          options={[
            { value: "ALL", label: "All banks" },
            ...bankOptions.map((b) => ({ value: b, label: b })),
          ]}
          onChange={onBankChange}
        />

        <FilterDropdown
          label="Status"
          value={statusLabel}
          options={STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          onChange={(v) => onStatusChange(v as StatusFilter)}
        />

        {/* Origin filter — PayZo-originated vs external bank transactions */}
        <FilterDropdown
          label="Source"
          value={originLabel}
          options={ORIGIN_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          onChange={(v) => onOriginChange(v as OriginFilter)}
        />

        <FilterDropdown
          leading={
            <Calendar
              className="size-4 shrink-0 text-text-secondary"
              strokeWidth={2}
              aria-hidden
            />
          }
          value={periodLabel}
          options={PERIOD_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          onChange={(v) => onPeriodChange(v as PeriodFilter)}
        />
      </div>
    </div>
  );
}

/* ─── Dropdown primitive ──────────────────────────────────────────────── */

function FilterDropdown({
  label,
  leading,
  value,
  options,
  onChange,
}: {
  label?: string;
  leading?: ReactNode;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex h-[42px] items-center justify-center gap-2 rounded-[10px] border border-border-soft bg-surface-card pl-[14px] pr-3 transition-colors duration-150 ease-out hover:bg-surface-soft"
      >
        {leading}
        {label && (
          <span className="font-sans text-[13px] font-semibold text-text-secondary">
            {label}
          </span>
        )}
        <span className="font-sans text-[13px] font-bold text-text-primary">
          {value}
        </span>
        <ChevronDown
          className={cn(
            "size-3.5 text-text-secondary transition-transform duration-150 ease-out",
            open && "rotate-180",
          )}
          strokeWidth={2.4}
          aria-hidden
        />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute right-0 top-full z-20 mt-1.5 min-w-[200px] overflow-hidden rounded-[10px] border border-border-soft bg-surface-card shadow-[0px_8px_24px_0px_rgba(14,27,44,0.12)]"
        >
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className="flex w-full items-center px-4 py-2.5 text-left font-sans text-[13px] font-medium text-text-secondary transition-colors duration-150 ease-out hover:bg-surface-soft hover:text-text-primary"
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
