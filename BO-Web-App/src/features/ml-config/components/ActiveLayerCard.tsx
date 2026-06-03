import { Cpu } from "lucide-react";
import type { ActiveLayer } from "@/features/transactions/api";
import { formatDateTime } from "@/features/transactions/format";

interface ActiveLayerCardProps {
  activeLayer: ActiveLayer;
  modelVersion: string;
  updatedAt: string;
  metrics: { precision: number; recall: number; aucPr: number } | null;
}

const LAYER_LABEL: Record<ActiveLayer, string> = {
  PRIMARY: "Primary model",
  BACKUP: "Backup logistic regression",
  STUB: "Rule-based stub",
};

const LAYER_HUE: Record<ActiveLayer, { bg: string; ring: string; dot: string; text: string }> = {
  PRIMARY: {
    bg: "bg-[#dff7ec]",
    ring: "ring-[#a4dec3]",
    dot: "bg-[#33cc8c]",
    text: "text-[#1c7a52]",
  },
  BACKUP: {
    bg: "bg-[#fdebe0]",
    ring: "ring-[#e9c1a0]",
    dot: "bg-[#cf821a]",
    text: "text-[#8a4a1c]",
  },
  STUB: {
    bg: "bg-[#fbe1e1]",
    ring: "ring-[#e6a4a4]",
    dot: "bg-[#c93b3a]",
    text: "text-[#8a2424]",
  },
};

/**
 * Compact horizontal layout — header on the left, status banner in the
 * middle, three model metrics (AUC-PR / Precision / Recall) on the right
 * so they all read on one line. Below: model version + last-updated.
 */
export function ActiveLayerCard({
  activeLayer,
  modelVersion,
  updatedAt,
  metrics,
}: ActiveLayerCardProps) {
  const hue = LAYER_HUE[activeLayer];
  return (
    <div className="flex shrink-0 flex-col gap-3 rounded-2xl bg-white p-5 shadow-[0_1px_2px_0_rgba(42,31,20,0.04),0_8px_24px_-6px_rgba(42,31,20,0.10)]">
      <div className="flex flex-wrap items-center gap-4">
        {/* Header — fixed width on the left */}
        <div className="flex shrink-0 items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-brand-cream-2/60">
            <Cpu className="size-4 text-brand-medium" aria-hidden />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-sans text-[14px] font-bold text-text-primary">
              Active layer
            </span>
            <span className="font-sans text-[11px] text-text-muted">
              Decides every transfer above the OTP step
            </span>
          </div>
        </div>

        {/* Status banner — sized to content so it doesn't waste horizontal space. */}
        <div
          className={[
            "flex shrink-0 items-center gap-3 rounded-xl px-4 py-2 ring-1 ring-inset",
            hue.bg,
            hue.ring,
          ].join(" ")}
        >
          <span
            className={[
              "size-[10px] shrink-0 rounded-full ring-2 ring-white/60",
              hue.dot,
            ].join(" ")}
            aria-hidden
          />
          <div className="flex flex-col leading-tight">
            <span className={["font-sans text-[13px] font-bold", hue.text].join(" ")}>
              {LAYER_LABEL[activeLayer]}
            </span>
            <span className={["font-sans text-[11px]", hue.text].join(" ")}>
              {activeLayer === "PRIMARY"
                ? "All systems green"
                : activeLayer === "BACKUP"
                  ? "Primary degraded · using fallback"
                  : "ML layers down · using rules"}
            </span>
          </div>
        </div>

        {/* Spacer */}
        <div className="min-w-0 flex-1" />

        {/* Three metrics — same row, separated by hairlines */}
        <div className="flex shrink-0 items-stretch gap-0 rounded-xl bg-brand-cream/50 px-1 py-1 ring-1 ring-inset ring-brand-cream-2/70">
          <Metric label="AUC-PR" value={fmt(metrics?.aucPr)} />
          <MetricDivider />
          <Metric label="Precision" value={fmt(metrics?.precision)} />
          <MetricDivider />
          <Metric label="Recall" value={fmt(metrics?.recall)} />
        </div>
      </div>

      {/* Meta row — version + last-updated */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-brand-cream-2/60 pt-2.5">
        <Meta label="Model version" value={modelVersion} mono />
        <Meta label="Last updated" value={formatDateTime(updatedAt)} />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-[78px] flex-col items-center justify-center px-3 py-1">
      <span className="font-sans text-[9px] font-bold uppercase tracking-[1px] text-text-label">
        {label}
      </span>
      <span className="font-mono text-[15px] font-bold tabular-nums text-text-primary leading-tight">
        {value}
      </span>
    </div>
  );
}

function MetricDivider() {
  return <div className="my-1 w-px self-stretch bg-brand-cream-2/70" aria-hidden />;
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-sans text-[10px] font-bold uppercase tracking-[1px] text-text-label">
        {label}
      </span>
      <span
        className={[
          "text-[12px] font-semibold text-text-primary",
          mono ? "font-mono" : "font-sans",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}

function fmt(n: number | undefined | null): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(3);
}
