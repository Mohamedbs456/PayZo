import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  Clock,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";
import { withDemo } from "@/lib/demoMode";
import { resolveBackendUrl } from "@/lib/backendUrl";
import type { ClientTransaction } from "@/features/dashboard/api";
import { StatusPill } from "@/features/transactions/components/StatusPill";

interface RecentTransactionsCardProps {
  transactions: ClientTransaction[];
}

/**
 * Wide card (Figma 109:55). Header with title + "Last 4 across all
 * your accounts" subtitle + "View all →" link. Below that, up to 4
 * transaction rows with avatar/badge/name/timestamp/amount.
 *
 * Empty-state copy is a brand-new client (no transactions yet).
 */
export function RecentTransactionsCard({
  transactions,
}: RecentTransactionsCardProps) {
  const visible = transactions.slice(0, 3);

  return (
    <Link
      to={withDemo("/transactions")}
      aria-label="View all transactions"
      className="group flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-border-soft bg-surface-card shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] transition-transform duration-150 ease-out hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-soft"
    >
      <div className="flex shrink-0 items-start justify-between gap-3 px-6 pb-3 pt-4">
        <div className="flex flex-col gap-1">
          <h3 className="font-sans text-[18px] font-semibold leading-tight text-text-primary">
            Recent transactions
          </h3>
          <p className="font-sans text-[12px] text-text-muted">
            Last {visible.length || 0} across all your accounts
          </p>
        </div>
        <span className="flex items-center gap-1.5 self-end pb-1 font-sans text-[12px] font-semibold text-text-secondary transition-colors duration-150 ease-out group-hover:text-accent">
          View all
          <ArrowRight
            className="size-3.5 transition-transform duration-150 ease-out group-hover:translate-x-0.5"
            strokeWidth={2.4}
            aria-hidden
          />
        </span>
      </div>

      {/* List body — non-scrolling. The card is sized so the 3 rows
          always fit; if anything overflows it gets clipped, which is
          preferable to either page scroll or in-card scroll. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 border-t border-border-soft px-6 py-12 text-center">
            <p className="font-sans text-[14px] font-semibold text-text-primary">
              No transactions yet
            </p>
            <p className="font-sans text-[12px] text-text-muted">
              Send your first transfer and it'll show up here.
            </p>
          </div>
        ) : (
          visible.map((tx) => <TransactionRow key={tx.id} tx={tx} />)
        )}
      </div>
    </Link>
  );
}

function TransactionRow({ tx }: { tx: ClientTransaction }) {
  const isCredit = tx.type === "CREDIT";
  const initials = deriveInitials(tx.counterpartName ?? "?");
  const status = tx.status ?? "APPROVED";
  // Visual state — captures whether the money actually moved, so the
  // row stops lying about completed-vs-not. Drives badge color/icon,
  // amount color, and the strike-through.
  //
  //   - completed : APPROVED. Money landed. Green for received,
  //                 dark for sent. A "Cleared" pill is added when
  //                 the trx was MED-flagged and the analyst approved
  //                 it (that's worth highlighting).
  //   - pending   : awaiting OTP / scoring / analyst review. Money
  //                 hasn't moved yet either way. Amber dot, neutral
  //                 amount color, "Pending review" status pill.
  //   - failed    : REJECTED or CANCELLED. Money never moved. Red
  //                 corner badge with an X, amount struck through,
  //                 status pill makes the reason explicit.
  const displayState: "completed" | "pending" | "failed" =
    status === "APPROVED"
      ? "completed"
      : status === "REJECTED" || status === "CANCELLED"
        ? "failed"
        : "pending";
  const cleared = tx.riskLevel === "MED" && status === "APPROVED";

  // Corner badge over the avatar — direction icon for completed rows,
  // hourglass for pending, X for failed (matches the row's "did money
  // move?" answer at a glance).
  const badge = (() => {
    if (displayState === "failed") {
      return { bg: "bg-negative", icon: <X className="size-2.5 text-white" strokeWidth={3} /> };
    }
    if (displayState === "pending") {
      return { bg: "bg-warning", icon: <Clock className="size-2.5 text-white" strokeWidth={3} /> };
    }
    return {
      bg: isCredit ? "bg-positive" : "bg-negative",
      icon: isCredit ? (
        <ArrowDown className="size-2.5 text-white" strokeWidth={3} />
      ) : (
        <ArrowUp className="size-2.5 text-white" strokeWidth={3} />
      ),
    };
  })();

  // Amount color: green only for actually-received money, red for
  // actually-sent money. Pending = muted (we don't know yet). Failed =
  // muted + strikethrough so it visually reads "didn't happen".
  const amountColor =
    displayState === "completed"
      ? isCredit
        ? "text-positive"
        : "text-negative"
      : "text-text-muted";

  return (
    <div className="flex items-center gap-4 border-t border-border-soft px-6 py-3">
      <div className="relative size-12 shrink-0">
        {tx.counterpartProfilePictureUrl ? (
          <img
            src={resolveBackendUrl(tx.counterpartProfilePictureUrl)}
            alt=""
            className={cn(
              "absolute left-0 top-0 size-11 rounded-full object-cover",
              displayState !== "completed" && "opacity-60 grayscale",
            )}
          />
        ) : (
          <div className="absolute left-0 top-0 flex size-11 items-center justify-center rounded-full bg-accent-soft">
            <span className="font-sans text-[14px] font-bold text-accent">
              {initials}
            </span>
          </div>
        )}
        <div
          className={cn(
            "absolute left-7 top-7 flex size-5 items-center justify-center rounded-full border-2 border-surface-card",
            badge.bg,
          )}
          aria-hidden
        >
          {badge.icon}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-sans text-[14px] font-semibold text-text-primary">
            {tx.internal ? "Internal transfer" : (tx.counterpartName ?? "Unknown")}
          </p>
          {/* Status pill — render whenever the row isn't a clean
              APPROVED, so the user always sees *why* a trx looks off
              (rejected / cancelled / awaiting review). */}
          {status !== "APPROVED" && <StatusPill status={status} />}
          {cleared && (
            <span className="inline-flex items-center gap-1 rounded-full bg-positive-soft pl-1.5 pr-2 py-0.5 text-positive">
              <Check className="size-2.5" strokeWidth={3.2} aria-hidden />
              <span
                className="font-sans text-[9px] font-semibold uppercase tracking-[0.08em]"
                style={{ fontVariationSettings: "'wdth' 100" }}
              >
                Cleared
              </span>
            </span>
          )}
        </div>
        <p
          className="whitespace-pre font-mono text-[11px] text-text-muted"
          title={new Date(tx.timestamp).toLocaleString()}
        >
          {formatRelativeStamp(tx.timestamp)}{"  ·  "}
          {tx.reference}
        </p>
      </div>

      <p
        className={cn(
          "shrink-0 font-sans text-[16px] font-bold tracking-tight",
          amountColor,
          displayState === "failed" && "line-through decoration-[1.5px]",
        )}
      >
        {isCredit ? "+ " : "− "}
        {formatTndPlain(tx.amount)} TND
      </p>
    </div>
  );
}

function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.slice(0, 2) ?? "??").toUpperCase();
}

function formatTndPlain(value: number): string {
  // 250 → "250.000", 1200 → "1,200.000", 4500 → "4,500.000"
  const fixed = Math.abs(value).toFixed(3);
  const [intPart, fracPart] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${grouped}.${fracPart}`;
}

function formatRelativeStamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `Today · ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return `Yesterday · ${time}`;
  }
  const month = d.toLocaleString("en-US", { month: "short" });
  return `${month} ${d.getDate()} · ${time}`;
}
