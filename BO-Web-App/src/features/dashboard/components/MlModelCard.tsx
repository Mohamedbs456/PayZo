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
 * Card 8 — ML model.
 *
 *   Header:  [icon] ML model · [layer pill]
 *   Body:    ACTIVE MODEL / VERSION / ACCURACY / PERFORMANCE rows
 *   Footer:  Open ML Config →
 *
 * Sources:
 *   GET /api/v1/analyst/ml-config   → modelVersion, activeLayer
 *   GET /api/v1/analyst/ml-metrics  → accuracy, aucPr (other fields ignored)
 */
export function MlModelCard() {
  const { data, loading, error, retry } = useMlInfo();

  const activeLayer = data?.config.activeLayer ?? null;
  const modelVersion = data?.config.modelVersion ?? "";
  const modelName = activeModelName(modelVersion);
  const versionLabel = modelVersion || "—";
  const accuracy = data?.metrics.accuracy ?? 0;
  const aucPr = data?.metrics.aucPr ?? 0;

  return (
    <Card to="/ml-config" className="px-[22px] py-[18px]">
      <Header activeLayer={activeLayer} loading={loading} />

      {error ? (
        <ErrorState onRetry={retry} />
      ) : (
        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
          <StatRow label="ACTIVE MODEL" value={loading ? "" : modelName} />
          <StatRow label="VERSION" value={loading ? "" : versionLabel} />
          <StatRow
            label="ACCURACY"
            value={loading ? "" : formatPercent(accuracy)}
          />
          <StatRow
            label="PERFORMANCE"
            value={loading ? "" : formatAucPr(aucPr)}
          />
        </div>
      )}

      <Link
        to="/ml-config"
        className="mt-3 flex shrink-0 items-center gap-1 self-end overflow-hidden text-brand-medium transition-transform duration-150 ease-out hover:translate-x-0.5"
      >
        <span className="whitespace-nowrap font-sans text-[12px] font-semibold">
          Open ML Config
        </span>
        <ArrowRight className="size-3 shrink-0" strokeWidth={2.4} />
      </Link>
    </Card>
  );
}

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

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex w-full shrink-0 items-center overflow-hidden">
      <p className="whitespace-nowrap font-sans text-[11px] font-medium text-text-muted">
        {label}
      </p>
      <div className="min-w-0 flex-1" />
      {value === "" ? (
        <span className="block h-[12px] w-[64px] animate-pulse rounded bg-brand-cream-2" />
      ) : (
        <p className="truncate whitespace-nowrap font-sans text-[12px] font-semibold text-text-primary">
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
 * Maps the model version prefix to a human-readable family name. The
 * backend stores versions like "xgb-transfer-v1", "rf-stable-v3", etc.
 * Falls back to the raw string if we don't recognize the prefix.
 */
function activeModelName(modelVersion: string): string {
  if (!modelVersion) return "—";
  const prefix = modelVersion.split(/[-_]/)[0]?.toLowerCase();
  switch (prefix) {
    case "xgb":
      return "XGBoost";
    case "rf":
      return "Random Forest";
    case "lr":
      return "Logistic Regression";
    case "nn":
      return "Neural Network";
    case "stub":
      return "Rule-based stub";
    default:
      return modelVersion;
  }
}

function layerStyle(layer: ActiveLayer): {
  bg: string;
  fg: string;
  label: string;
} {
  if (layer === "PRIMARY") {
    return { bg: COLOR_GOOD_BG, fg: COLOR_GOOD_FG, label: "PRIMARY · OPERATIONAL" };
  }
  if (layer === "BACKUP") {
    return { bg: COLOR_WARN_BG, fg: COLOR_WARN_FG, label: "BACKUP · ACTIVE" };
  }
  // STUB — primary + backup both unreachable, rule-based fallback in use.
  return { bg: COLOR_BAD_BG, fg: COLOR_BAD_FG, label: "STUB · FALLBACK" };
}

function formatPercent(fraction: number): string {
  if (!Number.isFinite(fraction) || fraction <= 0) return "—";
  return `${(fraction * 100).toFixed(1)}%`;
}

function formatAucPr(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  return `${value.toFixed(2)} AUC-PR`;
}
