import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight } from "lucide-react";
import { Card } from "@/features/dashboard/components/Card";
import {
  fetchClients,
  type ClientListItem,
} from "@/features/clients/api";
import { cn } from "@/lib/cn";

/**
 * Admin dashboard Card 4 — pending client registrations.
 *
 *   Visual: red-tinted accent on the count + AlertCircle icon — pending
 *   registrations are blocking work for the admin's queue (decisions
 *   today, SLA on responses), so the card reads as actionable rather
 *   than informational.
 *
 *   Source: GET /api/v1/admin/clients?status=PENDING — same endpoint
 *   /clients listing uses, just status-filtered. Click on any row jumps
 *   to /clients?status=PENDING with the row preselected (left to the
 *   Clients page to honor; today it just opens the filtered list).
 */
export function PendingClientsCard() {
  const navigate = useNavigate();
  const [items, setItems] = useState<ClientListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchClients({ status: "PENDING", page: 0, size: 8, signal: ctrl.signal })
      .then((paged) => {
        if (ctrl.signal.aborted) return;
        setItems(paged.content);
        setTotal(paged.totalElements);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err : new Error("Unknown error"));
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [tick]);

  return (
    <Card to="/clients?status=PENDING" className="row-span-2">
      {/* Header — the visual "alert" surface: red dot + count */}
      <div className="flex w-full shrink-0 items-start gap-2 overflow-hidden border-b border-brand-cream-2/70 bg-gradient-to-r from-[#fff5f4] to-white px-[22px] pb-3 pt-3">
        <div className="mt-px flex shrink-0 items-center justify-center">
          <span className="relative flex size-2.5 shrink-0">
            {total > 0 && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#c93b3a] opacity-60" />
            )}
            <span
              className={cn(
                "relative inline-flex size-2.5 rounded-full",
                total > 0 ? "bg-[#c93b3a]" : "bg-positive",
              )}
            />
          </span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-none">
          <p className="truncate font-sans text-[11px] font-bold tracking-[1.76px] text-[#c93b3a]">
            PENDING CLIENTS
          </p>
          <div className="flex items-baseline gap-1.5 overflow-hidden whitespace-nowrap">
            <span className="font-sans text-[22px] font-bold leading-none text-text-primary">
              {total.toLocaleString()}
            </span>
            <span className="font-sans text-[11px] text-text-muted">
              {total === 1 ? "registration awaiting decision" : "registrations awaiting decision"}
            </span>
          </div>
        </div>
        <AlertCircle
          className="size-4 shrink-0 text-[#c93b3a]"
          strokeWidth={2.2}
          aria-hidden
        />
      </div>

      {/* List — scrollable inside the card so the header stays anchored */}
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
        {loading ? (
          <ListSkeleton />
        ) : error ? (
          <ListError onRetry={() => setTick((n) => n + 1)} />
        ) : items.length === 0 ? (
          <ListEmpty />
        ) : (
          items.map((client, i) => (
            <div key={client.userId} className="flex shrink-0 flex-col">
              <Row
                client={client}
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/clients?status=PENDING&id=${client.userId}`);
                }}
              />
              {i < items.length - 1 && (
                <div className="mx-[22px] h-px shrink-0 bg-[#f0e4d0]" aria-hidden />
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer "View all" — mirrors RecentTransactionsCard */}
      <div className="flex w-full shrink-0 items-center border-t border-brand-cream-2/70 bg-white px-[22px] py-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            navigate("/clients?status=PENDING");
          }}
          className="ml-auto flex shrink-0 items-center gap-1 text-brand-medium transition-transform duration-150 ease-out hover:translate-x-0.5"
        >
          <span className="whitespace-nowrap font-sans text-[11px] font-semibold">
            Open queue
          </span>
          <ArrowRight className="size-3 shrink-0" strokeWidth={2.4} />
        </button>
      </div>
    </Card>
  );
}

/* ─── Sub-components ────────────────────────────────────────────────── */

function Row({
  client,
  onClick,
}: {
  client: ClientListItem;
  onClick: (e: React.MouseEvent) => void;
}) {
  const initials = (
    (client.firstName?.[0] ?? "") + (client.lastName?.[0] ?? "")
  ).toUpperCase();
  const fullName = `${client.firstName} ${client.lastName}`.trim();
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full shrink-0 items-center gap-3 overflow-hidden px-[22px] py-2.5 text-left transition-colors duration-150 hover:bg-brand-cream/30"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-cream-2 font-sans text-[10px] font-bold text-text-primary">
        {initials || "??"}
      </span>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-px overflow-hidden whitespace-nowrap leading-none">
        <p className="min-w-0 max-w-full truncate font-sans text-[12px] font-semibold text-text-primary">
          {fullName || "Unnamed"}
        </p>
        <p className="truncate font-sans text-[10px] text-text-muted">
          <span className="font-mono">CIN {client.cin}</span>
          {" · "}
          {timeAgo(client.createdAt)}
        </p>
      </div>
      <ArrowRight
        className="size-3 shrink-0 text-text-faint"
        strokeWidth={2.2}
        aria-hidden
      />
    </button>
  );
}

function ListSkeleton() {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex shrink-0 items-center gap-3 px-[22px] py-2.5">
          <span className="size-7 shrink-0 animate-pulse rounded-full bg-brand-cream-2" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="h-[10px] w-2/3 animate-pulse rounded bg-brand-cream-2" />
            <span className="h-[8px] w-1/2 animate-pulse rounded bg-brand-cream-2/60" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ListEmpty() {
  return (
    <div className="flex min-h-0 w-full flex-1 items-center justify-center px-[22px] py-6">
      <p className="font-sans text-[12px] text-text-muted">
        All caught up — no pending registrations.
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
        onClick={(e) => {
          e.stopPropagation();
          onRetry();
        }}
        className="font-sans text-[11px] font-semibold text-brand-medium transition-transform duration-150 ease-out hover:translate-x-0.5"
      >
        Retry →
      </button>
    </div>
  );
}

function timeAgo(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
