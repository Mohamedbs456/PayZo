import { TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardHeader } from "@/features/dashboard/components/Card";
import { useDashboard } from "@/features/dashboard/hooks";

const COLOR_GOOD = "#3fa885";
const COLOR_BAD = "#c93b3a";

/**
 * Card 3 — FRAUD RATE · THIS WEEK.
 *
 *   Title:    FRAUD RATE · THIS WEEK   [pill: IMPROVING / RISING]
 *   Big:      <rate>%   (44px digit, 22px % sign)
 *   Footer:   ↘ −0.14 pp · vs prior period
 *
 * Both the headline rate and the comparison are derived from
 * `analystDashboard.kpis.fraudConfirmedRate` (period-scoped: alerts vs
 * transactions in the window), with two parallel calls:
 *   - period=7d  → THIS WEEK
 *   - period=30d → 30-day window (used to derive the prior 23-day rate
 *                   by subtracting the 7d slice from it)
 */
export function FraudRateCard() {
  const this7 = useDashboard("7d");
  const last30 = useDashboard("30d");

  const loading = this7.loading || last30.loading;
  const error = this7.error ?? last30.error;
  const retry = () => {
    this7.retry();
    last30.retry();
  };

  const k7 = this7.data?.analystDashboard?.kpis;
  const k30 = last30.data?.analystDashboard?.kpis;

  // This-week rate (fraction). Bail to 0 if no data.
  const thisRate = k7?.fraudConfirmedRate ?? 0;
  const ratePercent = thisRate * 100;

  // Derive the prior-period rate by subtracting this week's totals from
  // the 30-day rolling window. Returns `null` when there isn't enough
  // history (prior window has 0 transactions).
  let priorRate: number | null = null;
  if (k7 && k30) {
    const tx7 = k7.totalTransactionCount;
    const tx30 = k30.totalTransactionCount;
    const alerts7 = (k7.fraudConfirmedRate ?? 0) * tx7;
    const alerts30 = (k30.fraudConfirmedRate ?? 0) * tx30;
    const priorTx = tx30 - tx7;
    if (priorTx > 0) {
      priorRate = (alerts30 - alerts7) / priorTx;
    }
  }

  const deltaPp: number | null =
    priorRate === null ? null : (thisRate - priorRate) * 100;
  // Treat ≈0 deltas as no signal so we don't claim an "improvement" when
  // it's just noise. Threshold: 0.05 pp.
  const trend: "improving" | "rising" | null =
    deltaPp === null
      ? null
      : Math.abs(deltaPp) < 0.05
        ? null
        : deltaPp < 0
          ? "improving"
          : "rising";

  return (
    <Card to="/fraud-alerts" className="px-[22px] py-[18px]">
      <CardHeader
        title="FRAUD RATE · THIS WEEK"
        rightSlot={trend ? <TrendPill trend={trend} /> : null}
      />

      <div className="mt-3 flex min-h-0 flex-1 flex-col justify-between overflow-hidden">
        {loading ? (
          <ValueSkeleton />
        ) : error ? (
          <ErrorState onRetry={retry} />
        ) : (
          <div className="flex items-baseline gap-1 overflow-hidden whitespace-nowrap leading-none">
            <p className="font-sans text-[44px] font-bold text-text-primary">
              {ratePercent.toFixed(2)}
            </p>
            <p className="font-sans text-[22px] font-bold text-brand-medium">
              %
            </p>
          </div>
        )}

        {!loading && !error && deltaPp !== null && (
          <div className="flex w-full items-center gap-1.5 overflow-hidden">
            {trend === "improving" ? (
              <TrendingDown
                className="size-3.5 shrink-0"
                style={{ color: COLOR_GOOD }}
                strokeWidth={2.4}
              />
            ) : (
              <TrendingUp
                className="size-3.5 shrink-0"
                style={{ color: COLOR_BAD }}
                strokeWidth={2.4}
              />
            )}
            <p
              className="whitespace-nowrap font-sans text-[12px] font-semibold"
              style={{ color: trend === "improving" ? COLOR_GOOD : COLOR_BAD }}
            >
              {deltaPp < 0 ? "−" : "+"}
              {Math.abs(deltaPp).toFixed(2)} pp
            </p>
            <p className="whitespace-nowrap font-sans text-[12px] text-text-muted">
              vs prior period
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

function TrendPill({ trend }: { trend: "improving" | "rising" }) {
  const good = trend === "improving";
  const bg = good ? "#dff5ec" : "#fde6e6";
  const fg = good ? COLOR_GOOD : COLOR_BAD;
  const label = good ? "IMPROVING" : "RISING";
  return (
    <span
      className="flex shrink-0 items-center gap-1.5 overflow-hidden rounded-full px-2 py-[3px]"
      style={{ backgroundColor: bg }}
    >
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: fg }}
      />
      <span
        className="whitespace-nowrap font-sans text-[9px] font-bold tracking-[1.08px]"
        style={{ color: fg }}
      >
        {label}
      </span>
    </span>
  );
}

function ValueSkeleton() {
  return (
    <div className="flex items-baseline gap-1">
      <span className="block h-[44px] w-[110px] animate-pulse rounded bg-brand-cream-2" />
      <span className="block h-[22px] w-[18px] animate-pulse rounded bg-brand-cream-2" />
    </div>
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
