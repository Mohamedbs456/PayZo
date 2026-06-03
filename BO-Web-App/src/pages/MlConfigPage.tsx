import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { isSuperAdmin } from "@/lib/auth/session";
import {
  fetchMlConfig,
  fetchMlMetrics,
  type MlConfig,
  type MlMetrics,
} from "@/features/ml-config/api";
import { ActiveLayerCard } from "@/features/ml-config/components/ActiveLayerCard";
import { ThresholdsCard } from "@/features/ml-config/components/ThresholdsCard";
import { ThresholdReportsCard } from "@/features/ml-config/components/ThresholdReportsCard";

/**
 * ML configuration page (D35 / Impact 8). Single-screen layout — never
 * scrolls at the page level (per the layout contract); only the proposals
 * card scrolls internally if there are too many to fit.
 *
 * Top row : compact ActiveLayer card (status + 3 metrics + meta).
 * Bottom  : Thresholds (left) | Proposals (right), splitting the rest.
 */
export function MlConfigPage() {
  const isSa = isSuperAdmin();

  const [config, setConfig] = useState<MlConfig | null>(null);
  const [metrics, setMetrics] = useState<MlMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetchMlConfig(controller.signal),
      fetchMlMetrics(controller.signal).catch(() => null),
    ])
      .then(([cfg, m]) => {
        setConfig(cfg);
        setMetrics(m);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        console.error("[ml-config] initial load failed", cause);
        setError(cause instanceof Error ? cause.message : "Failed to load");
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4 overflow-hidden p-5">
      {error && (
        <div className="rounded-2xl bg-white p-6 shadow-[0_1px_2px_0_rgba(42,31,20,0.04),0_8px_24px_-6px_rgba(42,31,20,0.10)]">
          <p className="font-sans text-[13px] font-semibold text-negative">
            Couldn't load ML config
          </p>
          <p className="font-sans text-[12px] text-text-muted">{error}</p>
        </div>
      )}

      {!error && !config && (
        <div className="flex items-center gap-2 rounded-2xl bg-white p-6 font-sans text-[12px] text-text-muted shadow-[0_1px_2px_0_rgba(42,31,20,0.04),0_8px_24px_-6px_rgba(42,31,20,0.10)]">
          <Loader2 className="size-3 animate-spin" aria-hidden />
          Loading ML configuration…
        </div>
      )}

      {config && (
        <>
          <ActiveLayerCard
            activeLayer={config.activeLayer}
            modelVersion={config.modelVersion}
            updatedAt={config.updatedAt}
            metrics={metrics}
          />

          {/* SA sees thresholds editor + proposals queue side-by-side.
              Analyst sees the proposal authoring card full-width — the
              proposals list is SA-only (review surface). */}
          <div
            className={[
              "grid min-h-0 flex-1 grid-cols-1 gap-4",
              isSa ? "lg:grid-cols-[1fr_1fr]" : "",
            ].join(" ")}
          >
            <ThresholdsCard
              config={config}
              canEdit={isSa}
              onSaved={(next) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        thresholdLowMedium: next.thresholdLowMedium,
                        thresholdMediumHigh: next.thresholdMediumHigh,
                        updatedAt: new Date().toISOString(),
                      }
                    : prev,
                )
              }
            />
            {isSa && <ThresholdReportsCard canMarkRead={isSa} />}
          </div>
        </>
      )}
    </div>
  );
}
