import { useEffect, useRef } from "react";
import { NotificationIcon } from "./NotificationIcon";
import { markRead, useNotifications } from "../hooks";
import type { NotificationItem } from "../api";

interface NotificationDropdownProps {
  open: boolean;
  /** Total unread (for the header pill). The bell-button owns the live count. */
  unreadCount: number;
  /** Optimistic decrement after a mark-read so the bell pill stays in sync. */
  onMarkedRead: () => void;
}

/**
 * Bell-anchored notification panel. Spec:
 *   - Header: "Notifications" + brown rounded pill showing unread count.
 *   - Rows: icon + (title / message / "X ago"), unread rows tinted cream
 *     with a red dot on the right; read rows white with no dot.
 *   - Click a row → mark read locally and via PUT /notifications/{id}/read.
 *   - Infinite scroll via IntersectionObserver on a sentinel at the bottom.
 *   - Rows do NOT expand. All info is visible from the outside (per spec).
 */
export function NotificationDropdown({
  open,
  unreadCount,
  onMarkedRead,
}: NotificationDropdownProps) {
  const {
    items,
    loadingInitial,
    loadingMore,
    hasMore,
    error,
    loadMore,
    setRowRead,
  } = useNotifications({ active: open });

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  // Same pattern as the Clients table — the observer effect must re-run when
  // loadingInitial flips, since the sentinel only renders after the first
  // page lands. 200px lead so the next page is in flight before the bottom.
  useEffect(() => {
    if (!open) return;
    if (!hasMore) return;
    if (loadingInitial) return;
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            loadMoreRef.current();
            break;
          }
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [open, hasMore, loadingInitial]);

  if (!open) return null;

  return (
    <div
      role="region"
      aria-label="Notifications"
      // Anchored absolute under the bell. Width is generous enough to fit
      // long titles + messages without truncation; max-height caps the panel
      // so it doesn't overflow the viewport on short screens.
      className={[
        "absolute right-0 top-[calc(100%+8px)] z-40",
        "w-[360px] max-w-[calc(100vw-32px)]",
        "rounded-2xl bg-white",
        "shadow-[0_24px_64px_-12px_rgba(42,31,20,0.30)]",
        "ring-1 ring-brand-cream-2",
        "overflow-hidden",
      ].join(" ")}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-5 pt-5 pb-3">
        <h3 className="font-sans text-[16px] font-bold text-text-primary">
          Notifications
        </h3>
        {unreadCount > 0 && (
          <span
            className={[
              "inline-flex h-5 min-w-[22px] items-center justify-center rounded-full px-1.5",
              "bg-brand-medium font-sans text-[11px] font-bold text-white",
            ].join(" ")}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </div>

      {/* ── List ───────────────────────────────────────────────────── */}
      {/*  Body scrolls inside the dropdown — outer panel never grows past max-h. */}
      <div className="max-h-[60vh] min-h-[140px] overflow-y-auto">
        {loadingInitial ? (
          <SkeletonRows />
        ) : error ? (
          <ErrorState message={error} />
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {items.map((n) => (
              <NotificationRow
                key={n.id}
                notification={n}
                onClick={() => {
                  if (n.isRead) return;
                  setRowRead(n.id);
                  onMarkedRead();
                  void markRead(n.id);
                }}
              />
            ))}
            {loadingMore && <SkeletonRows count={2} />}
            {hasMore && (
              <>
                <div ref={sentinelRef} className="h-1" aria-hidden />
                <div className="px-5 py-3 text-center font-sans text-[12px] text-text-faint">
                  Loading more…
                </div>
              </>
            )}
            {!hasMore && items.length > 4 && (
              <div className="px-5 py-3 text-center font-sans text-[11px] text-text-faint">
                You're all caught up
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Row ─────────────────────────────────────────────────────────────── */

function NotificationRow({
  notification,
  onClick,
}: {
  notification: NotificationItem;
  onClick: () => void;
}) {
  const isUnread = !notification.isRead;
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex w-full items-start gap-3 border-b border-brand-cream-2/60 px-5 py-3 text-left",
        "transition-colors duration-150 ease-out",
        isUnread
          ? "bg-brand-cream/40 hover:bg-brand-cream/60 cursor-pointer"
          : "bg-white hover:bg-brand-cream/20 cursor-default",
      ].join(" ")}
      aria-label={isUnread ? `${notification.title} — unread` : notification.title}
    >
      <NotificationIcon type={notification.type} />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="font-sans text-[13px] font-bold text-text-primary">
          {notification.title}
        </p>
        <p className="mt-0.5 break-words font-sans text-[12px] text-text-muted">
          {notification.body}
        </p>
        <p className="mt-1 font-sans text-[11px] text-text-faint">
          {formatRelative(notification.createdAt)}
        </p>
      </div>
      {/* Unread dot — sits at the row's right edge, brand-red so it's eye-
          catching without being alarming. */}
      {isUnread && (
        <span
          className="mt-1 size-2 shrink-0 rounded-full bg-negative"
          aria-hidden
        />
      )}
    </button>
  );
}

/* ─── Skeleton / empty / error ────────────────────────────────────────── */

function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-start gap-3 border-b border-brand-cream-2/60 px-5 py-3"
        >
          <div className="size-9 shrink-0 rounded-lg bg-brand-cream-2/60" />
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="h-3 w-32 rounded-full bg-brand-cream-2/60" />
            <div className="h-2.5 w-48 rounded-full bg-brand-cream-2/40" />
            <div className="h-2 w-16 rounded-full bg-brand-cream-2/40" />
          </div>
        </div>
      ))}
    </>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-12">
      <p className="font-sans text-[13px] font-semibold text-text-primary">
        No notifications
      </p>
      <p className="font-sans text-[12px] text-text-muted">
        You'll see system events here as they happen.
      </p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-12">
      <p className="font-sans text-[13px] font-semibold text-negative">
        Couldn't load notifications
      </p>
      <p className="font-sans text-[12px] text-text-muted">{message}</p>
    </div>
  );
}

/* ─── Time formatter ──────────────────────────────────────────────────── */

/**
 * Coarse "X ago / Today / Yesterday / date" strings tuned for the dropdown.
 * Different from the Clients-page two-line version — here we collapse to one
 * line and switch to the day label past 24h so everything stays compact.
 */
function formatRelative(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSec < 30) return "Just now";
  if (diffSec < 60) return `${diffSec} sec ago`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;

  const nowDate = new Date();
  const thenDate = new Date(iso);
  const dayDiff = Math.floor(
    (Date.UTC(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()) -
      Date.UTC(thenDate.getFullYear(), thenDate.getMonth(), thenDate.getDate())) /
      86_400_000,
  );
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff < 7) return `${dayDiff} days ago`;
  if (thenDate.getFullYear() === nowDate.getFullYear()) {
    return thenDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return thenDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
