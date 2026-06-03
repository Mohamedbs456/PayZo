import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Shield } from "lucide-react";
import { formatDateTime, formatRelative } from "@/features/transactions/format";
import type { AuditLogEntry } from "../api";

interface AuditLogTableProps {
  items: AuditLogEntry[];
  loadingInitial: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  onLoadMore: () => void;
}

const COLUMN_TEMPLATE =
  "minmax(120px,0.7fr) minmax(180px,1.4fr) minmax(160px,1.2fr) minmax(140px,1fr) minmax(140px,0.9fr)";

/**
 * Read-only event stream of every recorded backoffice action. Click any row
 * to expand and reveal the raw metadata blob (JSON-shaped string from the
 * audit_logs table). Same infinite-scroll machinery as the other lists.
 */
export function AuditLogTable({
  items,
  loadingInitial,
  loadingMore,
  hasMore,
  error,
  onLoadMore,
}: AuditLogTableProps) {
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
      <div
        className="grid shrink-0 items-center gap-4 border-b border-brand-cream-2 bg-brand-cream/40 px-6 py-3 font-sans text-[10px] font-bold uppercase tracking-[1.2px] text-text-label"
        style={{ gridTemplateColumns: COLUMN_TEMPLATE }}
      >
        <span>Actor</span>
        <span>Action</span>
        <span>Target</span>
        <span>Target ID</span>
        <span>When</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loadingInitial ? (
          <SkeletonRows />
        ) : error ? (
          <Center>
            <p className="font-sans text-[13px] font-semibold text-negative">
              Couldn't load audit log
            </p>
            <p className="font-sans text-[12px] text-text-muted">{error}</p>
          </Center>
        ) : items.length === 0 ? (
          <Center>
            <p className="font-sans text-[13px] font-semibold text-text-primary">
              No events recorded yet
            </p>
            <p className="font-sans text-[12px] text-text-muted">
              Actions you take will appear here.
            </p>
          </Center>
        ) : (
          <>
            {items.map((entry) => (
              <AuditRow
                key={entry.id}
                entry={entry}
                expanded={expandedId === entry.id}
                onToggle={() =>
                  setExpandedId((curr) => (curr === entry.id ? null : entry.id))
                }
              />
            ))}
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

/* ─── Row + inline expansion ──────────────────────────────────────────── */

function AuditRow({
  entry,
  expanded,
  onToggle,
}: {
  entry: AuditLogEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={[
        "border-b border-brand-cream-2/60 transition-colors duration-150 ease-out",
        expanded ? "bg-brand-cream/55" : "hover:bg-brand-cream/30",
      ].join(" ")}
    >
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
        className="grid cursor-pointer items-center gap-4 px-6 py-3"
        style={{ gridTemplateColumns: COLUMN_TEMPLATE }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand-cream-2/60">
            <Shield className="size-3.5 text-brand-medium" aria-hidden />
          </div>
          <span className="truncate font-sans text-[11px] font-bold uppercase tracking-[0.6px] text-text-primary">
            {entry.actorRole}
          </span>
        </div>

        <span className="truncate font-mono text-[12px] text-text-primary">
          {entry.action}
        </span>

        <span className="truncate font-sans text-[12px] text-text-primary">
          {entry.targetType}
        </span>

        <span className="truncate font-mono text-[11px] text-text-muted">
          {shortId(entry.targetId)}
        </span>

        <div className="flex items-center gap-2">
          <span className="truncate font-sans text-[11px] text-text-muted">
            {formatRelative(entry.createdAt)}
          </span>
          {expanded ? (
            <ChevronDown className="ml-auto size-4 shrink-0 text-text-faint" aria-hidden />
          ) : (
            <ChevronRight className="ml-auto size-4 shrink-0 text-text-faint" aria-hidden />
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-6 pb-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_2fr] lg:gap-0 lg:[&>*+*]:border-l lg:[&>*+*]:border-brand-cream-2/70 lg:[&>*+*]:pl-6 lg:[&>*:not(:last-child)]:pr-6">
            <div className="flex flex-col gap-2">
              <KV label="Actor" value={entry.actorRole} />
              <KV label="Action" value={entry.action} mono />
              <KV label="Target type" value={entry.targetType} />
              <KV label="Target ID" value={entry.targetId} mono />
              <KV label="When" value={formatDateTime(entry.createdAt)} />
            </div>
            <div className="flex flex-col gap-2">
              <span className="font-sans text-[10px] font-bold uppercase tracking-[1px] text-text-label">
                Metadata
              </span>
              <pre className="overflow-x-auto rounded-lg bg-white p-3 font-mono text-[11px] leading-relaxed text-text-primary ring-1 ring-brand-cream-2/70">
                {prettyMeta(entry.metadata)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────────────── */

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-sans text-[10px] font-bold uppercase tracking-[1px] text-text-label">
        {label}
      </span>
      <span
        className={[
          "text-[12px] text-text-primary break-all",
          mono ? "font-mono" : "font-sans",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}

function shortId(id: string): string {
  if (!id) return "—";
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

function prettyMeta(raw: string | null): string {
  if (!raw) return "(no metadata)";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function SkeletonRows({ count = 8 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="grid items-center gap-4 border-b border-brand-cream-2/60 px-6 py-3"
          style={{ gridTemplateColumns: COLUMN_TEMPLATE }}
        >
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-md bg-brand-cream-2/60" />
            <div className="h-3 w-16 rounded-full bg-brand-cream-2/60" />
          </div>
          <div className="h-3 w-32 rounded-full bg-brand-cream-2/60" />
          <div className="h-3 w-24 rounded-full bg-brand-cream-2/60" />
          <div className="h-3 w-20 rounded-full bg-brand-cream-2/60" />
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
