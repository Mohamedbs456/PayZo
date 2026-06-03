import { Link } from "react-router-dom";
import { Card, CardHeader } from "@/features/dashboard/components/Card";
import { useStaffCounts } from "@/features/dashboard/hooks";
import type { DashboardPeriod } from "@/features/dashboard/api";
import { STAFF_BAR_COLORS } from "@/features/dashboard/palette";

interface BarDatum {
  name: string;
  value: number;
  color: string;
  /** Where clicking this bar takes the user. */
  to: string;
}

/**
 * Card 1 — STAFF. Three vertical bars (Admins / Analysts / Banks).
 * Hovering a bar shows its count floating above the bar's top edge.
 *
 * Layout: pure CSS. Each column has a relative drawing area (`flex-1`)
 * with the bar absolutely positioned at the bottom. The value floats in
 * the same drawing area at `bottom: calc(barHeight% + 4px)`, so it
 * tracks the bar's top exactly — when the bar is short, the value is
 * low; when tall, high. No SVG, no ResizeObserver, no chart library.
 */
export function StaffCard({ period }: { period: DashboardPeriod }) {
  const { data, loading, error, retry } = useStaffCounts(period);

  const bars: BarDatum[] = [
    {
      name: "ADMINS",
      value: data?.admins ?? 0,
      color: STAFF_BAR_COLORS.admins,
      to: "/staff-management?tab=admins",
    },
    {
      name: "ANALYSTS",
      value: data?.analysts ?? 0,
      color: STAFF_BAR_COLORS.analysts,
      to: "/staff-management?tab=analysts",
    },
    {
      name: "BANKS",
      value: data?.banks ?? 0,
      color: STAFF_BAR_COLORS.banks,
      to: "/staff-management?tab=banks",
    },
  ];

  return (
    <Card className="px-[22px] py-[18px]">
      <CardHeader title="STAFF" />
      <div className="mt-2 min-h-0 flex-1">
        {loading ? (
          <BarsSkeleton />
        ) : error ? (
          <ErrorState onRetry={retry} />
        ) : (
          <BarChart bars={bars} />
        )}
      </div>
    </Card>
  );
}

function BarChart({ bars }: { bars: BarDatum[] }) {
  // Anchor the tallest bar at 95% of the drawing area so the floating
  // value still has 5% headroom — prevents the value from being clipped
  // when the max-value bar is hovered.
  const max = Math.max(...bars.map((b) => b.value), 1);
  const TOP_RATIO = 0.95;

  return (
    <div className="flex h-full w-full gap-3">
      {bars.map((b) => {
        const ratio = b.value === 0 ? 0 : (b.value / max) * TOP_RATIO;
        return (
          <BarColumn
            key={b.name}
            name={b.name}
            value={b.value}
            color={b.color}
            ratio={ratio}
            to={b.to}
          />
        );
      })}
    </div>
  );
}

function BarColumn({
  name,
  value,
  color,
  ratio,
  to,
}: {
  name: string;
  value: number;
  color: string;
  ratio: number;
  to: string;
}) {
  const heightPercent = `${ratio * 100}%`;
  // Each bar is its own link — the StaffCard itself isn't navigable, so
  // clicks on individual bars are how the user jumps to a specific tab.
  // The grow-on-hover affordance + the floating value chip both kick in
  // on the column's hover state.
  return (
    <Link
      to={to}
      className="group flex h-full min-w-0 flex-1 flex-col items-center gap-1.5 rounded-md transition-all duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-dark/30"
      aria-label={`${name}: ${value}`}
    >
      <div className="relative w-full min-h-0 flex-1">
        <div
          className="absolute bottom-0 left-1/2 w-[68%] max-w-[72px] -translate-x-1/2 rounded-t-md transition-all duration-150 ease-out group-hover:scale-[1.04] group-hover:shadow-[0_4px_12px_-4px_rgba(42,31,20,0.30)]"
          style={{
            height: heightPercent,
            backgroundColor: color,
            minHeight: value > 0 ? 2 : 0,
            cursor: "pointer",
            transformOrigin: "bottom center",
          }}
        />
        <div
          className="pointer-events-none absolute left-0 right-0 text-center font-sans text-[12px] font-bold leading-none text-text-primary opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100"
          style={{ bottom: `calc(${heightPercent} + 4px)` }}
        >
          {value.toLocaleString()}
        </div>
      </div>
      <span className="shrink-0 whitespace-nowrap font-sans text-[10px] font-bold tracking-[1.4px] text-text-faint transition-colors duration-150 group-hover:text-text-primary">
        {name}
      </span>
    </Link>
  );
}

function BarsSkeleton() {
  const ratios = [0.72, 0.44, 0.58];
  const labels = ["ADMINS", "ANALYSTS", "BANKS"];
  return (
    <div className="flex h-full w-full gap-3">
      {ratios.map((r, i) => (
        <div
          key={i}
          className="flex h-full min-w-0 flex-1 flex-col items-center gap-1.5"
        >
          <div className="relative w-full min-h-0 flex-1">
            <div
              className="absolute bottom-0 left-1/2 w-[68%] max-w-[72px] -translate-x-1/2 animate-pulse rounded-t-md bg-brand-cream-2"
              style={{ height: `${r * 100}%` }}
            />
          </div>
          <span className="font-sans text-[10px] font-bold tracking-[1.4px] text-text-faint">
            {labels[i]}
          </span>
        </div>
      ))}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2">
      <p className="font-sans text-[11px] font-medium text-text-muted">
        Couldn't load staff counts.
      </p>
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
