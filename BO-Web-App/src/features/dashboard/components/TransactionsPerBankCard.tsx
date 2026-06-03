import { useEffect, useMemo, useState } from "react";
import { Card } from "@/features/dashboard/components/Card";
import { useBanks, useDashboard } from "@/features/dashboard/hooks";
import { chartColorFor } from "@/features/dashboard/palette";

interface DonutSlice {
  bankCode: string;
  bankName: string;
  count: number;
}

/**
 * Card 5 — Transactions per bank (donut).
 *
 * Hover behavior mirrors the CLIENTS PER BANK pie:
 *   - Hovered slice pops outward radially (4 viewBox units along its
 *     angle bisector) with a white stroke + drop shadow.
 *   - The subtitle line cross-fades to a "color dot · Bank Name · X
 *     transactions" chip; centered count number stays stable.
 *
 * Implementation: SVG circle per slice with stroke-dasharray. Each
 * circle has the same cx/cy/r; the dash pattern carves out just that
 * slice's arc length, dashoffset stacks slices end-to-end. Rotated
 * −90° so the first slice starts at 12 o'clock.
 *
 * Source: GET /api/v1/superadmin/dashboard?period=30d
 *         → analystDashboard.transactionVolumeByBank: [{ bankCode, count, … }]
 */
interface TransactionsPerBankCardProps {
  /** Bank code currently selected by the donut — drives the line chart. */
  selectedBank: string | null;
  /** Toggle handler for slice clicks (re-clicking the active slice clears). */
  onSelectBank: (bankCode: string | null) => void;
}

export function TransactionsPerBankCard({
  selectedBank,
  onSelectBank,
}: TransactionsPerBankCardProps) {
  const dashboardQ = useDashboard("30d");
  const banksQ = useBanks();
  // Hover state stays internal; persisted selection is lifted up.
  const [active, setActive] = useState<string | null>(null);

  // bankCode → full bank name. `BankVolumeCount` only carries the code,
  // so we resolve the human-readable name via the banks endpoint.
  const bankNameByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of banksQ.data ?? []) m.set(b.code, b.name);
    return m;
  }, [banksQ.data]);

  const slices = useMemo<DonutSlice[]>(() => {
    const raw = dashboardQ.data?.analystDashboard?.transactionVolumeByBank ?? [];
    return raw
      .filter((s) => s.count > 0)
      .map((s) => ({
        bankCode: s.bankCode,
        bankName: bankNameByCode.get(s.bankCode) ?? s.bankCode,
        count: s.count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [dashboardQ.data, bankNameByCode]);

  const loading = dashboardQ.loading;
  const error = dashboardQ.error;
  const retry = () => {
    dashboardQ.retry();
    banksQ.retry();
  };

  const total = slices.reduce((sum, s) => sum + s.count, 0);
  const activeSlice = active ? slices.find((s) => s.bankCode === active) : null;
  const selectedSlice = selectedBank
    ? slices.find((s) => s.bankCode === selectedBank)
    : null;
  // Hover beats selection (transient preview); both fall back to the
  // default "Last 30 days" subtitle when nothing is set.
  const displaySlice = activeSlice ?? selectedSlice ?? null;

  return (
    <Card to="/transactions" className="px-[22px] py-[18px]">
      <div className="flex w-full shrink-0 flex-col gap-0.5 overflow-hidden whitespace-nowrap leading-none">
        <p className="truncate font-sans text-[14px] font-bold text-text-primary">
          Transactions per bank
        </p>
        <SubtitleLine activeSlice={displaySlice} />
      </div>

      {/* Donut wrapper stops propagation so slice clicks don't bubble up
          to the card-level link (which navigates to /transactions). The
          rest of the card area still routes on click. */}
      <div
        className="relative mt-2 flex min-h-0 flex-1 items-center justify-center overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <DonutSkeleton />
        ) : error ? (
          <ErrorState onRetry={retry} />
        ) : total === 0 ? (
          <EmptyState />
        ) : (
          <Donut
            slices={slices}
            total={total}
            activeKey={active}
            onActiveChange={setActive}
            selectedKey={selectedBank}
            onSelectKey={(key) =>
              onSelectBank(key === selectedBank ? null : key)
            }
          />
        )}
      </div>
    </Card>
  );
}

/**
 * Subtitle row. Layered cross-fade between the default "Last 30 days" and
 * a hover chip showing the slice's color dot + bank name + count. The
 * hover row uses a sticky `lastSlice` so the content doesn't blink to
 * empty while fading out.
 */
function SubtitleLine({ activeSlice }: { activeSlice: DonutSlice | null | undefined }) {
  const [lastSlice, setLastSlice] = useState<DonutSlice | null>(null);

  useEffect(() => {
    if (activeSlice) setLastSlice(activeSlice);
  }, [activeSlice]);

  const hovered = !!activeSlice;
  const display = lastSlice;

  return (
    <div className="relative grid h-[14px] overflow-hidden">
      {/* Default */}
      <p
        className="col-start-1 row-start-1 truncate font-sans text-[11px] text-text-muted transition-opacity duration-200 ease-out"
        style={{ opacity: hovered ? 0 : 1 }}
      >
        Last 30 days
      </p>

      {/* Hover chip */}
      <div
        className="col-start-1 row-start-1 flex items-center gap-1.5 overflow-hidden whitespace-nowrap transition-all duration-200 ease-out pointer-events-none"
        style={{
          opacity: hovered ? 1 : 0,
          transform: hovered ? "translateY(0)" : "translateY(2px)",
        }}
      >
        {display && (
          <>
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: chartColorFor(display.bankCode) }}
            />
            <span className="truncate font-sans text-[11px] font-semibold text-text-primary">
              {display.bankName}
            </span>
            <span className="font-mono text-[11px] font-medium text-text-muted">
              · {display.count.toLocaleString()} transactions
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function Donut({
  slices,
  total,
  activeKey,
  onActiveChange,
  selectedKey,
  onSelectKey,
}: {
  slices: DonutSlice[];
  total: number;
  activeKey: string | null;
  onActiveChange: (key: string | null) => void;
  /** Bank code currently locked in by a click — drives line chart upstream. */
  selectedKey: string | null;
  onSelectKey: (key: string) => void;
}) {
  // Geometry — viewBox 0..100. Outer/inner radii frame the donut ring.
  const cx = 50;
  const cy = 50;
  const rOuter = 43;
  const rInner = 29;
  // Pop-out distance (viewBox units) for the hovered slice.
  const POP_OUT = 4;
  // Tiny angular gap between slices for visual separation.
  const GAP = 0.012; // radians

  const wedges = useMemo(() => {
    let cumulative = 0; // 0..1
    return slices.map((s) => {
      const fraction = s.count / total;
      const startA = cumulative * Math.PI * 2 + GAP / 2;
      const endA = (cumulative + fraction) * Math.PI * 2 - GAP / 2;
      const midA = (startA + endA) / 2;
      cumulative += fraction;

      const sweep = endA - startA;
      const large = sweep > Math.PI ? 1 : 0;

      // Standard "annular sector" path: outer arc start→end, line in,
      // inner arc end→start, close. Angles measured from 12 o'clock,
      // clockwise (so `sin` for x, `-cos` for y in screen space).
      const xo1 = cx + rOuter * Math.sin(startA);
      const yo1 = cy - rOuter * Math.cos(startA);
      const xo2 = cx + rOuter * Math.sin(endA);
      const yo2 = cy - rOuter * Math.cos(endA);
      const xi1 = cx + rInner * Math.sin(startA);
      const yi1 = cy - rInner * Math.cos(startA);
      const xi2 = cx + rInner * Math.sin(endA);
      const yi2 = cy - rInner * Math.cos(endA);

      const d =
        slices.length === 1
          ? // Single bank holds 100% — render a full ring (two arcs each).
            `M ${cx - rOuter} ${cy} A ${rOuter} ${rOuter} 0 1 1 ${cx + rOuter} ${cy} A ${rOuter} ${rOuter} 0 1 1 ${cx - rOuter} ${cy} Z M ${cx - rInner} ${cy} A ${rInner} ${rInner} 0 1 0 ${cx + rInner} ${cy} A ${rInner} ${rInner} 0 1 0 ${cx - rInner} ${cy} Z`
          : `M ${xo1} ${yo1} A ${rOuter} ${rOuter} 0 ${large} 1 ${xo2} ${yo2} L ${xi2} ${yi2} A ${rInner} ${rInner} 0 ${large} 0 ${xi1} ${yi1} Z`;

      return { slice: s, d, midA };
    });
  }, [slices, total]);

  return (
    <div className="relative aspect-square h-full max-h-full">
      <svg
        viewBox="0 0 100 100"
        // overflow-visible so the popped-out slice + drop-shadow don't
        // clip at the SVG bounding box.
        className="block h-full w-full overflow-visible"
        role="img"
        aria-label="Transactions per bank distribution"
      >
        {wedges.map(({ slice, d, midA }) => {
          const isActive = activeKey === slice.bankCode;
          const isSelected = selectedKey === slice.bankCode;
          const popped = isActive || isSelected;
          const tx = popped ? Math.sin(midA) * POP_OUT : 0;
          const ty = popped ? -Math.cos(midA) * POP_OUT : 0;
          // Selected wedge keeps full color; the others fade slightly so
          // the chosen bank reads as the "headline" — same affordance as
          // the Clients pie.
          const baseOpacity = selectedKey && !isSelected ? 0.45 : 1;
          return (
            <path
              key={slice.bankCode}
              d={d}
              // Use even-odd so the inner arc carves out the donut hole
              // for the single-slice (full-ring) case.
              fillRule="evenodd"
              fill={chartColorFor(slice.bankCode)}
              stroke={popped ? "#ffffff" : "transparent"}
              strokeWidth={isSelected ? 2 : isActive ? 1.5 : 0}
              style={{
                cursor: "pointer",
                opacity: baseOpacity,
                transform: `translate(${tx}px, ${ty}px)`,
                transformBox: "view-box",
                transformOrigin: "50px 50px",
                filter: popped
                  ? "drop-shadow(0 1.5px 2.5px rgba(42,31,20,0.28))"
                  : "none",
                transition:
                  "transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1), filter 200ms ease-out, stroke-width 150ms ease-out, opacity 200ms ease-out",
              }}
              onMouseEnter={() => onActiveChange(slice.bankCode)}
              onMouseLeave={() =>
                onActiveChange(
                  activeKey === slice.bankCode ? null : activeKey,
                )
              }
              onClick={(e) => {
                e.stopPropagation();
                onSelectKey(slice.bankCode);
              }}
            >
              <title>
                {slice.bankName} · {slice.count.toLocaleString()} transactions
              </title>
            </path>
          );
        })}
      </svg>

      {/* Center label — HTML overlay so font sizes stay constant regardless
          of donut diameter. Centered absolutely on the donut. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center leading-none">
        <p className="font-sans text-[18px] font-bold text-text-primary">
          {total.toLocaleString()}
        </p>
        <p className="mt-1 whitespace-nowrap font-sans text-[8px] font-bold tracking-[1.12px] text-text-muted">
          TRANSACTIONS
        </p>
      </div>
    </div>
  );
}

function DonutSkeleton() {
  return (
    <div className="aspect-square h-full max-h-full animate-pulse">
      <div className="h-full w-full rounded-full border-[14px] border-brand-cream-2/60" />
    </div>
  );
}

function EmptyState() {
  return (
    <p className="font-sans text-[12px] text-text-muted">
      No transactions yet.
    </p>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex items-center gap-2">
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
