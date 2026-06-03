import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, ChevronRight } from "lucide-react";
import { BankAvatar } from "@/features/banks/components/BankAvatar";
import type { TransactionListItem } from "../api";
import { TransactionStatusPill } from "./TransactionStatusPill";
import { RiskBadge } from "./RiskBadge";
import { TransactionRowExpanded } from "./TransactionRowExpanded";
import { formatAmount, formatRelative } from "../format";

interface TransactionsTableProps {
  items: TransactionListItem[];
  loadingInitial: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  onLoadMore: () => void;
}

const COLUMN_TEMPLATE =
  "minmax(140px,1.1fr) minmax(200px,1.6fr) minmax(180px,1.4fr) minmax(140px,1fr) minmax(110px,0.7fr) minmax(80px,0.5fr) minmax(110px,0.7fr)";

/**
 * View-only transactions table (D32 / Impact 9). One row per transaction,
 * click anywhere to expand for the full detail view. Infinite scroll +
 * IntersectionObserver-based "load more" sentinel — same pattern locked in
 * for Clients/Accounts.
 */
export function TransactionsTable({
  items,
  loadingInitial,
  loadingMore,
  hasMore,
  error,
  onLoadMore,
}: TransactionsTableProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!hasMore || loadingInitial) return;
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            onLoadMoreRef.current();
            break;
          }
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadingInitial]);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_0_rgba(42,31,20,0.04),0_8px_24px_-6px_rgba(42,31,20,0.10)]">
      {/* Sticky header */}
      <div
        className="grid shrink-0 items-center gap-4 border-b border-brand-cream-2 bg-brand-cream/40 px-6 py-3 font-sans text-[10px] font-bold uppercase tracking-[1.2px] text-text-label"
        style={{ gridTemplateColumns: COLUMN_TEMPLATE }}
      >
        <span>Reference</span>
        <span>Sender</span>
        <span>Route</span>
        <span className="text-right pr-2">Amount</span>
        <span>Status</span>
        <span>Risk</span>
        <span>When</span>
      </div>

      {/* Body — single scroll surface */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loadingInitial ? (
          <SkeletonRows />
        ) : error ? (
          <Center>
            <p className="font-sans text-[13px] font-semibold text-negative">
              Couldn't load transactions
            </p>
            <p className="font-sans text-[12px] text-text-muted">{error}</p>
          </Center>
        ) : items.length === 0 ? (
          <Center>
            <p className="font-sans text-[13px] font-semibold text-text-primary">
              No transactions match your filters
            </p>
            <p className="font-sans text-[12px] text-text-muted">
              Try widening the period or clearing a filter.
            </p>
          </Center>
        ) : (
          <>
            {items.map((t) => {
              const isExpanded = expandedId === t.id;
              if (isExpanded) {
                return (
                  <TransactionRowExpanded
                    key={t.id}
                    row={t}
                    onCollapse={() => setExpandedId(null)}
                  />
                );
              }
              return (
                <TransactionRow
                  key={t.id}
                  row={t}
                  onToggle={() => setExpandedId(t.id)}
                />
              );
            })}
            {loadingMore && <SkeletonRows count={2} />}
            {hasMore && <div ref={sentinelRef} className="h-1" aria-hidden />}
            {!hasMore && items.length > 8 && (
              <div className="px-6 py-4 text-center font-sans text-[11px] text-text-faint">
                End of list · {items.length} loaded
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Minimal row ─────────────────────────────────────────────────────── */

function TransactionRow({
  row,
  onToggle,
}: {
  row: TransactionListItem;
  onToggle: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      className="grid cursor-pointer items-center gap-4 border-b border-brand-cream-2/60 px-6 py-3 transition-colors duration-150 ease-out hover:bg-brand-cream/30"
      style={{ gridTemplateColumns: COLUMN_TEMPLATE }}
    >
      <span className="truncate font-mono text-[12px] font-semibold text-text-primary">
        {row.reference}
      </span>

      <div className="flex min-w-0 flex-col leading-tight">
        <span className="truncate font-sans text-[12px] font-semibold text-text-primary">
          {row.clientName}
        </span>
        <span className="truncate font-mono text-[11px] text-text-muted">
          CIN {row.clientCin}
        </span>
      </div>

      <div className="flex min-w-0 items-center gap-1.5">
        <BankAvatar code={row.sourceBankCode} size={22} />
        <span className="font-mono text-[11px] text-text-primary">
          {row.sourceBankCode}
        </span>
        <ArrowRight className="size-3.5 shrink-0 text-text-faint" aria-hidden />
        <BankAvatar code={row.destBankCode} size={22} />
        <span className="font-mono text-[11px] text-text-primary">
          {row.destBankCode}
        </span>
      </div>

      <span className="text-right pr-2 font-sans text-[13px] font-semibold tabular-nums text-text-primary">
        {formatAmount(row.amount)}
        <span className="ml-1 font-sans text-[10px] text-text-faint">TND</span>
      </span>

      <span>
        <TransactionStatusPill status={row.status} />
      </span>

      <span>
        <RiskBadge level={row.riskLevel} />
      </span>

      <div className="flex items-center gap-2">
        <span className="truncate font-sans text-[11px] text-text-muted">
          {formatRelative(row.createdAt)}
        </span>
        <ChevronRight className="ml-auto size-4 shrink-0 text-text-faint" aria-hidden />
      </div>
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────────────── */

function SkeletonRows({ count = 7 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="grid items-center gap-4 border-b border-brand-cream-2/60 px-6 py-3"
          style={{ gridTemplateColumns: COLUMN_TEMPLATE }}
        >
          <div className="h-3 w-24 rounded-full bg-brand-cream-2/60" />
          <div className="flex flex-col gap-1.5">
            <div className="h-3 w-32 rounded-full bg-brand-cream-2/60" />
            <div className="h-2.5 w-20 rounded-full bg-brand-cream-2/40" />
          </div>
          <div className="flex items-center gap-2">
            <div className="size-5 rounded-md bg-brand-cream-2/60" />
            <div className="h-3 w-10 rounded-full bg-brand-cream-2/60" />
            <div className="h-3 w-3 rounded-full bg-brand-cream-2/40" />
            <div className="size-5 rounded-md bg-brand-cream-2/60" />
          </div>
          <div className="ml-auto h-3 w-20 rounded-full bg-brand-cream-2/60" />
          <div className="h-5 w-20 rounded-full bg-brand-cream-2/60" />
          <div className="h-5 w-12 rounded-full bg-brand-cream-2/60" />
          <div className="h-3 w-16 rounded-full bg-brand-cream-2/60" />
        </div>
      ))}
    </>
  );
}

function Center({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 py-16">
      {children}
    </div>
  );
}
