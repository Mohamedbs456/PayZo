import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/features/dashboard/components/Card";
import { useRecentFraudAlerts } from "@/features/dashboard/hooks";
import type { FraudAlertItem, RiskLevel } from "@/features/dashboard/api";
import { cn } from "@/lib/cn";

const COLOR_HIGH_BG = "#fde6e6";
const COLOR_HIGH_FG = "#c93b3a";
const COLOR_MED_BG = "#fbe9c9";
const COLOR_MED_FG = "#cf821a";
const COLOR_LOW_BG = "#dff5ec";
const COLOR_LOW_FG = "#3fa885";

/**
 * Card 7 — Recent fraud alerts. Twin of Card 6 (Recent transactions).
 *
 * Each row shows:
 *   - Sender name (bold) + risk pill (HIGH red / MED amber / LOW green)
 *   - "−<amount> TND · <sourceBank>→<destBank>" muted
 *   - Right: time-ago ("12m", "2h", "1d") tinted to match the risk
 *
 * Source: GET /api/v1/fraud-alerts?status=PENDING (latest 3, sorted client-side
 * by createdAt desc). `totalElements` from the same response drives the
 * "X needing decision" subtitle.
 */
export function RecentFraudAlertsCard({ className }: { className?: string } = {}) {
  const { data, loading, error, retry } = useRecentFraudAlerts(3);
  const totalPending = data?.totalPending ?? 0;
  const items = data?.recent ?? [];

  return (
    <Card to="/fraud-alerts" className={className}>
      <CardHeader pendingCount={totalPending} />
      {loading ? (
        <ListSkeleton />
      ) : error ? (
        <ListError onRetry={retry} />
      ) : items.length === 0 ? (
        <ListEmpty />
      ) : (
        <List items={items} />
      )}
    </Card>
  );
}

function CardHeader({ pendingCount }: { pendingCount: number }) {
  return (
    <div className="flex w-full shrink-0 items-center gap-2 overflow-hidden px-[22px] pt-2 pb-1.5">
      <div className="flex min-w-0 shrink flex-col gap-0.5 overflow-hidden whitespace-nowrap leading-none">
        <p className="truncate font-sans text-[14px] font-bold text-text-primary">
          Recent fraud alerts
        </p>
        <p className="truncate font-sans text-[11px] text-text-muted">
          {pendingCount === 1
            ? "1 needing decision"
            : `${pendingCount.toLocaleString()} needing decision`}
        </p>
      </div>
      <Link
        to="/fraud-alerts"
        className="ml-auto flex shrink-0 items-center gap-1 overflow-hidden text-brand-medium transition-transform duration-150 ease-out hover:translate-x-0.5"
      >
        <span className="whitespace-nowrap font-sans text-[11px] font-semibold">
          View all
        </span>
        <ArrowRight className="size-3 shrink-0" strokeWidth={2.4} />
      </Link>
    </div>
  );
}

function List({ items }: { items: FraudAlertItem[] }) {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <Divider tone="strong" />
      {items.map((alert, i) => (
        <div key={alert.id} className="flex shrink-0 flex-col">
          <Row alert={alert} />
          {i < items.length - 1 && <Divider tone="soft" />}
        </div>
      ))}
    </div>
  );
}

function Row({ alert }: { alert: FraudAlertItem }) {
  return (
    <div className="flex w-full shrink-0 items-center gap-3 overflow-hidden px-[22px] py-2">
      <div className="flex min-w-0 flex-1 flex-col items-start gap-px overflow-hidden whitespace-nowrap leading-none">
        <div className="flex w-full items-center gap-2 overflow-hidden">
          <p className="min-w-0 truncate font-sans text-[12px] font-semibold text-text-primary">
            {alert.clientName}
          </p>
          <RiskPill level={alert.riskLevel} />
        </div>
        <p className="truncate font-sans text-[10px] text-text-muted">
          <span className="font-semibold text-negative">
            −{formatAmount(alert.amount)} TND
          </span>
          {" · "}
          {alert.sourceBankCode}→{alert.destBankCode}
        </p>
      </div>
      <p className="shrink-0 whitespace-nowrap font-sans text-[10px] font-medium text-text-primary">
        {timeAgo(alert.createdAt)}
      </p>
    </div>
  );
}

function RiskPill({ level }: { level: RiskLevel }) {
  const { bg, fg } = riskColor(level);
  return (
    <span
      className="flex shrink-0 items-center overflow-hidden rounded px-1.5 py-px"
      style={{ backgroundColor: bg }}
    >
      <span
        className="whitespace-nowrap font-sans text-[9px] font-bold tracking-[1.08px]"
        style={{ color: fg }}
      >
        {level === "MEDIUM" ? "MED" : level}
      </span>
    </span>
  );
}

function Divider({ tone }: { tone: "strong" | "soft" }) {
  return (
    <div
      className={cn(
        "h-px w-full shrink-0",
        tone === "strong" ? "bg-brand-cream-2" : "bg-[#f0e4d0]",
      )}
      aria-hidden
    />
  );
}

function ListSkeleton() {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <Divider tone="strong" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex shrink-0 flex-col">
          <div className="flex w-full items-center gap-3 px-[22px] py-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="h-[10px] w-2/3 animate-pulse rounded bg-brand-cream-2" />
              <span className="h-[8px] w-1/2 animate-pulse rounded bg-brand-cream-2/60" />
            </div>
            <span className="h-[10px] w-[24px] animate-pulse rounded bg-brand-cream-2" />
          </div>
          {i < 2 && <Divider tone="soft" />}
        </div>
      ))}
    </div>
  );
}

function ListEmpty() {
  return (
    <div className="flex min-h-0 w-full flex-1 items-center justify-center px-[22px] py-6">
      <p className="font-sans text-[12px] text-text-muted">
        No pending alerts.
      </p>
    </div>
  );
}

function ListError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-0 w-full flex-1 items-center justify-center gap-2 px-[22px] py-6">
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

function riskColor(level: RiskLevel): { bg: string; fg: string } {
  if (level === "HIGH") return { bg: COLOR_HIGH_BG, fg: COLOR_HIGH_FG };
  if (level === "MEDIUM") return { bg: COLOR_MED_BG, fg: COLOR_MED_FG };
  return { bg: COLOR_LOW_BG, fg: COLOR_LOW_FG };
}

function formatAmount(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString();
}

/** Compact "time since" — "12m", "2h", "1d". */
function timeAgo(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
