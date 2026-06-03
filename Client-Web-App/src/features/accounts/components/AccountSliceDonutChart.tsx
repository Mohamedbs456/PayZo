import { useState } from "react";
import { cn } from "@/lib/cn";
import type { ClientAccount } from "@/features/dashboard/api";

interface AccountSliceDonutChartProps {
  bankCode: string;
  bankTotal: number;
  accounts: ClientAccount[];
  selectedAccount: string | null;
  onSelect: (accountNumber: string) => void;
}

/**
 * "BY ACCOUNT" donut chart (Figma 120:40). Each slice is one account
 * inside the currently-selected bank, sized proportionally to the
 * account's balance. Hover over a slice → tooltip with the amount;
 * click a slice → drives the corresponding row's selection in the
 * bank list below. Center label always shows `{bankCode} TOTAL` and
 * the bank's aggregate balance.
 */
export function AccountSliceDonutChart({
  bankCode,
  bankTotal,
  accounts,
  selectedAccount,
  onSelect,
}: AccountSliceDonutChartProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  // SVG geometry — viewBox-anchored so the chart scales responsively.
  const W = 540;
  const H = 320;
  const cx = W / 2;
  const cy = H / 2 + 6;
  const ro = 110; // outer radius
  const ri = 70; // inner radius

  // Compute each slice's start/end angles. Going clockwise from 12 o'clock.
  let cumAngle = 0;
  const slices = accounts.map((a) => {
    const portion = bankTotal > 0 ? a.balance / bankTotal : 0;
    const start = cumAngle;
    const end = cumAngle + portion * 360;
    cumAngle = end;
    return { account: a, start, end, portion };
  });

  return (
    <div className="relative h-full w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-full w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <text
          x={20}
          y={22}
          className="fill-text-muted font-sans text-[13px] font-semibold uppercase"
          style={{ letterSpacing: "0.08em" }}
        >
          {`BY ACCOUNT  ·  ${bankCode}`}
        </text>

        {/* Slices */}
        {slices.map((s, i) => {
          const isSelected = selectedAccount === s.account.accountNumber;
          const isHovered = hovered === s.account.accountNumber;
          const baseFill = SLICE_PALETTE[i % SLICE_PALETTE.length];
          const isFull = s.portion >= 0.999;
          return (
            <g
              key={s.account.accountNumber}
              role="button"
              tabIndex={0}
              aria-label={`Account ${maskedAccount(s.account.accountNumber)} · ${s.account.balance.toFixed(0)} TND`}
              onClick={() => onSelect(s.account.accountNumber)}
              onMouseEnter={() => setHovered(s.account.accountNumber)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(s.account.accountNumber)}
              onBlur={() => setHovered(null)}
              className="cursor-pointer outline-none"
            >
              {isFull ? (
                <RingMask cx={cx} cy={cy} ro={ro} ri={ri} fill={baseFill} />
              ) : (
                <path
                  d={arcPath(cx, cy, ro, ri, s.start, s.end)}
                  fill={baseFill}
                  stroke={isSelected ? "#0e1b2c" : "transparent"}
                  strokeWidth={isSelected ? 2 : 0}
                  style={{
                    transition: "filter 150ms ease-out, transform 150ms ease-out",
                    filter: isHovered ? "brightness(1.08)" : "none",
                    transformOrigin: `${cx}px ${cy}px`,
                    transform: isSelected ? "scale(1.02)" : "none",
                  }}
                />
              )}
            </g>
          );
        })}

        {/* Center labels */}
        <text
          x={cx}
          y={cy - 10}
          textAnchor="middle"
          className="fill-text-muted font-sans text-[12px] font-medium uppercase"
          style={{ letterSpacing: "0.1em" }}
        >
          {bankCode} TOTAL
        </text>
        <text
          x={cx}
          y={cy + 14}
          textAnchor="middle"
          className="fill-text-primary font-sans text-[20px] font-bold"
          style={{ letterSpacing: "-0.2px" }}
        >
          {formatTndShort(bankTotal)}
        </text>
        <text
          x={cx}
          y={cy + 30}
          textAnchor="middle"
          className="fill-text-muted font-sans text-[9px] font-normal uppercase"
          style={{ letterSpacing: "0.08em" }}
        >
          TND
        </text>
      </svg>

      {/* HTML hover tooltip — easier to style + position than SVG <text>. */}
      {hovered &&
        (() => {
          const slice = slices.find((s) => s.account.accountNumber === hovered);
          if (!slice) return null;
          // Place the tooltip at the angular midpoint of the hovered slice,
          // outside the donut.
          const mid = (slice.start + slice.end) / 2;
          const r = ro + 12;
          const rad = ((mid - 90) * Math.PI) / 180;
          const px = cx + r * Math.cos(rad);
          const py = cy + r * Math.sin(rad);
          return (
            <div
              className={cn(
                "pointer-events-none absolute rounded-lg border border-border-soft bg-surface-card px-2.5 py-1.5 shadow-md",
                "whitespace-nowrap",
              )}
              style={{
                left: `${(px / W) * 100}%`,
                top: `${(py / H) * 100}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              <p className="font-sans text-[10px] font-medium uppercase tracking-[0.06em] text-text-muted">
                {maskedAccount(slice.account.accountNumber)}
              </p>
              <p className="font-sans text-[11px] font-bold text-text-primary">
                {formatTndShort(slice.account.balance)} TND
              </p>
            </div>
          );
        })()}
    </div>
  );
}

/* ─── Helpers ──────────────────────────────────────────────────────────── */

const SLICE_PALETTE = [
  "#a8dadc", // brand teal — largest slice
  "#7eaeb9", // mid teal
  "#4a7888", // dark teal
  "#bfdbf7", // light blue (overflow / 4th+)
  "#1f7a8c", // accent teal
];

function arcPath(
  cx: number,
  cy: number,
  ro: number,
  ri: number,
  a1: number,
  a2: number,
): string {
  const rad = (a: number) => ((a - 90) * Math.PI) / 180;
  const x1 = cx + ro * Math.cos(rad(a1));
  const y1 = cy + ro * Math.sin(rad(a1));
  const x2 = cx + ro * Math.cos(rad(a2));
  const y2 = cy + ro * Math.sin(rad(a2));
  const x3 = cx + ri * Math.cos(rad(a2));
  const y3 = cy + ri * Math.sin(rad(a2));
  const x4 = cx + ri * Math.cos(rad(a1));
  const y4 = cy + ri * Math.sin(rad(a1));
  const large = a2 - a1 > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${ro} ${ro} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${ri} ${ri} 0 ${large} 0 ${x4} ${y4} Z`;
}

/** Single-account donut: render a full ring with two stacked circles. */
function RingMask({
  cx,
  cy,
  ro,
  ri,
  fill,
}: {
  cx: number;
  cy: number;
  ro: number;
  ri: number;
  fill: string;
}) {
  return (
    <>
      <circle cx={cx} cy={cy} r={ro} fill={fill} />
      <circle cx={cx} cy={cy} r={ri} fill="var(--color-surface-card)" />
    </>
  );
}

function maskedAccount(accountNumber: string): string {
  return `•••• ${accountNumber.slice(-4)}`;
}

function formatTndShort(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}
