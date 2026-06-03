import { ArrowRight, Cpu } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/features/dashboard/components/Card";
import { useMlInfo } from "@/features/dashboard/hooks";
import type { ActiveLayer } from "@/features/dashboard/api";

const COLOR_GOOD_BG = "#dff5ec";
const COLOR_GOOD_FG = "#3fa885";
const COLOR_WARN_BG = "#fbe9c9";
const COLOR_WARN_FG = "#cf821a";
const COLOR_BAD_BG = "#fde6e6";
const COLOR_BAD_FG = "#c93b3a";

/**
 * Analyst dashboard Card 2 — compact ML status summary.
 *
 *   Header:  [icon] ML model · [active layer pill]
 *   Strip:   AUC-PR │ Precision │ Recall  (3-up segmented strip — same
 *            layout as ActiveLayerCard on /ml-config so the dashboard
 *            and detail page reinforce each other visually)
 *   Rows:    LOW ≤  X   |   MED ≤  Y   (current decision thresholds)
 *   Footer:  Open ML Config →
 *
 * Source mirrors MlModelCard but emphasizes thresholds + AUC-PR/Precision/Recall
 * (the 3 numbers analysts care about) instead of accuracy.
 */
export function MlConfigSummaryCard() {
  const { data, loading, error, retry } = useMlInfo();

  const activeLayer = data?.config.activeLayer ?? null;
  const aucPr = data?.metrics.aucPr ?? 0;
  const precision = data?.metrics.precision ?? 0;
  const recall = data?.metrics.recall ?? 0;
  const lowMed = data?.config.thresholdLowMedium ?? 0;
  const medHigh = data?.config.thresholdMediumHigh ?? 0;

  return (
    <Card to="/ml-config" className="px-[22px] py-[18px]">
      <Header activeLayer={activeLayer} loading={loading} />

      {error ? (
        <ErrorState onRetry={retry} />
      ) : (
        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          {/* 3-stat strip — AUC-PR / Precision / Recall */}
          <div className="grid shrink-0 grid-cols-3 overflow-hidden rounded-xl ring-1 ring-inset ring-brand-cream-2/70">
            <Stat label="AUC-PR" value={loading ? "" : formatRatio(aucPr)} />
            <Stat
              label="Precision"
              value={loading ? "" : formatPercent(precision)}
              divider
            />
            <Stat
              label="Recall"
              value={loading ? "" : formatPercent(recall)}
              divider
            />
          </div>

          {/* Threshold rows */}
          <div className="flex shrink-0 flex-col gap-1.5">
            <ThresholdRow label="LOW ≤" value={loading ? "" : formatRatio(lowMed)} tone="positive" />
            <ThresholdRow label="MED ≤" value={loading ? "" : formatRatio(medHigh)} tone="warn" />
          </div>
        </div>
      )}

      <Link
        to="/ml-config"
        className="mt-3 flex shrink-0 items-center gap-1 self-end overflow-hidden text-brand-medium transition-transform duration-150 ease-out hover:translate-x-0.5"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="whitespace-nowrap font-sans text-[12px] font-semibold">
          Open ML Config
        </span>
        <ArrowRight className="size-3 shrink-0" strokeWidth={2.4} />
      </Link>
    </Card>
  );
}

/* ─── Sub-components ────────────────────────────────────────────────── */

function Header({
  activeLayer,
  loading,
}: {
  activeLayer: ActiveLayer | null;
  loading: boolean;
}) {
  return (
    <div className="flex w-full shrink-0 items-center gap-2.5 overflow-hidden">
      <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#dff5ec]">
        <Cpu className="size-4" style={{ color: COLOR_GOOD_FG }} strokeWidth={2} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1 overflow-hidden">
        <p className="truncate font-sans text-[14px] font-bold leading-none text-text-primary">
          ML model
        </p>
        {!loading && activeLayer && <LayerPill layer={activeLayer} />}
      </div>
    </div>
  );
}

function LayerPill({ layer }: { layer: ActiveLayer }) {
  const { bg, fg, label } = layerStyle(layer);
  return (
    <span
      className="flex w-fit max-w-full items-center gap-1.5 overflow-hidden rounded-full px-2 py-0.5"
      style={{ backgroundColor: bg }}
    >
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: fg }}
      />
      <span
        className="truncate whitespace-nowrap font-sans text-[9px] font-bold tracking-[1.08px]"
        style={{ color: fg }}
      >
        {label}
      </span>
    </span>
  );
}

function Stat({
  label,
  value,
  divider,
}: {
  label: string;
  value: string;
  divider?: boolean;
}) {
  return (
    <div
      className={[
        "flex min-w-0 flex-col items-center justify-center gap-0.5 px-2 py-2",
        divider ? "border-l border-brand-cream-2/70" : "",
      ].join(" ")}
    >
      <p className="whitespace-nowrap font-sans text-[9px] font-bold uppercase tracking-[0.96px] text-text-label">
        {label}
      </p>
      {value === "" ? (
        <span className="block h-[14px] w-[42px] animate-pulse rounded bg-brand-cream-2" />
      ) : (
        <p className="truncate whitespace-nowrap font-sans text-[14px] font-bold text-text-primary tabular-nums">
          {value}
        </p>
      )}
    </div>
  );
}

function ThresholdRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "positive" | "warn";
}) {
  const dot = tone === "positive" ? COLOR_GOOD_FG : COLOR_WARN_FG;
  return (
    <div className="flex w-full shrink-0 items-center overflow-hidden">
      <span
        className="mr-2 size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: dot }}
        aria-hidden
      />
      <p className="whitespace-nowrap font-sans text-[11px] font-medium text-text-muted">
        {label}
      </p>
      <div className="min-w-0 flex-1" />
      {value === "" ? (
        <span className="block h-[12px] w-[42px] animate-pulse rounded bg-brand-cream-2" />
      ) : (
        <p className="truncate whitespace-nowrap font-mono text-[12px] font-semibold text-text-primary tabular-nums">
          {value}
        </p>
      )}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mt-3 flex min-h-0 flex-1 items-center justify-center gap-2 overflow-hidden">
      <p className="font-sans text-[11px] text-text-muted">Couldn't load.</p>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRetry();
        }}
        className="font-sans text-[11px] font-semibold text-brand-medium transition-transform duration-150 ease-out hover:translate-x-0.5"
      >
        Retry →
      </button>
    </div>
  );
}

/* ─── Helpers ────────────────────────────────────────────────────────── */

function layerStyle(layer: ActiveLayer): { bg: string; fg: string; label: string } {
  if (layer === "PRIMARY") {
    return { bg: COLOR_GOOD_BG, fg: COLOR_GOOD_FG, label: "PRIMARY · OPERATIONAL" };
  }
  if (layer === "BACKUP") {
    return { bg: COLOR_WARN_BG, fg: COLOR_WARN_FG, label: "BACKUP · ACTIVE" };
  }
  return { bg: COLOR_BAD_BG, fg: COLOR_BAD_FG, label: "STUB · FALLBACK" };
}

function formatPercent(fraction: number): string {
  if (!Number.isFinite(fraction) || fraction <= 0) return "—";
  return `${(fraction * 100).toFixed(1)}%`;
}

function formatRatio(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  return value.toFixed(2);
}
