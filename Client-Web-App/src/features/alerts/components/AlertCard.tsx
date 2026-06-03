import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Check,
  ChevronDown,
  Clock,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { withDemo } from "@/lib/demoMode";
import type { ClientAlert } from "@/features/dashboard/api";

interface AlertCardProps {
  alert: ClientAlert;
  /** Optional cancel-pending action — only wired for PENDING_ANALYST.
   *  Page is responsible for confirm dialog + API call. */
  onCancel?: () => void;
}

/**
 * One alert card on the Alerts page (Figma 208:49 / 208:98 / 208:139).
 *
 * Visual structure:
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ █  [RISK pill] [STATUS pill]                AMOUNT TND   │
 *   │ █  Transfer to {name}                       date · time  │
 *   │ █  @username · BIAT ••8421 → STB ••9947                  │
 *   │ █  Why we flagged this ▾                                 │
 *   │ █                                                        │
 *   │ █  ┌── why-expanded (accent-soft) ────────────────┐     │
 *   │ █  │ • reason 1                                   │     │
 *   │ █  │ • reason 2                                   │     │
 *   │ █  └──────────────────────────────────────────────┘     │
 *   │ █                                                        │
 *   │ █  [icon] {analyst-or-pending message}    [Δ trust] [→]  │
 *   └──────────────────────────────────────────────────────────┘
 *
 * The 6 px left bar takes the risk color (danger / warning / positive).
 * The whole "Why we flagged this" block is gated on `alert.mlReasons`
 * being non-empty.
 */
export function AlertCard({ alert, onCancel }: AlertCardProps) {
  const navigate = useNavigate();
  const [whyOpen, setWhyOpen] = useState(false);
  const hasReasons = !!alert.mlReasons?.length;

  return (
    <article className="flex items-stretch overflow-hidden rounded-[14px] border border-border-soft bg-surface-card">
      {/* Risk bar — 6 px wide, full-height accent stripe */}
      <div
        aria-hidden
        className={cn("w-[6px] shrink-0", riskBarColor(alert.riskLevel))}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ─── Top row ─────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-5">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <RiskPill risk={alert.riskLevel} />
              <StatusPill status={alert.status} />
            </div>
            <h2 className="font-sans text-[18px] font-bold leading-tight text-text-primary">
              Transfer to {alert.counterpartName}
            </h2>
            <p className="truncate font-sans text-[13px] text-text-secondary">
              {[
                alert.counterpartUsername ? `@${alert.counterpartUsername}` : null,
                alert.sourceMaskedAccount && alert.destMaskedAccount
                  ? `${alert.sourceMaskedAccount} → ${alert.destMaskedAccount}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5 whitespace-nowrap">
            <p className="font-sans text-[22px] font-bold leading-none text-text-primary">
              {formatTnd(alert.amount)} TND
            </p>
            <p className="font-sans text-[12px] text-text-secondary">
              {formatRelativeDate(alert.createdAt)}
            </p>
          </div>
        </div>

        {/* ─── Why-we-flagged toggle ───────────────────────────── */}
        {hasReasons && (
          <button
            type="button"
            onClick={() => setWhyOpen((v) => !v)}
            aria-expanded={whyOpen}
            className="flex items-center gap-1.5 px-6 pb-3.5 text-left font-sans text-[12px] font-semibold text-text-secondary underline outline-none hover:text-accent"
          >
            <span>{whyOpen ? "Hide why we flagged this" : "Why we flagged this"}</span>
            <ChevronDown
              className={cn(
                "size-3 transition-transform duration-300 ease-out",
                whyOpen && "rotate-180",
              )}
              strokeWidth={2.6}
              aria-hidden
            />
          </button>
        )}

        {/* ─── Why-expanded panel — animated grid-rows expand ─────
             Same pattern as the transactions row: outer grid switches
             between {@code 0fr} and {@code 1fr} so the reasons list
             slides in/out smoothly without us having to measure the
             content height in JS. */}
        {hasReasons && (
          <div
            aria-hidden={!whyOpen}
            className={cn(
              "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
              whyOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
            )}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="bg-accent-soft px-6 pb-[18px] pt-[14px]">
                <ul className="flex flex-col gap-2">
                  {alert.mlReasons!.map((reason, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2.5 font-sans text-[13px] leading-[1.5] text-text-primary"
                    >
                      <span
                        className="mt-[7px] size-1.5 shrink-0 rounded-full bg-text-secondary"
                        aria-hidden
                      />
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* ─── Footer — analyst review + actions ───────────────── */}
        <div className="flex flex-col items-start gap-3 border-t border-border-soft px-6 pb-[18px] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <DecisionBlock alert={alert} />

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {typeof alert.trustDelta === "number" && alert.trustDelta !== 0 && (
              <TrustDeltaPill delta={alert.trustDelta} status={alert.status} />
            )}
            {alert.status === "PENDING_ANALYST" && onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="flex h-[38px] items-center justify-center rounded-[9px] border border-border-soft bg-surface-card px-[14px] font-sans text-[12px] font-semibold text-negative transition-colors duration-150 ease-out hover:bg-negative-soft"
              >
                Cancel transfer
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                navigate(
                  withDemo(`/transactions?ref=${alert.transactionReference}`),
                )
              }
              className="flex h-[38px] items-center justify-center rounded-[9px] border border-border-soft bg-surface-card px-[14px] font-sans text-[12px] font-semibold text-text-secondary transition-colors duration-150 ease-out hover:bg-surface-soft hover:text-text-primary"
            >
              View transaction
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

/* ─── Subcomponents ───────────────────────────────────────────────────── */

function RiskPill({ risk }: { risk: ClientAlert["riskLevel"] }) {
  const variant =
    risk === "HIGH"
      ? { bg: "bg-negative-soft", dot: "bg-negative", label: "HIGH RISK" }
      : risk === "MED"
        ? { bg: "bg-warning-soft", dot: "bg-warning", label: "MEDIUM RISK" }
        : { bg: "bg-positive-soft", dot: "bg-positive", label: "LOW RISK" };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
        variant.bg,
      )}
    >
      <span className={cn("size-1.5 rounded-full", variant.dot)} aria-hidden />
      <span
        className="font-sans text-[11px] font-bold uppercase tracking-[0.08em] text-text-primary"
        style={{ fontVariationSettings: "'wdth' 100" }}
      >
        {variant.label}
      </span>
    </span>
  );
}

function StatusPill({ status }: { status: ClientAlert["status"] }) {
  const variant =
    status === "PENDING_ANALYST"
      ? {
          bg: "bg-warning-soft",
          dot: "bg-warning",
          label: "AWAITING REVIEW",
        }
      : status === "APPROVED"
        ? {
            bg: "bg-positive-soft",
            dot: "bg-positive",
            label: "APPROVED · MONEY SENT",
          }
        : status === "REJECTED"
          ? {
              bg: "bg-negative-soft",
              dot: "bg-negative",
              label: "REJECTED · NO MONEY MOVED",
            }
          : {
              bg: "bg-surface-raised",
              dot: "bg-text-muted",
              label: "CANCELLED",
            };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
        variant.bg,
      )}
    >
      <span className={cn("size-1.5 rounded-full", variant.dot)} aria-hidden />
      <span
        className="font-sans text-[11px] font-bold uppercase tracking-[0.08em] text-text-primary"
        style={{ fontVariationSettings: "'wdth' 100" }}
      >
        {variant.label}
      </span>
    </span>
  );
}

function DecisionBlock({ alert }: { alert: ClientAlert }) {
  if (alert.status === "PENDING_ANALYST") {
    return (
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-2xl bg-warning-soft">
          <Clock className="size-4 text-warning" strokeWidth={2.2} aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="font-sans text-[13px] font-bold text-text-primary">
            A PayZo analyst is reviewing your transfer
          </p>
          <p className="font-sans text-[12px] text-text-secondary">
            Usually resolved within a few minutes. We'll notify you when they
            decide.
          </p>
        </div>
      </div>
    );
  }

  if (alert.status === "CANCELLED") {
    return (
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-2xl bg-surface-raised">
          <X
            className="size-4 text-text-secondary"
            strokeWidth={2.4}
            aria-hidden
          />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="font-sans text-[13px] font-bold text-text-primary">
            You cancelled this transfer
          </p>
          <p className="font-sans text-[12px] text-text-secondary">
            No money moved. The pending transfer was released back to your
            account.
          </p>
        </div>
      </div>
    );
  }

  // APPROVED or REJECTED
  const approved = alert.status === "APPROVED";
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-2xl",
          approved ? "bg-positive-soft" : "bg-negative-soft",
        )}
      >
        {approved ? (
          <Check
            className="size-4 text-positive"
            strokeWidth={2.6}
            aria-hidden
          />
        ) : (
          <X className="size-4 text-negative" strokeWidth={2.8} aria-hidden />
        )}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="font-sans text-[13px] font-bold text-text-primary">
          {alert.decidedByName ? `Reviewed by ${alert.decidedByName}` : "Reviewed"}
          {alert.decidedAt && ` · ${formatLongDate(alert.decidedAt)}`}
        </p>
        {alert.decisionComment && (
          <p className="font-sans text-[12px] italic text-text-secondary">
            "{alert.decisionComment}"
          </p>
        )}
      </div>
    </div>
  );
}

function TrustDeltaPill({
  delta,
  status,
}: {
  delta: number;
  status: ClientAlert["status"];
}) {
  // Color follows decision tone:
  //  - REJECTED → danger-soft (always negative)
  //  - APPROVED with negative delta → warning-soft (small friction)
  //  - APPROVED with positive delta → positive-soft (rare, but possible)
  //  - PENDING / fallback → surface-raised
  const negative = delta < 0;
  const variant =
    status === "REJECTED"
      ? { bg: "bg-negative-soft", icon: "text-negative" }
      : negative
        ? { bg: "bg-warning-soft", icon: "text-warning" }
        : { bg: "bg-positive-soft", icon: "text-positive" };
  return (
    <span
      className={cn(
        "inline-flex h-[38px] items-center justify-center gap-2 rounded-[9px] px-[14px]",
        variant.bg,
      )}
    >
      {negative ? (
        <TrendingDown
          className={cn("size-3.5", variant.icon)}
          strokeWidth={2.6}
          aria-hidden
        />
      ) : (
        <TrendingUp
          className={cn("size-3.5", variant.icon)}
          strokeWidth={2.6}
          aria-hidden
        />
      )}
      <span className="font-sans text-[13px] font-bold text-text-primary">
        {delta > 0 ? `+${delta}` : delta} trust
      </span>
    </span>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────────────── */

function riskBarColor(risk: ClientAlert["riskLevel"]): string {
  if (risk === "HIGH") return "bg-negative";
  if (risk === "MED") return "bg-warning";
  return "bg-positive";
}

function formatTnd(value: number): string {
  const fixed = value.toFixed(3);
  const [intPart, frac] = fixed.split(".");
  return `${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${frac}`;
}

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dayKey = new Date(d);
  dayKey.setHours(0, 0, 0, 0);

  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (dayKey.getTime() === today.getTime()) return `Today · ${time}`;
  if (dayKey.getTime() === yesterday.getTime()) return `Yesterday · ${time}`;
  return `${d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })} · ${time}`;
}

function formatLongDate(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} · ${time}`;
}
