import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/features/dashboard/components/Card";
import { useRecentTransactions } from "@/features/dashboard/hooks";
import type { TransactionListItem } from "@/features/dashboard/api";
import { cn } from "@/lib/cn";
import { formatAccountNumber } from "@/features/transactions/format";

/**
 * Card 6 — Recent transactions list. Latest 3 platform-wide transactions
 * sorted by `createdAt` desc (default sort on `/api/v1/transactions`).
 *
 * Each row shows:
 *   - Avatar with the sender's initials
 *   - "Sender Name → Receiver Name" (bold)
 *   - "<sourceBank> → <destBank> · TRX-XXXX" (muted)
 *   - Right: amount in TND (no sign, neutral) + HH:MM time
 *
 * If the receiver isn't a PayZo client (no destClientCin), `party` comes
 * back null — we then fall back to "<destAccountNumber>" so something
 * meaningful still renders.
 */
export function RecentTransactionsCard() {
  const { data, loading, error, retry } = useRecentTransactions(3);

  return (
    <Card to="/transactions">
      <CardHeader />
      {loading ? (
        <ListSkeleton />
      ) : error ? (
        <ListError onRetry={retry} />
      ) : !data || data.length === 0 ? (
        <ListEmpty />
      ) : (
        <List items={data} />
      )}
    </Card>
  );
}

function CardHeader() {
  return (
    <div className="flex w-full shrink-0 items-center gap-2 overflow-hidden px-[22px] pt-2 pb-1.5">
      <div className="flex min-w-0 shrink flex-col gap-0.5 overflow-hidden whitespace-nowrap leading-none">
        <p className="truncate font-sans text-[14px] font-bold text-text-primary">
          Recent transactions
        </p>
        <p className="truncate font-sans text-[11px] text-text-muted">
          Last 3 across the platform
        </p>
      </div>
      <Link
        to="/transactions"
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

function List({ items }: { items: TransactionListItem[] }) {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <Divider tone="strong" />
      {items.map((tx, i) => (
        <div key={tx.id} className="flex shrink-0 flex-col">
          <Row tx={tx} />
          {i < items.length - 1 && <Divider tone="soft" />}
        </div>
      ))}
    </div>
  );
}

function Row({ tx }: { tx: TransactionListItem }) {
  const receiver =
    tx.party ?? (tx.destAccountNumber ? formatAccountNumber(tx.destAccountNumber) : null);
  return (
    <div className="flex w-full shrink-0 items-center gap-3 overflow-hidden px-[22px] py-2">
      <div className="flex min-w-0 flex-1 flex-col items-start gap-px overflow-hidden whitespace-nowrap leading-none">
        <p className="truncate font-sans text-[12px] font-semibold text-text-primary">
          {tx.clientName} → {receiver}
        </p>
        <p className="truncate font-sans text-[10px] text-text-muted">
          {tx.sourceBankCode} → {tx.destBankCode} · {tx.reference}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-px overflow-hidden whitespace-nowrap leading-none">
        <p className="font-sans text-[12px] font-bold text-text-primary">
          {formatAmount(tx.amount)} TND
        </p>
        <p className="font-sans text-[10px] text-text-muted">
          {formatTime(tx.createdAt)}
        </p>
      </div>
    </div>
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
            <span className="h-[10px] w-[64px] animate-pulse rounded bg-brand-cream-2" />
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
        No transactions yet.
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

function formatAmount(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString();
}

function formatTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
