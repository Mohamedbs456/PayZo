import { useEffect, useMemo, useState } from "react";
import { Card, CardHeader } from "@/features/dashboard/components/Card";
import { useBanks, useDashboard } from "@/features/dashboard/hooks";
import type { DashboardPeriod } from "@/features/dashboard/api";
import { chartColorFor } from "@/features/dashboard/palette";

interface PieSlice {
  bankCode: string;
  bankName: string;
  count: number;
  /** When true, this slice is a placeholder (no real client data yet). */
  placeholder: boolean;
}

/**
 * Card 2 — CLIENTS PER BANK.
 *
 *   Title:       CLIENTS PER BANK
 *   Big number:  total clients (sum of counts)
 *   Subtitle:    "across N banks"  (default)
 *                "<BANK_CODE> · <count> clients"  (when a slice is hovered)
 *   Pie:         one slice per bank, color = chartColorFor(bankCode).
 *                Hovered slice gets a white outer stroke + fades the others.
 *
 * Pie is a hand-rolled SVG (path arcs) — no chart library to fight, no
 * ResponsiveContainer measurement deadlock, and the same code handles
 * all-but-one-zero, single-bank, and empty data correctly.
 *
 * Source: GET /api/v1/superadmin/dashboard → adminDashboard.clientsPerBank.
 */
interface ClientsPerBankCardProps {
  period: DashboardPeriod;
  /** Bank code currently selected by the donut — drives the line chart. */
  selectedBank: string | null;
  /** Toggle handler for slice clicks (re-clicking the active slice clears). */
  onSelectBank: (bankCode: string | null) => void;
  /**
   * Pixel size of the pie's bounding square. Defaults to 120 — fits the
   * admin dashboard's tall row-1 slot comfortably. The SuperAdmin's
   * row-1 slot is much shorter ({@code 0.75fr / 3.35fr} ≈ 22 % of page
   * height vs the admin's {@code 1fr / 2fr} ≈ 50 %) and crops the
   * default; SA passes 80 instead.
   */
  pieSize?: number;
  /**
   * Side of the row the pie sits on. Admin (default {@code "left"})
   * reads naturally with the pie acting as the eye-anchor and the
   * stat panel flowing right. SA's slot is narrower top-to-bottom AND
   * the pie crops slightly even at 80 px when it's left-aligned —
   * moving it right swaps the breathing room, since the stat panel
   * can wrap text but the pie can't shrink without losing legibility.
   */
  pieSide?: "left" | "right";
  /**
   * Whether to render the per-bank list under the divider. Admin
   * (default {@code true}) has plenty of vertical room and uses the
   * list to fill the slot. SA's row-1 slot can't fit the list cleanly
   * even with a smaller pie — the slot is wide but short — so SA opts
   * out and the card becomes a single (stat | pie) strip. Hover on a
   * pie slice still surfaces that bank's info in the stat panel,
   * which is the inline equivalent of what the list shows.
   */
  showBankList?: boolean;
}

export function ClientsPerBankCard({
  period,
  selectedBank,
  onSelectBank,
  pieSize = 120,
  pieSide = "left",
  showBankList = true,
}: ClientsPerBankCardProps) {
  const dashboard = useDashboard(period);
  const banksQ = useBanks();
  // Hover state stays internal (drives the stat panel and slice pop-out).
  // The persisted selection lives at the page level so the line chart can
  // react to it.
  const [active, setActive] = useState<string | null>(null);

  const realSlices = dashboard.data?.adminDashboard?.clientsPerBank ?? [];
  const sliceSum = realSlices.reduce((sum, s) => sum + s.count, 0);

  // Authoritative client count comes from `systemKpis.totalClients`
  // (`countByRole(CLIENT)`). The per-bank slices come from
  // `adminDashboard.clientsPerBank`, which is currently a backend stub
  // (always []) — see DEFERRED.md D5. We track the two separately so the
  // big number can be honest even when the per-bank breakdown isn't yet
  // populated.
  const totalClients = dashboard.data?.systemKpis?.totalClients ?? 0;
  const realTotal = sliceSum > 0 ? sliceSum : totalClients;

  // Slice array drives the pie geometry, in three modes:
  //   (a) real per-bank data → use clientsPerBank as-is
  //   (b) banks list loaded but per-bank stub empty → uniform placeholder
  //       pie so the chart still reads as "N banks" visually
  //   (c) no banks at all → []
  const slices: PieSlice[] = useMemo(() => {
    if (sliceSum > 0) {
      return realSlices
        .filter((s) => s.count > 0)
        .map((s) => ({ ...s, placeholder: false }));
    }
    // Active banks only — a deactivated bank shouldn't get a slice in a
    // forward-looking "clients per bank" placeholder. Existing tx still
    // reference it (cards 4/5 keep showing it), but a placeholder pie is
    // a current-state view. Field name matches backend's BankResponse.
    const banks = (banksQ.data ?? []).filter((b) => b.active);
    return banks.map((b) => ({
      bankCode: b.code,
      bankName: b.name,
      count: 1, // uniform slice — only used to drive the pie geometry
      placeholder: true,
    }));
  }, [realSlices, sliceSum, banksQ.data]);

  const totalForPie = slices.reduce((sum, s) => sum + s.count, 0);
  const bankCount = slices.length;
  const isPlaceholder = slices.every((s) => s.placeholder);

  // Banks fetch is only on the critical path when we need the placeholder
  // pie — i.e. when real per-bank data is empty.
  const loading = dashboard.loading || (sliceSum === 0 && banksQ.loading);
  const error = dashboard.error ?? (sliceSum === 0 ? banksQ.error : null);
  const retry = () => {
    dashboard.retry();
    banksQ.retry();
  };

  const activeSlice = active ? slices.find((s) => s.bankCode === active) : null;
  const selectedSlice = selectedBank
    ? slices.find((s) => s.bankCode === selectedBank)
    : null;
  // Hover (transient preview) takes priority over selection (persistent).
  // When neither is set, the StatPanel shows the default "N clients across
  // M banks" line.
  const displaySlice = activeSlice ?? selectedSlice ?? null;

  // Top banks for the optional list shown when the card has vertical
  // breathing room (admin dashboard slot, etc.). Real slices first,
  // falls back silently when only the placeholder pie is showing.
  const topBanks = useMemo(
    () =>
      slices
        .filter((s) => !s.placeholder)
        .slice()
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    [slices],
  );

  return (
    <Card to="/clients" className="px-5 py-4">
      {/*
       * Layout — three vertical bands so the card looks the same in
       * the SuperAdmin slot and the (taller) admin slot. The list at
       * the bottom simply has more room in the taller layout; nothing
       * "stretches" to fill, which is what made the previous version
       * read as "huge pie, tiny text".
       *
       *   ┌─ CLIENTS PER BANK ──────────┐
       *   │                              │
       *   │  ╭─────╮   42                │   ← header + (pie | stat) row
       *   │  │ pie │   clients across N  │
       *   │  ╰─────╯                     │
       *   │                              │
       *   │  ─────────────────────────   │   ← divider
       *   │  ● BIAT     12   28%         │   ← top-banks list
       *   │  ● BNA       8   19%         │
       *   │  ...                         │
       *   └──────────────────────────────┘
       */}
      <div className="flex h-full w-full flex-col gap-3 overflow-hidden">
        <CardHeader title="CLIENTS PER BANK" />

        {/* ── Top band: pie + stat ───────────────────────────────────
            Pie size is set by the caller via {@code pieSize} so each
            dashboard slot can pick a fit-for-its-height value. The
            stat panel takes whatever horizontal room is left.
            {@code pieSide} flips the visual order — admin reads
            pie→stat (default), SA reads stat→pie so the cropped-edge
            risk moves to the pie's *outer* side instead of its bottom. */}
        <div
          className={`flex items-center gap-4 ${
            // When the list-below is suppressed (SA case), pull the
            // pie+stat row 2 mm (~8 px) up from the slot's vertical
            // centre so it sits a hair higher in the card. The
            // bottom of the card naturally absorbs the extra
            // breathing room.
            showBankList ? "shrink-0" : "-mt-2 min-h-0 flex-1"
          }${pieSide === "right" ? " flex-row-reverse" : ""}`}
        >
          <div
            className="shrink-0"
            style={{ width: pieSize, height: pieSize }}
            onClick={(e) => e.stopPropagation()}
          >
            {!loading && !error && bankCount > 0 && (
              <Pie
                slices={slices}
                total={totalForPie}
                activeKey={active}
                onActiveChange={setActive}
                selectedKey={selectedBank}
                onSelectKey={(key) =>
                  onSelectBank(key === selectedBank ? null : key)
                }
              />
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-1 overflow-hidden">
            {loading ? (
              <StatSkeleton />
            ) : error ? (
              <ErrorState onRetry={retry} />
            ) : bankCount === 0 ? (
              <EmptyState />
            ) : (
              <StatPanel
                activeSlice={displaySlice}
                total={realTotal}
                bankCount={bankCount}
                isPlaceholder={isPlaceholder}
                hasClients={totalClients > 0}
              />
            )}
          </div>
        </div>

        {/* ── Bottom band: top-banks list (when there's >1 bank
            AND the caller opted in via {@code showBankList}). SA's
            row-1 slot is too short for the list to render cleanly
            below the (stat | pie) strip, so SA passes false and the
            card stays a single-row layout — hover still surfaces
            per-bank info inline via the stat panel's hover state. */}
        {showBankList && !loading && !error && topBanks.length > 1 && (
          <>
            <div
              aria-hidden
              className="shrink-0 border-t border-brand-cream-2/60"
            />
            <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
              {topBanks.map((b) => {
                const pct = realTotal > 0 ? (b.count / realTotal) * 100 : 0;
                return (
                  <li
                    key={b.bankCode}
                    className="flex items-center justify-between gap-3 overflow-hidden"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: chartColorFor(b.bankCode) }}
                      />
                      <span className="truncate font-sans text-[12px] text-text-primary">
                        {b.bankName}
                      </span>
                    </span>
                    <span className="shrink-0 whitespace-nowrap font-mono text-[11px] tabular-nums text-text-muted">
                      {b.count.toLocaleString()}
                      <span className="ml-1 text-text-faint">
                        · {pct.toFixed(0)}%
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </Card>
  );
}

/**
 * Two layered states (default + hover-info) sit in the same grid cell so
 * they fade between each other smoothly. We keep `lastSlice` as a sticky
 * mirror of `activeSlice`: when the user mouses out, `activeSlice`
 * becomes null and the panel fades out, but the bank info stays visible
 * (still showing the last bank) for the duration of the fade — preventing
 * a content flicker mid-transition.
 */
function StatPanel({
  activeSlice,
  total,
  bankCount,
  isPlaceholder,
  hasClients,
}: {
  activeSlice: PieSlice | null | undefined;
  total: number;
  bankCount: number;
  isPlaceholder: boolean;
  hasClients: boolean;
}) {
  const [lastSlice, setLastSlice] = useState<PieSlice | null>(null);

  useEffect(() => {
    if (activeSlice) setLastSlice(activeSlice);
  }, [activeSlice]);

  const hovered = !!activeSlice;
  const display = lastSlice;

  return (
    <div className="relative grid min-h-[40px] overflow-hidden">
      {/* Default — total + N banks */}
      <div
        className="col-start-1 row-start-1 flex items-baseline gap-1.5 overflow-hidden whitespace-nowrap leading-none transition-opacity duration-200 ease-out"
        style={{ opacity: hovered ? 0 : 1 }}
      >
        <p className="shrink-0 font-sans text-[28px] font-bold leading-none text-text-primary">
          {total.toLocaleString()}
        </p>
        <p className="min-w-0 font-sans text-[12px] text-text-muted">
          {hasClients || !isPlaceholder
            ? `clients across ${bankCount} banks`
            : `no clients yet · ${bankCount} banks`}
        </p>
      </div>

      {/* Hover — bank chip (color dot + name + count) */}
      <div
        className="col-start-1 row-start-1 flex flex-col gap-1 overflow-hidden transition-all duration-200 ease-out pointer-events-none"
        style={{
          opacity: hovered ? 1 : 0,
          transform: hovered ? "translateY(0)" : "translateY(2px)",
        }}
      >
        {display && (
          <>
            <div className="flex items-center gap-2 overflow-hidden">
              <span
                className="size-2.5 shrink-0 rounded-full ring-2 ring-white"
                style={{
                  backgroundColor: chartColorFor(display.bankCode),
                  boxShadow: `0 0 0 1px ${chartColorFor(display.bankCode)}33`,
                }}
              />
              <p className="truncate font-sans text-[13px] font-semibold leading-tight text-text-primary">
                {display.bankName}
              </p>
            </div>
            <p className="whitespace-nowrap font-sans text-[11px] font-medium text-text-muted">
              <span className="font-mono font-bold text-text-primary">
                {display.placeholder
                  ? "0"
                  : display.count.toLocaleString()}
              </span>
              {" "}
              {display.placeholder ? "clients (no data yet)" : "clients"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Pie({
  slices,
  total,
  activeKey,
  onActiveChange,
  selectedKey,
  onSelectKey,
}: {
  slices: PieSlice[];
  total: number;
  activeKey: string | null;
  onActiveChange: (key: string | null) => void;
  /** Bank code currently locked in by a click — drives line chart upstream. */
  selectedKey: string | null;
  onSelectKey: (key: string) => void;
}) {
  // SVG geometry — viewBox is 100×100 so all coords are simple percentages.
  const cx = 50;
  const cy = 50;
  const r = 48;
  const safeTotal = total > 0 ? total : 1;

  // Build path data + per-slice geometry once per render. The angle
  // bisector (`midA`) is what we use to translate a hovered slice
  // radially outward — gives the "pop out from the pie" feel.
  const paths = useMemo(() => {
    let cumulative = 0;
    return slices.map((s) => {
      const startA = (cumulative / safeTotal) * Math.PI * 2;
      cumulative += s.count;
      const endA = (cumulative / safeTotal) * Math.PI * 2;
      const sweep = endA - startA;
      const midA = (startA + endA) / 2;
      const large = sweep > Math.PI ? 1 : 0;
      const x1 = cx + r * Math.sin(startA);
      const y1 = cy - r * Math.cos(startA);
      const x2 = cx + r * Math.sin(endA);
      const y2 = cy - r * Math.cos(endA);

      // If a single bank holds 100% of the data, the wedge equation
      // collapses (start == end). Render a full circle via two arcs instead.
      const d =
        slices.length === 1 || sweep >= Math.PI * 2 - 1e-6
          ? `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`
          : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;

      return { d, slice: s, midA };
    });
  }, [slices, safeTotal]);

  // Pop-out distance for the hovered slice, measured in viewBox units
  // (≈ 4% of the pie radius).
  const POP_OUT = 4;

  return (
    <svg
      viewBox="0 0 100 100"
      // overflow-visible so the popped-out slice + drop-shadow don't clip.
      className="block h-full w-full overflow-visible"
      role="img"
      aria-label="Clients per bank distribution"
    >
      {paths.map(({ d, slice, midA }) => {
        const isActive = activeKey === slice.bankCode;
        const isSelected = selectedKey === slice.bankCode;
        // Both hover and selection trigger the pop-out — selection holds
        // it persistently while hover is transient.
        const popped = isActive || isSelected;
        const tx = popped ? Math.sin(midA) * POP_OUT : 0;
        const ty = popped ? -Math.cos(midA) * POP_OUT : 0;
        // Selected slice keeps full color; others fade slightly when a
        // selection exists, so the chosen bank reads as the "headline".
        const baseOpacity =
          selectedKey && !isSelected ? 0.45 : 1;
        return (
          <path
            key={slice.bankCode}
            d={d}
            fill={chartColorFor(slice.bankCode)}
            stroke={popped ? "#ffffff" : "transparent"}
            strokeWidth={isSelected ? 2.5 : isActive ? 2 : 0}
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
              onActiveChange(activeKey === slice.bankCode ? null : activeKey)
            }
            onClick={(e) => {
              e.stopPropagation();
              onSelectKey(slice.bankCode);
            }}
          >
            <title>
              {slice.bankName} ·{" "}
              {slice.placeholder
                ? "0 clients"
                : `${slice.count.toLocaleString()} clients`}
            </title>
          </path>
        );
      })}
    </svg>
  );
}

function StatSkeleton() {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="block h-[22px] w-[64px] animate-pulse rounded bg-brand-cream-2" />
      <span className="block h-[14px] w-[80px] animate-pulse rounded bg-brand-cream-2" />
    </div>
  );
}

function EmptyState() {
  return (
    <p className="font-sans text-[11px] text-text-muted">
      No banks yet.
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
