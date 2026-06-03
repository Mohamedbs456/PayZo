import { useState } from "react";
import { cn } from "@/lib/cn";

export interface BankBucket {
  bankCode: string;
  total: number;
  accountCount: number;
}

interface BankBalanceBarChartProps {
  buckets: BankBucket[];
  selectedBank: string | null;
  onSelect: (bankCode: string) => void;
}

/**
 * "BY BANK" bar chart (Figma 120:14). One bar per bank, height
 * proportional to that bank's total. Selected bar = accent navy;
 * non-selected with significant balance = mid blue; sub-25%-of-max
 * bars = light blue (so the smallest bank visually recedes). Hovering
 * shows the amount in a small chip above the bar; clicking selects
 * the bank, which drives the donut chart on the right.
 *
 * SVG-based with `viewBox` so it scales responsively inside any
 * fixed-aspect parent. Y axis is auto-stepped to multiples of 1,500
 * up to a clean ceiling.
 */
export function BankBalanceBarChart({
  buckets,
  selectedBank,
  onSelect,
}: BankBalanceBarChartProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  const maxValue = Math.max(...buckets.map((b) => b.total), 1);
  // Auto-step the axis so we always get ~5–6 readable labels regardless
  // of whether the tallest bar is 58 TND or 580 000 TND. The previous
  // hardcoded step=1500 produced dozens of overlapping labels for any
  // balance range that wasn't ~7k–15k TND.
  const step = pickNiceStep(maxValue, 5);
  const yMax = niceCeiling(maxValue, step);
  const ticks = stepTicks(0, yMax, step);

  // SVG layout — viewBox is 720×320 to mirror Figma; the actual render
  // size comes from CSS on the wrapping element.
  const W = 720;
  const H = 320;
  const PAD_L = 60;
  const PAD_T = 40;
  const PAD_B = 60;
  const PLOT_W = W - PAD_L - 40;
  const PLOT_H = H - PAD_T - PAD_B;

  const slotW = PLOT_W / Math.max(buckets.length, 1);
  const barW = Math.min(100, slotW - 30);

  function barX(i: number) {
    return PAD_L + slotW * i + (slotW - barW) / 2;
  }
  function barH(value: number) {
    return (value / yMax) * PLOT_H;
  }
  function barY(value: number) {
    return PAD_T + PLOT_H - barH(value);
  }
  function tickY(value: number) {
    return PAD_T + PLOT_H - (value / yMax) * PLOT_H;
  }

  return (
    <div className="relative h-full w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-full w-full"
        preserveAspectRatio="none"
      >
        {/* Section eyebrow */}
        <text
          x={20}
          y={22}
          className="fill-text-muted font-sans text-[13px] font-semibold uppercase"
          style={{ letterSpacing: "0.08em" }}
        >
          BY BANK
        </text>

        {/* Y-axis ticks + grid lines */}
        {ticks.map((t) => {
          const y = tickY(t);
          return (
            <g key={t}>
              <line
                x1={PAD_L}
                y1={y}
                x2={W - 20}
                y2={y}
                stroke="var(--color-border-strong)"
                strokeWidth={1}
                opacity={t === 0 ? 0.45 : 0.18}
              />
              <text
                x={PAD_L - 12}
                y={y + 4}
                textAnchor="end"
                className="fill-text-muted font-mono text-[10px]"
              >
                {t}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {buckets.map((b, i) => {
          const isSelected = selectedBank === b.bankCode;
          const isHovered = hovered === b.bankCode;
          const isLow = b.total < yMax * 0.25;
          const fill = isSelected
            ? "#1d3557"
            : isLow
              ? "#bfdbf7"
              : "#457b9d";
          return (
            <g
              key={b.bankCode}
              role="button"
              tabIndex={0}
              aria-label={`${b.bankCode} · ${b.total.toFixed(0)} TND`}
              onClick={() => onSelect(b.bankCode)}
              onMouseEnter={() => setHovered(b.bankCode)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(b.bankCode)}
              onBlur={() => setHovered(null)}
              className="cursor-pointer outline-none"
            >
              <rect
                x={barX(i)}
                y={barY(b.total)}
                width={barW}
                height={barH(b.total)}
                rx={8}
                ry={8}
                fill={fill}
                stroke={isSelected ? "#1d3557" : "transparent"}
                strokeWidth={2}
                style={{
                  transition: "filter 150ms ease-out, opacity 150ms ease-out",
                  filter: isHovered ? "brightness(1.08)" : "none",
                }}
              />
              <text
                x={barX(i) + barW / 2}
                y={H - 26}
                textAnchor="middle"
                className={cn(
                  "font-sans text-[13px] font-bold",
                  isSelected ? "fill-accent" : "fill-text-primary",
                )}
              >
                {b.bankCode}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Hover tooltip — HTML overlay so it stays sharp at any zoom and
          respects the project's font tokens. Positioned absolutely
          using percent based on the SVG layout coordinates. */}
      {hovered &&
        (() => {
          const i = buckets.findIndex((b) => b.bankCode === hovered);
          if (i < 0) return null;
          const b = buckets[i];
          const cx = barX(i) + barW / 2;
          const cy = barY(b.total);
          const xPct = (cx / W) * 100;
          const yPct = (cy / H) * 100;
          return (
            <div
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg border border-border-soft bg-surface-card px-2.5 py-1.5 shadow-md"
              style={{ left: `${xPct}%`, top: `calc(${yPct}% - 8px)` }}
            >
              <p className="whitespace-nowrap font-sans text-[11px] font-bold text-text-primary">
                {formatTnd(b.total)} TND
              </p>
            </div>
          );
        })()}
    </div>
  );
}

function niceCeiling(value: number, step: number): number {
  if (value <= 0) return step;
  return Math.ceil(value / step) * step;
}

function stepTicks(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let v = from; v <= to; v += step) out.push(v);
  return out;
}

/**
 * Classic "nice-number" axis stepping. Picks a step from {1, 2, 5} ×
 * 10ⁿ that yields roughly {@code targetTicks} labels for the given max.
 * Examples:
 *   max=58       → step=10      → ticks 0,10,20,30,40,50,60
 *   max=5,800    → step=1,000   → ticks 0,1k,2k,3k,4k,5k,6k
 *   max=580,000  → step=100,000 → ticks 0,100k,…,600k
 */
function pickNiceStep(max: number, targetTicks: number): number {
  if (max <= 0 || !Number.isFinite(max)) return 1;
  const rough = max / Math.max(1, targetTicks);
  const exp = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / exp;
  let nice: number;
  if (norm < 1.5) nice = 1;
  else if (norm < 3) nice = 2;
  else if (norm < 7) nice = 5;
  else nice = 10;
  return nice * exp;
}

function formatTnd(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}
