import { useEffect, useRef, useState, type ReactNode } from "react";
import { Calendar, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export type AlertStatusSegment =
  | "ALL"
  | "PENDING_ANALYST"
  | "APPROVED"
  | "REJECTED";
export type RiskFilter = "ALL" | "HIGH" | "MED" | "LOW";
export type AmountBucket = "ALL" | "0-1000" | "1000-5000" | "5000-10000" | "10000+";
export type PeriodFilter = "today" | "7d" | "30d" | "90d" | "all";

interface AlertsFilterBarProps {
  status: AlertStatusSegment;
  onStatusChange: (s: AlertStatusSegment) => void;

  bank: string;
  bankOptions: string[];
  onBankChange: (b: string) => void;

  risk: RiskFilter;
  onRiskChange: (r: RiskFilter) => void;

  amount: AmountBucket;
  onAmountChange: (a: AmountBucket) => void;

  period: PeriodFilter;
  onPeriodChange: (p: PeriodFilter) => void;
}

const STATUS_SEGMENTS: { value: AlertStatusSegment; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PENDING_ANALYST", label: "Awaiting review" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];

const RISK_OPTIONS: { value: RiskFilter; label: string }[] = [
  { value: "ALL", label: "All levels" },
  { value: "HIGH", label: "High" },
  { value: "MED", label: "Medium" },
  { value: "LOW", label: "Low" },
];

const AMOUNT_OPTIONS: { value: AmountBucket; label: string }[] = [
  { value: "ALL", label: "Any" },
  { value: "0-1000", label: "Under 1,000 TND" },
  { value: "1000-5000", label: "1,000 – 5,000 TND" },
  { value: "5000-10000", label: "5,000 – 10,000 TND" },
  { value: "10000+", label: "Over 10,000 TND" },
];

const PERIOD_OPTIONS: { value: PeriodFilter; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

/**
 * Filter bar pinned above the alerts list (Figma 208:35). Status segment
 * toggle uses the dark "All" pill on the active segment, matching the
 * Figma's accent-default fill (rest of the segments stay muted).
 */
export function AlertsFilterBar({
  status,
  onStatusChange,
  bank,
  bankOptions,
  onBankChange,
  risk,
  onRiskChange,
  amount,
  onAmountChange,
  period,
  onPeriodChange,
}: AlertsFilterBarProps) {
  const periodLabel =
    PERIOD_OPTIONS.find((o) => o.value === period)?.label ?? "Last 90 days";
  const riskLabel =
    RISK_OPTIONS.find((o) => o.value === risk)?.label ?? "All levels";
  const amountLabel =
    AMOUNT_OPTIONS.find((o) => o.value === amount)?.label ?? "Any";

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-border-soft bg-surface-card px-6 py-3.5">
      {/* Status segmented toggle — dark "active" pill per Figma */}
      <div
        role="tablist"
        aria-label="Alert status"
        className="flex items-stretch gap-1 rounded-[12px] bg-surface-soft p-1"
      >
        {STATUS_SEGMENTS.map((seg) => {
          const active = seg.value === status;
          return (
            <button
              key={seg.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onStatusChange(seg.value)}
              className={cn(
                "flex h-[34px] items-center justify-center rounded-[8px] px-[14px] font-sans text-[13px] transition-colors duration-150 ease-out",
                active
                  ? "bg-accent font-semibold text-accent-foreground"
                  : "font-medium text-text-secondary hover:text-text-primary",
              )}
            >
              {seg.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
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
          label="Risk"
          value={riskLabel}
          options={RISK_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          onChange={(v) => onRiskChange(v as RiskFilter)}
        />
        <FilterDropdown
          label="Amount"
          value={amountLabel}
          options={AMOUNT_OPTIONS.map((o) => ({
            value: o.value,
            label: o.label,
          }))}
          onChange={(v) => onAmountChange(v as AmountBucket)}
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
          options={PERIOD_OPTIONS.map((o) => ({
            value: o.value,
            label: o.label,
          }))}
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
