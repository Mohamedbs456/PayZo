import { useMemo, useRef, useState } from "react";
import { Card } from "@/features/dashboard/components/Card";
import { useDashboard, useTodayHourlyByBank } from "@/features/dashboard/hooks";
import { chartColorFor } from "@/features/dashboard/palette";
import type { DashboardPeriod } from "@/features/dashboard/api";
import { cn } from "@/lib/cn";

/* ─── Period tabs ─────────────────────────────────────────────────────── */

/** What kind of x-axis ticks the tab wants. */
type XAxisMode = "hours" | "days" | "months" | "none";

interface PeriodTab {
  label: string;
  value: DashboardPeriod;
  /** Drives the x-axis labels independently from the backend `period`. */
  xAxis: XAxisMode;
}

const PERIOD_TABS: PeriodTab[] = [
  { label: "1D", value: "today", xAxis: "hours" },
  { label: "30D", value: "30d", xAxis: "days" },
  // 1Y and ALL temporarily map to the backend's widest available window
  // (90d) — `period=all` is broken server-side (PeriodUtils returns null
  // and the dashboard service short-circuits to an empty flow list).
  // See DEFERRED.md D4.
  { label: "1Y", value: "90d", xAxis: "months" },
  { label: "ALL", value: "90d", xAxis: "none" },
];

/* ─── Card 4 ──────────────────────────────────────────────────────────── */

/**
 * Card 4 — Money sent per bank. Multi-line chart of TND moved per bank
 * over the selected period. Hand-rolled SVG (one smooth cubic-Bezier path
 * per bank) so the same approach as the pie/bars works here too.
 *
 * Hover: not yet wired — design pending (see the chat for options).
 *
 * Source: GET /api/v1/superadmin/dashboard?period=…
 *         → moneyFlowPerBankOverTime: [{ date, bankCode, totalAmount }]
 */
interface MoneyPerBankCardProps {
  className?: string;
  /** Bank to render. Null falls back to whichever bank reads first. */
  selectedBank?: string | null;
}

export function MoneyPerBankCard({ className, selectedBank }: MoneyPerBankCardProps) {
  const [activeIndex, setActiveIndex] = useState(1); // 30D default
  const tab = PERIOD_TABS[activeIndex];
  const isHourly = tab.xAxis === "hours";

  // Two data sources, used mutually exclusively. The unused one is still
  // mounted but won't fetch until first render — its initial state is
  // loading=true with no network call until the effect runs. Gate the
  // chart's loading/error on whichever source is active for this tab.
  const dashboardQ = useDashboard(tab.value);
  const hourlyQ = useTodayHourlyByBank();

  const loading = isHourly ? hourlyQ.loading : dashboardQ.loading;
  const error = isHourly ? hourlyQ.error : dashboardQ.error;
  const retry = isHourly ? hourlyQ.retry : dashboardQ.retry;

  // Group flow points by bank — keep ALL banks here (drives the legend
  // chip below), filter to the chosen one further down for the chart.
  const allSeries = useMemo(() => {
    if (isHourly) {
      return (hourlyQ.data ?? []).map((s) => ({
        bankCode: s.bankCode,
        points: s.points.slice(),
      }));
    }
    const flows = dashboardQ.data?.moneyFlowPerBankOverTime ?? [];
    const grouped = new Map<string, { date: string; amount: number }[]>();
    for (const f of flows) {
      const arr = grouped.get(f.bankCode) ?? [];
      arr.push({ date: f.date, amount: parseFloat(f.totalAmount) });
      grouped.set(f.bankCode, arr);
    }
    return Array.from(grouped.entries()).map(([bankCode, points]) => ({
      bankCode,
      points: points.sort((a, b) => a.date.localeCompare(b.date)),
    }));
  }, [isHourly, hourlyQ.data, dashboardQ.data]);

  // Resolve the bank actually rendered. If the explicit selection isn't
  // present in the period's data (e.g. a brand-new bank with no flows
  // in the last 30d), fall back to the first available bank so the chart
  // never goes blank when something IS available to show.
  const renderedBank: string | null =
    selectedBank && allSeries.some((s) => s.bankCode === selectedBank)
      ? selectedBank
      : (allSeries[0]?.bankCode ?? null);

  const series = useMemo(
    () =>
      renderedBank
        ? allSeries.filter((s) => s.bankCode === renderedBank)
        : [],
    [allSeries, renderedBank],
  );

  // Compute scales.
  const scale = useMemo(() => {
    if (series.length === 0) return null;
    const allAmounts = series.flatMap((s) => s.points.map((p) => p.amount));
    if (allAmounts.length === 0) return null;
    const yMax = niceCeil(Math.max(...allAmounts));

    // Hourly mode: pin the x-axis to a FULL 24-hour day (midnight today
    // → midnight tomorrow). Range = 24h so tick `04:00` lands at exactly
    // 4/24 of the chart width (and similarly for every other tick).
    if (isHourly) {
      const sample = series[0]?.points[0]?.date ?? new Date().toISOString();
      const isoDay = sample.substring(0, 10);
      const [yyyy, mm, dd] = isoDay.split("-").map(Number);
      const next = new Date(yyyy, mm - 1, dd);
      next.setDate(next.getDate() + 1);
      const nextDay = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
      return {
        yMax,
        dateMin: `${isoDay}T00:00:00`,
        dateMax: `${nextDay}T00:00:00`,
      };
    }

    const allDates = series.flatMap((s) => s.points.map((p) => p.date));
    if (allDates.length === 0) return null;
    const dateMin = allDates.reduce((a, b) => (a < b ? a : b));
    const dateMax = allDates.reduce((a, b) => (a > b ? a : b));
    return { yMax, dateMin, dateMax };
  }, [series, isHourly]);

  return (
    <Card
      to="/transactions"
      className={cn(
        "col-span-2 flex flex-col gap-3 px-[22px] py-[18px]",
        className,
      )}
    >
      {/* Header */}
      <div className="flex w-full shrink-0 items-start gap-3 overflow-hidden">
        <div className="flex min-w-0 flex-col gap-0.5 overflow-hidden whitespace-nowrap leading-none">
          <div className="flex items-center gap-2">
            <p className="truncate font-sans text-[14px] font-bold text-text-primary">
              Money sent per bank
            </p>
            {renderedBank && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-brand-cream/70 px-2 py-0.5 font-sans text-[10px] font-bold uppercase tracking-[0.6px] text-text-primary ring-1 ring-inset ring-brand-cream-2"
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: chartColorFor(renderedBank) }}
                  aria-hidden
                />
                {renderedBank}
              </span>
            )}
          </div>
          <p className="truncate font-sans text-[11px] text-text-muted">
            {selectedBank
              ? `TND moved · pinned via the donut`
              : `TND moved · click a slice on the donut to switch bank`}
          </p>
        </div>
        <div className="ml-auto shrink-0" onClick={(e) => e.stopPropagation()}>
          <PeriodSwitcher
            tabs={PERIOD_TABS.map((t) => t.label)}
            activeIndex={activeIndex}
            onSelect={setActiveIndex}
          />
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <ChartSkeleton />
      ) : error ? (
        <ErrorState onRetry={retry} />
      ) : !scale || series.length === 0 ? (
        <EmptyState />
      ) : (
        <ChartFrame series={series} scale={scale} xAxis={tab.xAxis} />
      )}
    </Card>
  );
}

/* ─── Chart frame: y-axis + plot + x-axis ─────────────────────────────── */

interface BankSeries {
  bankCode: string;
  points: { date: string; amount: number }[];
}

interface Scale {
  yMax: number;
  dateMin: string;
  dateMax: string;
}

function ChartFrame({
  series,
  scale,
  xAxis,
}: {
  series: BankSeries[];
  scale: Scale;
  xAxis: XAxisMode;
}) {
  const yLabels = [scale.yMax, scale.yMax / 2, 0].map(formatTndShort);
  const xTicks = buildXTicks(xAxis, scale);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-1.5 overflow-hidden">
      <div className="flex min-h-0 w-full flex-1 gap-2 overflow-hidden">
        <YAxis labels={yLabels} />
        <PlotArea series={series} scale={scale} xAxis={xAxis} />
      </div>
      {xTicks.length > 0 && <XAxis ticks={xTicks} />}
    </div>
  );
}

function YAxis({ labels }: { labels: string[] }) {
  return (
    <div className="flex shrink-0 flex-col justify-between py-1 pr-1 text-right font-sans text-[9px] font-medium text-text-muted">
      {labels.map((l, i) => (
        <span key={i} className="whitespace-nowrap leading-none">
          {l}
        </span>
      ))}
    </div>
  );
}

interface XTick {
  label: string;
  /** 0..100 — distance from the left edge of the plot. */
  percent: number;
}

function XAxis({ ticks }: { ticks: XTick[] }) {
  return (
    <div className="relative h-[14px] shrink-0 pl-[34px] font-sans text-[10px] font-medium text-text-muted">
      <div className="relative h-full w-full">
        {ticks.map((t) => {
          // Anchor first tick to its left edge, last tick to its right edge,
          // and centre everything in between — keeps text within the plot.
          const isFirst = t.percent <= 0.001;
          const isLast = t.percent >= 99.999;
          const transform = isFirst
            ? "translateX(0)"
            : isLast
              ? "translateX(-100%)"
              : "translateX(-50%)";
          return (
            <span
              key={t.label}
              className="absolute top-0 whitespace-nowrap"
              style={{ left: `${t.percent}%`, transform }}
            >
              {t.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

interface HoverState {
  date: string;
  /** Snapped x as a percent (0..100) of the plot width. */
  xPercent: number;
  /** Was the cursor in the right half? Drives tooltip flip. */
  rightHalf: boolean;
}

function PlotArea({
  series,
  scale,
  xAxis,
}: {
  series: BankSeries[];
  scale: Scale;
  xAxis: XAxisMode;
}) {
  const plotRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);

  const minT = Date.parse(scale.dateMin);
  const maxT = Date.parse(scale.dateMax);
  const range = maxT - minT || 1;
  // True when the period collapsed to a single date (e.g. 1D — backend
  // aggregates by LocalDate so today returns one row per bank). Used to
  // switch the layout to a "dot per bank, fanned out" view.
  const singleDate = maxT === minT;

  // Unified, sorted list of unique dates across all banks — defines the
  // snap grid for the scrubber. Cached because mousemove fires often.
  const uniqueDates = useMemo(() => {
    const set = new Set<string>();
    for (const s of series) for (const p of s.points) set.add(p.date);
    return Array.from(set).sort();
  }, [series]);

  // For each date → map of bankCode → amount. O(1) lookup per bank in the
  // tooltip, instead of scanning each bank's points on every mouse move.
  const amountsByDate = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const s of series) {
      for (const p of s.points) {
        let inner = map.get(p.date);
        if (!inner) {
          inner = new Map();
          map.set(p.date, inner);
        }
        inner.set(s.bankCode, p.amount);
      }
    }
    return map;
  }, [series]);

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const node = plotRef.current;
    if (!node || uniqueDates.length === 0) return;
    const rect = node.getBoundingClientRect();
    if (rect.width === 0) return;

    const xPx = e.clientX - rect.left;
    const xRatio = Math.max(0, Math.min(1, xPx / rect.width));
    const targetT = minT + xRatio * range;

    // Snap to nearest unique date (binary search would be nicer but
    // uniqueDates is small — a few dozen at most).
    let nearest = uniqueDates[0];
    let nearestDelta = Math.abs(Date.parse(nearest) - targetT);
    for (const d of uniqueDates) {
      const delta = Math.abs(Date.parse(d) - targetT);
      if (delta < nearestDelta) {
        nearest = d;
        nearestDelta = delta;
      }
    }

    const snapPercent = singleDate
      ? 50
      : ((Date.parse(nearest) - minT) / range) * 100;
    setHover({
      date: nearest,
      xPercent: snapPercent,
      rightHalf: xPx > rect.width / 2,
    });
  }

  // Pre-compute hover-time data for the tooltip + dots when a date is active.
  const hoverEntries = useMemo(() => {
    if (!hover) return [];
    const inner = amountsByDate.get(hover.date);
    if (!inner) return [];
    const list = Array.from(inner.entries()).map(([bankCode, amount]) => ({
      bankCode,
      amount,
      yPercent: 100 - (amount / Math.max(scale.yMax, 1)) * 100,
    }));
    list.sort((a, b) => b.amount - a.amount);
    return list;
  }, [hover, amountsByDate, scale.yMax]);

  return (
    <div
      ref={plotRef}
      className="relative min-h-0 min-w-0 flex-1"
      onMouseMove={onMouseMove}
      onMouseLeave={() => setHover(null)}
    >
      {/* Gridlines (top, mid, bottom) — match Y axis labels. */}
      <span className="pointer-events-none absolute left-0 right-0 top-0 h-px bg-brand-cream-2/70" />
      <span className="pointer-events-none absolute left-0 right-0 top-1/2 h-px bg-brand-cream-2/70" />
      <span className="pointer-events-none absolute left-0 right-0 bottom-0 h-px bg-brand-cream-2/70" />

      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="block h-full w-full"
        role="img"
        aria-label="Money sent per bank over time"
      >
        {series.map((s, idx) => {
          if (s.points.length === 0) return null;
          // Single point: a moveto-only path is invisible. Render a dot
          // instead so a sparse period (e.g. 1D) still shows the value.
          if (s.points.length === 1) {
            const t = Date.parse(s.points[0].date);
            const cx = singleDate
              ? 12 + (idx * 76) / Math.max(series.length - 1, 1)
              : ((t - minT) / range) * 100;
            const cy =
              100 -
              (s.points[0].amount / Math.max(scale.yMax, 1)) * 100;
            return (
              <circle
                key={s.bankCode}
                cx={cx}
                cy={cy}
                r={2.3}
                fill={chartColorFor(s.bankCode)}
                stroke="#ffffff"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            );
          }
          const d = smoothPath(s.points, minT, maxT, scale.yMax);
          if (!d) return null;
          return (
            <path
              key={s.bankCode}
              d={d}
              stroke={chartColorFor(s.bankCode)}
              // Thicker stroke + a faint dark shadow so the pale palette
              // colors (cream / pale yellow / pale teal / pale mint) keep
              // similar visual weight to filled pie/donut wedges.
              strokeWidth={2.8}
              fill="none"
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                filter: "drop-shadow(0 0.5px 0.5px rgba(42,31,20,0.18))",
              }}
            />
          );
        })}
      </svg>

      {/* Vertical scrubber line + per-bank dots. Rendered as HTML so they
          stay perfectly circular regardless of preserveAspectRatio="none". */}
      {hover && (
        <>
          {/* Vertical guide line. Hidden in single-date mode (1D) — there's
              nothing meaningful to "scrub through" when every bank has the
              same single x-coordinate. */}
          {!singleDate && (
            <div
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-text-muted/40"
              style={{ left: `${hover.xPercent}%` }}
            />
          )}
          {/* Per-curve highlight dots — also hidden in single-date mode
              (the chart already shows fanned-out dots for each bank). */}
          {!singleDate &&
            hoverEntries.map((entry) => (
              <span
                key={entry.bankCode}
                className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
                style={{
                  left: `${hover.xPercent}%`,
                  top: `${entry.yPercent}%`,
                  boxShadow: `0 0 0 1.5px ${chartColorFor(entry.bankCode)}`,
                }}
              />
            ))}
          <ScrubberTooltip hover={hover} entries={hoverEntries} xAxis={xAxis} />
        </>
      )}
    </div>
  );
}

function ScrubberTooltip({
  hover,
  entries,
  xAxis,
}: {
  hover: HoverState;
  entries: { bankCode: string; amount: number }[];
  xAxis: XAxisMode;
}) {
  const useTwoCols = entries.length > 7;
  // Position: 12px to the right of the scrubber, or 12px to the left if
  // the cursor is past the midpoint (tooltip otherwise overflows the card).
  const positionStyle: React.CSSProperties = hover.rightHalf
    ? { right: `calc(100% - ${hover.xPercent}% + 12px)` }
    : { left: `calc(${hover.xPercent}% + 12px)` };

  return (
    <div
      className="pointer-events-none absolute top-1 z-10 rounded-lg border border-brand-cream-2 bg-white px-2.5 py-2 shadow-[0_4px_12px_rgba(42,31,20,0.12)]"
      style={positionStyle}
    >
      <p className="mb-1.5 whitespace-nowrap font-sans text-[10px] font-bold tracking-[0.6px] text-text-muted">
        {xAxis === "hours"
          ? formatHourLabel(hover.date)
          : formatDateLong(hover.date)}
      </p>
      <div
        className={cn(
          "grid gap-x-3 gap-y-0.5",
          useTwoCols ? "grid-cols-2" : "grid-cols-1",
        )}
      >
        {entries.map((e) => (
          <div
            key={e.bankCode}
            className="flex items-center gap-1.5 whitespace-nowrap"
          >
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: chartColorFor(e.bankCode) }}
            />
            <span className="font-sans text-[10px] font-semibold text-text-primary">
              {e.bankCode}
            </span>
            <span className="ml-auto pl-2 font-mono text-[10px] font-semibold text-text-primary">
              {formatTndShort(e.amount)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Period switcher ────────────────────────────────────────────────── */

function PeriodSwitcher({
  tabs,
  activeIndex,
  onSelect,
}: {
  tabs: string[];
  activeIndex: number;
  onSelect: (i: number) => void;
}) {
  return (
    <div className="flex shrink-0 items-center overflow-hidden rounded-[10px] bg-brand-cream p-[3px]">
      {tabs.map((label, i) => {
        const isActive = i === activeIndex;
        return (
          <button
            key={label}
            type="button"
            onClick={() => onSelect(i)}
            className={cn(
              "flex items-center overflow-hidden rounded-lg px-3 py-1.5 transition-colors duration-150 ease-out",
              isActive ? "bg-white shadow-sm" : "hover:bg-white/60",
            )}
          >
            <span
              className={cn(
                "whitespace-nowrap font-sans text-[11px]",
                isActive
                  ? "font-semibold text-text-primary"
                  : "font-medium text-text-muted",
              )}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ─── States ─────────────────────────────────────────────────────────── */

function ChartSkeleton() {
  return (
    <div className="flex min-h-0 w-full flex-1 items-end gap-2 overflow-hidden">
      <div className="h-full w-full animate-pulse rounded-md bg-brand-cream-2/60" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-0 w-full flex-1 items-center justify-center">
      <p className="font-sans text-[12px] text-text-muted">
        No transactions in this period yet.
      </p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-0 w-full flex-1 items-center justify-center gap-2">
      <p className="font-sans text-[11px] text-text-muted">Couldn't load.</p>
      <button
        type="button"
        onClick={onRetry}
        className="font-sans text-[11px] font-semibold text-brand-medium transition-transform duration-150 ease-out hover:translate-x-0.5"
      >
        Retry →
      </button>
    </div>
  );
}

/* ─── Helpers ────────────────────────────────────────────────────────── */

/**
 * Round up to a "nice" y-axis ceiling. Finer steps than the classic
 * 1/2/5 progression — keeps the curves from looking squished when the
 * data max sits in an awkward spot (e.g. 23K used to snap up to 50K).
 */
function niceCeil(value: number): number {
  if (value <= 0) return 100;
  const mag = Math.pow(10, Math.floor(Math.log10(value)));
  const norm = value / mag;
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  for (const s of steps) if (norm <= s) return s * mag;
  return 10 * mag;
}

/**
 * Compact TND label for axis ticks. Renders one decimal when the value
 * isn't a whole K/M (e.g. yMax/2 of 25K → "12.5K", not "13K").
 */
function formatTndShort(n: number): string {
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const v = n / 1_000_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    const v = n / 1_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}K`;
  }
  return `${Math.round(n)}`;
}

/**
 * Picks x-axis ticks per tab. Each tick carries its own percent-x so the
 * label sits at the chart position it actually represents (e.g. "04:00"
 * lands at 4/24 of the plot width, not at the 20% slot you'd get from
 * evenly-spreading 6 labels).
 *
 * For `days`, ticks are spread proportionally across the data range. For
 * `months`, ticks are decorative (Jan..Dec evenly) — the curves don't
 * actually align with calendar months given our 90-day window.
 */
function buildXTicks(mode: XAxisMode, scale: Scale): XTick[] {
  switch (mode) {
    case "hours": {
      // Six ticks every 4 hours, positioned at exactly hour/24 of width.
      return [0, 4, 8, 12, 16, 20].map((h) => ({
        label: `${String(h).padStart(2, "0")}:00`,
        percent: (h / 24) * 100,
      }));
    }
    case "days": {
      const labels = pickDateLabels(scale.dateMin, scale.dateMax, 6);
      const min = Date.parse(scale.dateMin);
      const max = Date.parse(scale.dateMax);
      const range = max - min || 1;
      return labels.map((label, i) => {
        // Reverse-engineer the timestamp `pickDateLabels` produced so the
        // tick lands at its actual time-percentage on the curve.
        const t = min + ((max - min) * i) / Math.max(labels.length - 1, 1);
        return { label, percent: ((t - min) / range) * 100 };
      });
    }
    case "months": {
      // First-of-month boundaries that actually fall inside the data
      // range, positioned at their real percentage. Hover dates and tick
      // labels stay in sync — e.g. "Apr" sits exactly where Apr 1 maps
      // on the curve.
      const min = Date.parse(scale.dateMin);
      const max = Date.parse(scale.dateMax);
      if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
        return [];
      }
      const range = max - min;
      const ticks: XTick[] = [];
      const start = new Date(min);
      // Walk first-of-month from the month AFTER the range start.
      let cursor = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      while (cursor.getTime() <= max) {
        ticks.push({
          label: cursor.toLocaleDateString("en-US", { month: "short" }),
          percent: ((cursor.getTime() - min) / range) * 100,
        });
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      }
      return ticks;
    }
    case "none":
      return [];
  }
}

function pickDateLabels(dateMin: string, dateMax: string, count: number): string[] {
  const min = Date.parse(dateMin);
  const max = Date.parse(dateMax);
  if (!Number.isFinite(min) || !Number.isFinite(max) || count <= 1) {
    return [formatDate(min), formatDate(max)];
  }
  const labels: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = min + ((max - min) * i) / (count - 1);
    labels.push(formatDate(t));
  }
  return labels;
}

function formatDate(t: number): string {
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Time-only label for the 1D scrubber header — e.g. "14:00". The synthetic
 *  ISO date strings produced by `useTodayHourlyByBank` carry the hour as
 *  the only meaningful piece, so we render that. */
function formatHourLabel(s: string): string {
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return s;
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:00`;
}

/** Long-form date for the scrubber tooltip header (e.g. "Apr 18, 2026"). */
function formatDateLong(s: string): string {
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return s;
  return new Date(t).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Build a smooth path through all data points using a Catmull-Rom spline
 * converted to cubic Bezier segments. Passes through every point without
 * overshooting — the previous heuristic (S-curves with midpoint-x control
 * points) created exaggerated waves with sparse data (e.g. 4 points across
 * 24h in 1D mode).
 *
 * Coordinates are in the SVG viewBox space (0..100 for both x and y), so
 * preserveAspectRatio="none" can stretch the path to any container size
 * while vectorEffect="non-scaling-stroke" keeps the stroke crisp.
 */
function smoothPath(
  points: { date: string; amount: number }[],
  minT: number,
  maxT: number,
  yMax: number,
): string {
  if (points.length === 0) return "";
  const range = maxT - minT || 1;

  const coords = points.map((p) => {
    const t = Date.parse(p.date);
    const x = ((t - minT) / range) * 100;
    const y = 100 - (p.amount / Math.max(yMax, 1)) * 100;
    return [x, y] as const;
  });

  if (coords.length === 1) {
    const [x, y] = coords[0];
    return `M ${x} ${y}`;
  }

  // Catmull-Rom (centripetal-ish, /6 baked-in tension) → cubic Bezier.
  // For each segment from P1→P2, control points pull toward neighbors:
  //   cp1 = P1 + (P2 - P0)/6
  //   cp2 = P2 - (P3 - P1)/6
  // At the boundaries, fall back to the segment's own endpoints so the
  // first/last tangent is "natural" (no phantom neighbor pulling it).
  let d = `M ${coords[0][0]} ${coords[0][1]}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i - 1] ?? coords[i];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2] ?? p2;
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}
