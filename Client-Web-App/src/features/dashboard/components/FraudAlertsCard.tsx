import { AlertTriangle, ArrowRight, ShieldCheck, X } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";
import { withDemo } from "@/lib/demoMode";
import type { ClientAlert, ClientAlertSummary } from "@/features/dashboard/api";

/**
 * Right-side smaller card (Figma 109:110). Header with title + status
 * count + "+N" badge for additional unread alerts + "View all →" link.
 * Two alert rows max in this preview. Empty-state when there are no
 * pending or recent alerts.
 */
export function FraudAlertsCard({ summary }: { summary: ClientAlertSummary }) {
  const visible = summary.alerts.slice(0, 2);
  const extra = Math.max(0, summary.totalCount - visible.length);
  const subtitle = buildSubtitle(summary);

  return (
    <Link
      to={withDemo("/alerts")}
      aria-label="View all fraud alerts"
      className="group flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-border-soft bg-surface-card shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] transition-transform duration-150 ease-out hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-soft"
    >
      <div className="flex shrink-0 items-start justify-between gap-3 px-6 pb-3 pt-4">
        <div className="flex flex-col gap-1">
          <h3 className="font-sans text-[18px] font-semibold leading-tight text-text-primary">
            Fraud alerts
          </h3>
          <p className="font-sans text-[12px] text-text-muted">{subtitle}</p>
        </div>
        <div className="flex items-center gap-1.5 self-end pb-1">
          {extra > 0 && (
            <span className="inline-flex items-center rounded-full bg-negative px-1.5 py-0.5 font-sans text-[10px] font-bold text-white">
              +{extra}
            </span>
          )}
          <span className="flex items-center gap-1.5 font-sans text-[12px] font-semibold text-text-secondary transition-colors duration-150 ease-out group-hover:text-accent">
            View all
            <ArrowRight
              className="size-3.5 transition-transform duration-150 ease-out group-hover:translate-x-0.5"
              strokeWidth={2.4}
              aria-hidden
            />
          </span>
        </div>
      </div>

      {/* List body — non-scrolling, hard-capped at 2 alerts above. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 border-t border-border-soft px-6 py-12 text-center">
            <ShieldCheck
              className="size-8 text-positive"
              strokeWidth={1.6}
              aria-hidden
            />
            <p className="font-sans text-[14px] font-semibold text-text-primary">
              No alerts on your account
            </p>
            <p className="font-sans text-[12px] text-text-muted">
              We'll notify you here if anything looks off.
            </p>
          </div>
        ) : (
          visible.map((alert) => <AlertRow key={alert.id} alert={alert} />)
        )}
      </div>
    </Link>
  );
}

function AlertRow({ alert }: { alert: ClientAlert }) {
  const isRejected = alert.status === "REJECTED";
  const isPending = alert.status === "PENDING_ANALYST";

  return (
    <div className="flex flex-col gap-2 border-t border-border-soft px-6 py-3 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl",
            isRejected ? "bg-negative-soft" : "bg-warning-soft",
          )}
          aria-hidden
        >
          {isRejected ? (
            <X className="size-[18px] text-negative" strokeWidth={2.4} />
          ) : (
            <AlertTriangle
              className="size-[18px] text-warning"
              strokeWidth={2.4}
            />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="truncate font-sans text-[13px] font-semibold text-text-primary">
            Transfer to {alert.counterpartName}
          </p>
          <p
            className="whitespace-pre font-mono text-[10px] text-text-muted"
            title={new Date(alert.createdAt).toLocaleString()}
          >
            {formatRelativeShort(alert.createdAt)} · {alert.transactionReference}
          </p>
        </div>
        <p className="shrink-0 font-sans text-[14px] font-bold text-text-primary">
          − {formatTndPlainShort(alert.amount)} TND
        </p>
      </div>

      <div className="flex items-center pl-[52px]">
        {isPending && (
          <span
            className="inline-flex items-center rounded-full bg-warning pl-2 pr-2.5 py-1 font-sans text-[9px] font-semibold uppercase tracking-[0.1em] text-white"
            style={{ fontVariationSettings: "'wdth' 100" }}
          >
            Under review
          </span>
        )}
        {isRejected && (
          <span
            className="inline-flex items-center rounded-full bg-negative pl-2 pr-2.5 py-1 font-sans text-[9px] font-semibold uppercase tracking-[0.08em] text-white"
            style={{ fontVariationSettings: "'wdth' 100" }}
          >
            Rejected
          </span>
        )}
      </div>

      {isRejected && alert.reason && (
        <p className="font-sans text-[11px] leading-[1.5] text-negative">
          {alert.reason}
        </p>
      )}
    </div>
  );
}

function buildSubtitle(s: ClientAlertSummary): string {
  const parts: string[] = [];
  if (s.underReviewCount > 0) {
    parts.push(`${s.underReviewCount} under review`);
  }
  if (s.rejectedCount > 0) {
    parts.push(`${s.rejectedCount} rejected`);
  }
  return parts.length === 0 ? "No alerts on your account" : parts.join(" · ");
}

function formatTndPlainShort(value: number): string {
  // Whole-number display for the alert chip (Figma uses no decimals there).
  const abs = Math.abs(value);
  return abs.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function formatRelativeShort(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24 && d.toDateString() === now.toDateString()) {
    return `${diffH}h ago`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  const month = d.toLocaleString("en-US", { month: "short" });
  return `${month} ${d.getDate()}`;
}
