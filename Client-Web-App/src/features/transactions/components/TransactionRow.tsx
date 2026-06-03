import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  ChevronDown,
  Clock,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { resolveBackendUrl } from "@/lib/backendUrl";
import type { ClientTransaction } from "@/features/dashboard/api";
import { StatusPill } from "@/features/transactions/components/StatusPill";

interface TransactionRowProps {
  tx: ClientTransaction;
  expanded: boolean;
  onToggle: () => void;
}

/**
 * One row in the transactions list (Figma 207:77 / 207:117 ...). The row
 * has three visual states:
 *
 *  1. **Collapsed** — flat white background, transparent left bar.
 *  2. **Hover**     — subtle surface-raised tint.
 *  3. **Expanded**  — accent-soft background, 4 px accent left bar, plus
 *                     a 2-row metadata grid + "Report issue" action row
 *                     dropping below the row line.
 *
 * The collapsed half is one big <button> so the whole strip is clickable
 * with a single Enter / Space keystroke. The expanded half doesn't trap
 * focus — it just renders extra metadata.
 */
export function TransactionRow({ tx, expanded, onToggle }: TransactionRowProps) {
  const category = deriveCategory(tx);
  const status = tx.status ?? "APPROVED";
  const counterpartLabel = tx.internal
    ? "Internal transfer"
    : tx.counterpartName ?? "Unknown";

  return (
    <div className="flex items-stretch">
      {/* Selection bar — accent when expanded, transparent otherwise */}
      <div
        aria-hidden
        className={cn(
          "w-1 shrink-0 transition-colors duration-200 ease-out",
          expanded ? "bg-accent" : "bg-transparent",
        )}
      />

      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col transition-colors duration-200 ease-out",
          expanded ? "bg-accent-soft" : "bg-surface-card hover:bg-surface-raised",
        )}
      >
        {/* Collapsed row */}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex h-[72px] items-center justify-between gap-4 pl-5 pr-6 text-left outline-none focus-visible:bg-surface-raised"
        >
          <div className="flex min-w-0 items-center gap-3.5">
            <RowAvatar tx={tx} category={category} status={status} />
            <div className="flex min-w-0 flex-col gap-[3px]">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-sans text-[14px] font-bold text-text-primary">
                  {counterpartLabel}
                </p>
                {!tx.internal && <StatusPill status={status} />}
                {tx.origin && <OriginPill origin={tx.origin} />}
              </div>
              <p className="truncate font-sans text-[12px] text-text-secondary">
                {buildSubtitle(tx, category)}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-4">
            <div className="flex flex-col items-end gap-[1px]">
              <p
                className={cn(
                  "font-sans text-[15px] font-bold whitespace-nowrap",
                  amountColorClass(category, status),
                  // Strike through whenever the transfer never moved
                  // money — REJECTED/CANCELLED — so a received-rejected
                  // row doesn't read as "you got paid" at a glance.
                  (status === "REJECTED" || status === "CANCELLED") &&
                    "line-through decoration-[1.5px]",
                )}
              >
                {formatAmount(tx, category)}
              </p>
              <p className="font-sans text-[11px] text-text-secondary">
                {formatTime(tx.timestamp)}
              </p>
            </div>
            <ChevronDown
              className={cn(
                "size-3.5 text-text-secondary transition-transform duration-300 ease-out",
                expanded && "rotate-180",
              )}
              strokeWidth={2.4}
              aria-hidden
            />
          </div>
        </button>

        {/* Expanded detail — animated. The grid-rows trick lets us
            animate to the natural content height without measuring it
            in JS: the outer grid transitions between {@code 0fr} and
            {@code 1fr} (controlled by `aria-expanded`), and the inner
            cell keeps `min-h-0 overflow-hidden` so it clips to that
            row's height during the animation. The opacity fade hides
            the text crossing the threshold. */}
        <div
          aria-hidden={!expanded}
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
            expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <ExpandedDetail tx={tx} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Subcomponents ───────────────────────────────────────────────────── */

function OriginPill({ origin }: { origin: "PAYZO" | "EXTERNAL" }) {
  const isPayZo = origin === "PAYZO";
  return (
    <span
      className={cn(
        "inline-flex h-[18px] items-center rounded-full px-2 font-sans text-[10px] font-bold uppercase tracking-[0.05em]",
        isPayZo
          ? "bg-accent-soft text-accent"
          : "bg-surface-raised text-text-secondary",
      )}
      style={{ fontVariationSettings: "'wdth' 100" }}
    >
      {isPayZo ? "PayZo" : "External"}
    </span>
  );
}

/**
 * Row avatar — prefers the counterpart's profile picture when the BE
 * resolved one (P2P transfers between PayZo users). Falls back to the
 * direction icon for internal transfers, external CBS rows, or any P2P
 * where the counterpart wasn't on PayZo at the time of the transfer.
 *
 * The corner badge tracks the trx's *outcome*, not just its direction:
 *   - APPROVED  → green ↓ (received) or red ↑ (sent), money moved
 *   - PENDING_* → amber clock, money hasn't moved yet
 *   - REJECTED / CANCELLED → red ✕, money never moved
 * Picture also dims + desaturates for non-completed rows so the avatar
 * itself reads as "this didn't go through" at a glance.
 */
function RowAvatar({
  tx,
  category,
  status,
}: {
  tx: ClientTransaction;
  category: "SENT" | "RECEIVED" | "INTERNAL";
  status: NonNullable<ClientTransaction["status"]>;
}) {
  const failed = status === "REJECTED" || status === "CANCELLED";
  const pending =
    status === "PENDING_OTP" ||
    status === "PENDING_SCORING" ||
    status === "SUSPENDED_PENDING_ANALYST";

  // Resolve corner-badge appearance from outcome first, direction second.
  const badge = failed
    ? { bg: "bg-negative", icon: <X className="size-2.5 text-white" strokeWidth={3} /> }
    : pending
      ? { bg: "bg-warning", icon: <Clock className="size-2.5 text-white" strokeWidth={3} /> }
      : category === "RECEIVED"
        ? {
            bg: "bg-positive",
            icon: <ArrowDownLeft className="size-2.5 text-white" strokeWidth={3} />,
          }
        : category === "SENT"
          ? {
              bg: "bg-negative",
              icon: <ArrowUpRight className="size-2.5 text-white" strokeWidth={3} />,
            }
          : {
              bg: "bg-accent",
              icon: <ArrowLeftRight className="size-2.5 text-white" strokeWidth={3} />,
            };

  if (tx.counterpartProfilePictureUrl && category !== "INTERNAL") {
    return (
      <span className="relative flex size-10 shrink-0 items-center justify-center">
        <img
          src={resolveBackendUrl(tx.counterpartProfilePictureUrl)}
          alt=""
          className={cn(
            "size-10 rounded-full object-cover",
            (failed || pending) && "opacity-60 grayscale",
          )}
        />
        <span
          aria-hidden
          className={cn(
            "absolute -bottom-0.5 -right-0.5 flex size-[18px] items-center justify-center rounded-full border-2 border-surface-card",
            badge.bg,
          )}
        >
          {badge.icon}
        </span>
      </span>
    );
  }
  // No picture — render an outcome-aware initials/icon chip so the row
  // still telegraphs "this didn't move money" without depending on the
  // status pill alone.
  if (failed || pending) {
    return (
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-[20px]",
          failed ? "bg-negative-soft" : "bg-warning-soft",
        )}
      >
        {failed ? (
          <X className="size-5 text-negative" strokeWidth={2.4} aria-hidden />
        ) : (
          <Clock className="size-5 text-warning" strokeWidth={2.4} aria-hidden />
        )}
      </span>
    );
  }
  return <DirectionIcon category={category} />;
}

function DirectionIcon({
  category,
}: {
  category: "SENT" | "RECEIVED" | "INTERNAL";
}) {
  if (category === "SENT") {
    return (
      <span className="flex size-10 shrink-0 items-center justify-center rounded-[20px] bg-negative-soft">
        <ArrowUpRight
          className="size-5 text-negative"
          strokeWidth={2.4}
          aria-hidden
        />
      </span>
    );
  }
  if (category === "RECEIVED") {
    return (
      <span className="flex size-10 shrink-0 items-center justify-center rounded-[20px] bg-positive-soft">
        <ArrowDownLeft
          className="size-5 text-positive"
          strokeWidth={2.4}
          aria-hidden
        />
      </span>
    );
  }
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-[20px] bg-accent-soft">
      <ArrowLeftRight
        className="size-5 text-accent"
        strokeWidth={2.2}
        aria-hidden
      />
    </span>
  );
}

function ExpandedDetail({ tx }: { tx: ClientTransaction }) {
  const created = formatDateTime(tx.timestamp);
  const otpConfirmed = tx.otpConfirmedAt
    ? formatShortDateTime(tx.otpConfirmedAt)
    : "—";
  const banks = tx.sourceBankCode && tx.destBankCode
    ? `${tx.sourceBankCode}  ⇒  ${tx.destBankCode}`
    : "—";
  const motif = tx.description?.trim() || "—";
  // External / legacy CBS rows have no PayZo reference (the column maps
  // to {@code CbsTransaction.referenceByPayZo}, which is null for rows
  // that pre-dated PayZo). Show "—" so the cell isn't blank.
  const reference = tx.reference?.trim() || "—";
  // For non-internal rows the counterpart cell composes name → @username →
  // masked account (whichever pieces resolved). External CBS rows usually
  // have name + account only (no username); pre-Bug-1-fix rows had nothing
  // and collapsed to "—". The masked account ensures the cell still carries
  // useful info even when the name lookup misses entirely.
  const counterpartParts = [
    tx.counterpartName,
    tx.counterpartUsername ? `@${tx.counterpartUsername}` : null,
    tx.type === "DEBIT" ? tx.destMaskedAccount : tx.sourceMaskedAccount,
  ].filter(Boolean) as string[];
  const counterpartLine =
    counterpartParts.length > 0 ? counterpartParts.join(" · ") : "—";
  const fromLine = tx.internal
    ? `${tx.sourceBankCode ?? "—"} · ${tx.sourceMaskedAccount ?? "—"}`
    : tx.type === "DEBIT"
      ? `${tx.sourceMaskedAccount ?? "Your account"} (you)`
      : counterpartLine;
  const toLine = tx.internal
    ? `${tx.destBankCode ?? "—"} · ${tx.destMaskedAccount ?? "—"}`
    : tx.type === "DEBIT"
      ? counterpartLine
      : `${tx.destMaskedAccount ?? "Your account"} (you)`;
  const mlDecision =
    tx.riskLevel && typeof tx.mlScore === "number"
      ? `${tx.riskLevel} · ${tx.mlScore.toFixed(2)} / 1.00`
      : tx.riskLevel
        ? tx.riskLevel
        : "—";
  const finalStatus = tx.finalStatusLabel ?? humanizeStatus(tx.status);

  return (
    <div className="flex flex-col gap-[18px] pb-[22px] pl-[74px] pr-6 pt-[18px]">
      {/* Row 1 */}
      <div className="flex flex-wrap items-start gap-x-[20px] gap-y-3">
        <DetailCell label="Reference" mono>
          {reference}
        </DetailCell>
        <DetailCell label="Motif" width={160}>
          {motif}
        </DetailCell>
        <DetailCell label="From" width={240}>
          {fromLine}
        </DetailCell>
        <DetailCell label="To" width={240}>
          {toLine}
        </DetailCell>
        <DetailCell label="Banks" width={140}>
          {banks}
        </DetailCell>
      </div>

      {/* Row 2 */}
      <div className="flex flex-wrap items-start gap-x-[20px] gap-y-3">
        <DetailCell label="Created" width={200}>
          {created}
        </DetailCell>
        <DetailCell label="OTP confirmed" width={200}>
          {otpConfirmed}
        </DetailCell>
        <DetailCell label="ML decision" width={200}>
          {mlDecision}
        </DetailCell>
        <DetailCell label="Final status" width={240}>
          {finalStatus}
        </DetailCell>
      </div>

      {/* Action row */}
      <div className="flex items-center justify-end pt-[6px]">
        <button
          type="button"
          className="flex h-[38px] items-center justify-center rounded-[9px] border border-border-soft bg-surface-card px-[14px] font-sans text-[12px] font-semibold text-text-secondary transition-colors duration-150 ease-out hover:bg-surface-soft hover:text-text-primary"
        >
          Report issue
        </button>
      </div>
    </div>
  );
}

function DetailCell({
  label,
  width,
  mono,
  children,
}: {
  label: string;
  width?: number;
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col gap-1"
      style={width ? { width: `${width}px` } : undefined}
    >
      <p
        className="font-sans text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted"
        style={{ fontVariationSettings: "'wdth' 100" }}
      >
        {label}
      </p>
      <p
        className={cn(
          "text-[13px] text-text-primary",
          mono ? "font-mono font-medium" : "font-sans font-semibold",
        )}
      >
        {children}
      </p>
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────────────── */

function deriveCategory(
  tx: ClientTransaction,
): "SENT" | "RECEIVED" | "INTERNAL" {
  if (tx.internal) return "INTERNAL";
  return tx.type === "DEBIT" ? "SENT" : "RECEIVED";
}

function buildSubtitle(
  tx: ClientTransaction,
  category: "SENT" | "RECEIVED" | "INTERNAL",
): string {
  const handle = tx.counterpartUsername ? `@${tx.counterpartUsername}` : null;
  const route =
    tx.sourceMaskedAccount && tx.destMaskedAccount
      ? `${tx.sourceMaskedAccount} → ${tx.destMaskedAccount}`
      : null;
  const head = category === "INTERNAL" ? route : [handle, route].filter(Boolean).join(" · ");
  return tx.subtitleSuffix
    ? `${head ?? ""}${head ? " · " : ""}${tx.subtitleSuffix}`
    : head ?? "—";
}

function amountColorClass(
  category: "SENT" | "RECEIVED" | "INTERNAL",
  status: NonNullable<ClientTransaction["status"]>,
): string {
  // Money never moved → the amount has no positive/negative meaning yet.
  // Mute it so a rejected received row doesn't paint green next to a
  // "Rejected" status pill.
  if (status === "REJECTED" || status === "CANCELLED") return "text-text-muted";
  // Still in flight — analyst hasn't decided / OTP not confirmed / ML
  // still scoring. Don't commit to a color yet; stay neutral.
  if (
    status === "PENDING_OTP" ||
    status === "PENDING_SCORING" ||
    status === "SUSPENDED_PENDING_ANALYST"
  ) {
    return "text-text-muted";
  }
  // Approved — green for actually-received, red for actually-sent,
  // neutral dark for an internal swap between your own accounts.
  if (category === "RECEIVED") return "text-positive";
  if (category === "INTERNAL") return "text-text-primary";
  return "text-negative";
}

function formatAmount(
  tx: ClientTransaction,
  category: "SENT" | "RECEIVED" | "INTERNAL",
): string {
  const amt = formatTnd(tx.amount);
  if (category === "RECEIVED") return `+${amt} TND`;
  if (category === "SENT") return `−${amt} TND`;
  return `${amt} TND`;
}

function formatTnd(value: number): string {
  const fixed = Math.abs(value).toFixed(3);
  const [intPart, frac] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${grouped}.${frac}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return `${date} · ${time}`;
}

function formatShortDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return `${date} · ${time}`;
}

function humanizeStatus(s: ClientTransaction["status"]): string {
  switch (s) {
    case "APPROVED":
      return "Approved";
    case "PENDING_OTP":
      return "Awaiting OTP";
    case "PENDING_SCORING":
      return "Pending review";
    case "SUSPENDED_PENDING_ANALYST":
      return "Held by ML";
    case "REJECTED":
      return "Rejected";
    case "CANCELLED":
      return "Cancelled";
    default:
      return "—";
  }
}
