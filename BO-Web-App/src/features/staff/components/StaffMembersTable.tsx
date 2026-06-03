import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { StaffAvatar } from "./StaffAvatar";
import { StaffStatusPill } from "./StaffStatusPill";
import { StaffMemberExpanded } from "./StaffMemberExpanded";
import { fetchAdmin, fetchAnalyst, type StaffMember } from "../api";

interface StaffMembersTableProps {
  /** Drives the refetch endpoint after Block/Unblock. */
  role: "ADMIN" | "ANALYST";
  items: StaffMember[];
  loadingInitial: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  onLoadMore: () => void;
  onDeleted: (id: string) => void;
  onUpdated: (m: StaffMember) => void;
}

const COLUMN_TEMPLATE =
  "minmax(220px,2fr) minmax(180px,1.4fr) minmax(160px,1.2fr) minmax(140px,1fr) minmax(120px,0.8fr)";

/**
 * Admins / Analysts table — same columns, expandable rows. Reused by both
 * the Admins and Analysts tabs of the Staff Management page.
 */
export function StaffMembersTable({
  role,
  items,
  loadingInitial,
  loadingMore,
  hasMore,
  error,
  onLoadMore,
  onDeleted,
  onUpdated,
}: StaffMembersTableProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Reset expansion when the tab changes (the list resets too, so an
  // orphan expansion would otherwise hang on the wrong row).
  useEffect(() => {
    setExpandedId(null);
  }, [role]);

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

  const refetch = async (id: string): Promise<StaffMember | null> => {
    try {
      return role === "ADMIN" ? await fetchAdmin(id) : await fetchAnalyst(id);
    } catch (cause) {
      console.warn("[staff] refetch failed", cause);
      return null;
    }
  };

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_0_rgba(42,31,20,0.04),0_8px_24px_-6px_rgba(42,31,20,0.10)]">
      <div
        className="grid shrink-0 items-center gap-4 border-b border-brand-cream-2 bg-brand-cream/40 px-6 py-3 font-sans text-[10px] font-bold uppercase tracking-[1.2px] text-text-label"
        style={{ gridTemplateColumns: COLUMN_TEMPLATE }}
      >
        <span>Name</span>
        <span>Email</span>
        <span>Phone</span>
        <span>Governorate</span>
        <span>Status</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loadingInitial ? (
          <SkeletonRows />
        ) : error ? (
          <Center>
            <p className="font-sans text-[13px] font-semibold text-negative">
              Couldn't load
            </p>
            <p className="font-sans text-[12px] text-text-muted">{error}</p>
          </Center>
        ) : items.length === 0 ? (
          <Center>
            <p className="font-sans text-[13px] font-semibold text-text-primary">
              No {role === "ADMIN" ? "admins" : "analysts"} yet
            </p>
            <p className="font-sans text-[12px] text-text-muted">
              Use the +Add button to onboard the first one.
            </p>
          </Center>
        ) : (
          <>
            {items.map((m) => {
              if (expandedId === m.id) {
                return (
                  <StaffMemberExpanded
                    key={m.id}
                    member={m}
                    onCollapse={() => setExpandedId(null)}
                    onDeleted={onDeleted}
                    onUpdated={onUpdated}
                    refetch={refetch}
                  />
                );
              }
              return <Row key={m.id} member={m} onToggle={() => setExpandedId(m.id)} />;
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

function Row({ member, onToggle }: { member: StaffMember; onToggle: () => void }) {
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
      <div className="flex min-w-0 items-center gap-3">
        <StaffAvatar
          firstName={member.firstName}
          lastName={member.lastName}
          profilePictureUrl={member.profilePictureUrl}
        />
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate font-sans text-[13px] font-semibold text-text-primary">
            {member.firstName} {member.lastName}
          </span>
          <span className="truncate font-mono text-[11px] text-text-muted">
            @{member.username ?? "—"}
          </span>
        </div>
        <ChevronRight className="ml-auto size-4 shrink-0 text-text-faint" aria-hidden />
      </div>
      <span className="truncate font-sans text-[12px] text-text-primary">{member.email}</span>
      <span className="truncate font-sans text-[12px] text-text-primary">
        {formatPhone(member.phone)}
      </span>
      <span className="truncate font-sans text-[12px] text-text-primary">
        {member.governorate ?? "—"}
      </span>
      <span>
        <StaffStatusPill status={member.status} />
      </span>
    </div>
  );
}

function SkeletonRows({ count = 6 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="grid items-center gap-4 border-b border-brand-cream-2/60 px-6 py-3"
          style={{ gridTemplateColumns: COLUMN_TEMPLATE }}
        >
          <div className="flex items-center gap-3">
            <div className="size-9 shrink-0 rounded-full bg-brand-cream-2/60" />
            <div className="flex flex-col gap-1.5">
              <div className="h-3 w-32 rounded-full bg-brand-cream-2/60" />
              <div className="h-2.5 w-20 rounded-full bg-brand-cream-2/40" />
            </div>
          </div>
          <div className="h-3 w-40 rounded-full bg-brand-cream-2/60" />
          <div className="h-3 w-28 rounded-full bg-brand-cream-2/60" />
          <div className="h-3 w-20 rounded-full bg-brand-cream-2/60" />
          <div className="h-5 w-20 rounded-full bg-brand-cream-2/60" />
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

function formatPhone(raw: string | null): string {
  if (!raw) return "—";
  const stripped = raw.replace(/\s+/g, "");
  if (stripped.startsWith("+216") && stripped.length === 12) {
    const rest = stripped.slice(4);
    return `+216 ${rest.slice(0, 2)} ${rest.slice(2, 5)} ${rest.slice(5)}`;
  }
  return raw;
}
