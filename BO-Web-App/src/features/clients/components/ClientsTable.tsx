import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { ClientAvatar } from "./ClientAvatar";
import { ClientStatusPill } from "./ClientStatusPill";
import { ClientRowExpanded } from "./ClientRowExpanded";
import { pillStatusFor } from "../statusDisplay";
import type { ClientListItem, ClientStatus, ClientStatusFilter } from "../api";

interface ClientsTableProps {
  /** Active filter; drives which columns are shown. */
  statusFilter: ClientStatusFilter;
  items: ClientListItem[];
  loadingInitial: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  onLoadMore: () => void;
  /** Bubbles up after a successful Delete so the page can drop the row. */
  onDeleted: (userId: string) => void;
  /** Bubbles up after a successful approve / reject / block / unblock with
   *  the refreshed row. The page decides whether to keep or drop it based
   *  on the active tab filter. */
  onUpdated: (client: ClientListItem) => void;
}

/* ─── Column system ───────────────────────────────────────────────────── */
//
// Each tab gets its own column set so we don't waste horizontal space on
// fields that are redundant under that filter (e.g. STATUS when every row
// shares the same status; DOB when the tab cares more about lifecycle dates).

type ColumnId =
  | "client"
  | "cin"
  | "dob"
  | "phone"
  | "governorate"
  | "status"
  | "submitted"      // formatted `createdAt` (single-line absolute)
  | "joined"         // formatted `decidedAt` (single-line absolute)
  | "submitted_at"   // two-line "X ago / day-label" cell from createdAt
  | "rejected_at";   // two-line "X ago / day-label" cell from decidedAt (rejected rows)

interface ColumnSpec {
  id: ColumnId;
  header: string;
  /** CSS grid track for this column. */
  track: string;
  /** Renderer for the body cell. The active tab is passed in so columns
   *  whose display depends on context (e.g. STATUS pill: derived in All,
   *  raw in tab-specific views) can adapt. */
  cell: (c: ClientListItem, tab: ClientStatusFilter) => ReactNode;
}

const COLUMN: Record<ColumnId, ColumnSpec> = {
  client: {
    id: "client",
    header: "Client",
    track: "minmax(220px,2fr)",
    cell: (c) => (
      <div className="flex min-w-0 items-center gap-3">
        <ClientAvatar
          firstName={c.firstName}
          lastName={c.lastName}
          profilePictureUrl={c.profilePictureUrl}
        />
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate font-sans text-[13px] font-semibold text-text-primary">
            {c.firstName} {c.lastName}
          </span>
          <span className="truncate font-mono text-[11px] text-text-muted">
            @{c.username ?? "—"}
          </span>
        </div>
        <ChevronRight className="ml-auto size-4 shrink-0 text-text-faint" aria-hidden />
      </div>
    ),
  },
  cin: {
    id: "cin",
    header: "CIN",
    track: "minmax(110px,1fr)",
    cell: (c) => <span className="truncate font-sans text-[12px] text-text-primary">{c.cin}</span>,
  },
  dob: {
    id: "dob",
    header: "Date of Birth",
    track: "minmax(140px,1fr)",
    cell: (c) => (
      <span className="truncate font-sans text-[12px] text-text-primary">
        {c.dateOfBirth ?? "—"}
      </span>
    ),
  },
  phone: {
    id: "phone",
    header: "Phone",
    track: "minmax(160px,1.2fr)",
    cell: (c) => (
      <span className="truncate font-sans text-[12px] text-text-primary">
        {formatPhone(c.phone)}
      </span>
    ),
  },
  governorate: {
    id: "governorate",
    header: "Governorate",
    track: "minmax(140px,1fr)",
    cell: (c) => (
      <span className="truncate font-sans text-[12px] text-text-primary">
        {c.governorate ?? "—"}
      </span>
    ),
  },
  status: {
    id: "status",
    header: "Status",
    track: "minmax(120px,0.8fr)",
    cell: (c, tab) => <ClientStatusPill status={pillStatusFor(c, tab)} />,
  },
  submitted: {
    id: "submitted",
    header: "Submitted",
    track: "minmax(160px,1.1fr)",
    cell: (c) => (
      <span className="truncate font-sans text-[12px] text-text-primary">
        {formatDateTime(c.createdAt)}
      </span>
    ),
  },
  joined: {
    id: "joined",
    header: "Joined",
    track: "minmax(160px,1.1fr)",
    cell: (c) => (
      <span className="truncate font-sans text-[12px] text-text-primary">
        {formatDateTime(c.decidedAt)}
      </span>
    ),
  },
  submitted_at: {
    id: "submitted_at",
    header: "Submitted_at",
    track: "minmax(120px,1fr)",
    cell: (c) => <RelativeTimeCell iso={c.createdAt} />,
  },
  rejected_at: {
    id: "rejected_at",
    header: "Rejected_at",
    track: "minmax(120px,1fr)",
    cell: (c) => <RelativeTimeCell iso={c.decidedAt} />,
  },
};

/**
 * Two-line cell — relative time on top ("14m ago") and a short day label on
 * the bottom ("Today" / "Yesterday" / "Mon" / "Mar 15"). Used by the
 * SUBMITTED_AT and REJECTED_AT columns.
 */
function RelativeTimeCell({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-text-faint">—</span>;
  return (
    <div className="flex min-w-0 flex-col leading-tight">
      <span className="truncate font-sans text-[12px] font-semibold text-text-primary">
        {formatRelativeTime(iso)}
      </span>
      <span className="truncate font-sans text-[11px] text-text-muted">
        {formatDayLabel(iso)}
      </span>
    </div>
  );
}

/**
 * Per-tab column layouts. Driven by the active status filter; "ALL" shows
 * everything because the user benefits from STATUS context when rows are
 * mixed. Tabs the user hasn't specced yet fall back to the ALL layout.
 */
const COLUMN_LAYOUT: Record<"ALL" | ClientStatus, ColumnId[]> = {
  ALL:      ["client", "cin", "dob", "phone", "governorate", "status"],
  PENDING:  ["client", "cin", "phone", "governorate", "submitted"],
  ACCEPTED: ["client", "cin", "phone", "status", "joined"],
  ACTIVE:   ["client", "cin", "phone", "governorate", "joined"],
  BLOCKED:  ["client", "cin", "phone", "governorate", "joined"],
  REJECTED: ["client", "cin", "phone", "governorate", "submitted_at", "rejected_at"],
};

function resolveColumns(statusFilter: ClientStatusFilter): ColumnSpec[] {
  const key = statusFilter ?? "ALL";
  return COLUMN_LAYOUT[key].map((id) => COLUMN[id]);
}

/* ─── Table ───────────────────────────────────────────────────────────── */

export function ClientsTable({
  statusFilter,
  items,
  loadingInitial,
  loadingMore,
  hasMore,
  error,
  onLoadMore,
  onDeleted,
  onUpdated,
}: ClientsTableProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  // Single-expand model — opening one row collapses the previous.
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Reset the expanded row when the filter changes — otherwise an "All"-tab
  // expansion could orphan when the user switches to e.g. Pending and the
  // expanded row is no longer in the result set.
  useEffect(() => {
    setExpandedId(null);
  }, [statusFilter]);

  useEffect(() => {
    if (!hasMore) return;
    // The sentinel div is only mounted after `loadingInitial` flips to false
    // (the body renders skeletons during the first load, not the sentinel),
    // so the effect must re-run on that transition — otherwise the observer
    // is set up while sentinelRef.current is still null and never attaches.
    if (loadingInitial) return;
    const node = sentinelRef.current;
    if (!node) return;

    // 200px lead so the next page is in flight before the user actually hits
    // the bottom — keeps scrolling smooth even on a slow connection.
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

  const columns = resolveColumns(statusFilter);
  const gridTemplateColumns = columns.map((c) => c.track).join(" ");

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_0_rgba(42,31,20,0.04),0_8px_24px_-6px_rgba(42,31,20,0.10)]">
      {/* Sticky header */}
      <div
        className={[
          "grid shrink-0 items-center gap-4 border-b border-brand-cream-2 px-6 py-3",
          "bg-brand-cream/40",
          "font-sans text-[10px] font-bold uppercase tracking-[1.2px] text-text-label",
        ].join(" ")}
        style={{ gridTemplateColumns }}
      >
        {columns.map((col) => (
          <span key={col.id}>{col.header}</span>
        ))}
      </div>

      {/* Body — the only scroll surface on the page */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loadingInitial ? (
          <SkeletonRows columns={columns} gridTemplateColumns={gridTemplateColumns} />
        ) : error ? (
          <ErrorState message={error} />
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {items.map((c) => {
              const isExpanded = expandedId === c.userId;
              if (isExpanded && canExpand(c.status)) {
                return (
                  <ClientRowExpanded
                    key={c.userId}
                    client={c}
                    tab={statusFilter}
                    onCollapse={() => setExpandedId(null)}
                    onDeleted={onDeleted}
                    onUpdated={onUpdated}
                  />
                );
              }
              return (
                <ClientRow
                  key={c.userId}
                  client={c}
                  columns={columns}
                  gridTemplateColumns={gridTemplateColumns}
                  tab={statusFilter}
                  onToggle={() => {
                    if (!canExpand(c.status)) {
                      return;
                    }
                    setExpandedId(c.userId);
                  }}
                />
              );
            })}
            {loadingMore && (
              <SkeletonRows
                columns={columns}
                gridTemplateColumns={gridTemplateColumns}
                count={3}
              />
            )}
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

/* ─── Row ─────────────────────────────────────────────────────────────── */

interface ClientRowProps {
  client: ClientListItem;
  columns: ColumnSpec[];
  gridTemplateColumns: string;
  tab: ClientStatusFilter;
  onToggle: () => void;
}

function ClientRow({ client, columns, gridTemplateColumns, tab, onToggle }: ClientRowProps) {
  const expandable = canExpand(client.status);

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
      className={[
        "grid items-center gap-4 border-b border-brand-cream-2/60 px-6 py-3",
        "transition-colors duration-150 ease-out",
        expandable ? "cursor-pointer hover:bg-brand-cream/30" : "cursor-default",
      ].join(" ")}
      style={{ gridTemplateColumns }}
    >
      {columns.map((col) => (
        <div key={col.id} className="min-w-0">
          {col.cell(client, tab)}
        </div>
      ))}
    </div>
  );
}

/** Whether the row's status has an implemented expanded layout. */
function canExpand(status: ClientStatus): boolean {
  return (
    status === "ACTIVE" ||
    status === "ACCEPTED" ||
    status === "PENDING" ||
    status === "BLOCKED" ||
    status === "REJECTED"
  );
}

/* ─── Loading / empty / error ─────────────────────────────────────────── */

function SkeletonRows({
  columns,
  gridTemplateColumns,
  count = 6,
}: {
  columns: ColumnSpec[];
  gridTemplateColumns: string;
  count?: number;
}) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="grid items-center gap-4 border-b border-brand-cream-2/60 px-6 py-3"
          style={{ gridTemplateColumns }}
        >
          {columns.map((col) =>
            col.id === "client" ? (
              <div key={col.id} className="flex items-center gap-3">
                <div className="size-9 shrink-0 rounded-full bg-brand-cream-2/60" />
                <div className="flex flex-col gap-1.5">
                  <div className="h-3 w-32 rounded-full bg-brand-cream-2/60" />
                  <div className="h-2.5 w-20 rounded-full bg-brand-cream-2/40" />
                </div>
              </div>
            ) : col.id === "status" ? (
              <div key={col.id} className="h-5 w-20 rounded-full bg-brand-cream-2/60" />
            ) : (
              <div key={col.id} className="h-3 w-24 rounded-full bg-brand-cream-2/60" />
            ),
          )}
        </div>
      ))}
    </>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 py-16">
      <p className="font-sans text-[13px] font-semibold text-text-primary">No clients found</p>
      <p className="font-sans text-[12px] text-text-muted">
        Try a different filter or search term.
      </p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 py-16">
      <p className="font-sans text-[13px] font-semibold text-negative">Couldn't load clients</p>
      <p className="font-sans text-[12px] text-text-muted">{message}</p>
    </div>
  );
}

/* ─── Formatters ──────────────────────────────────────────────────────── */

function formatPhone(raw: string | null): string {
  if (!raw) return "—";
  const stripped = raw.replace(/\s+/g, "");
  if (stripped.startsWith("+216") && stripped.length === 12) {
    const rest = stripped.slice(4);
    return `+216 ${rest.slice(0, 2)} ${rest.slice(2, 5)} ${rest.slice(5)}`;
  }
  return raw;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mn = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mn}`;
}

/**
 * Coarse relative-time string for the SUBMITTED_AT / REJECTED_AT cells.
 * Buckets: 30 sec → "just now", then m / h / d / mo / y. Calendar-month and
 * year math is approximate (30 / 365 days) — good enough for an admin list.
 */
function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const sec = Math.max(0, Math.floor((now - then) / 1000));
  if (sec < 30) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.floor(day / 365);
  return `${yr}y ago`;
}

/** Bottom-line label for the SUBMITTED_AT / REJECTED_AT cells. */
function formatDayLabel(iso: string): string {
  const now = new Date();
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return iso;
  const dayDiff = Math.floor(
    (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) -
      Date.UTC(then.getFullYear(), then.getMonth(), then.getDate())) /
      86_400_000,
  );
  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff < 7) return then.toLocaleDateString("en-US", { weekday: "short" });
  if (then.getFullYear() === now.getFullYear()) {
    return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return then.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
