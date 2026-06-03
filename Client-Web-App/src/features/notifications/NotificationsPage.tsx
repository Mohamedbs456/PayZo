import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft,
  Ban,
  Bell,
  CheckCircle2,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { ProfilePanel } from "@/components/layout/ProfilePanel";
import { useMe, deriveInitials } from "@/features/me/MeProvider";
import { ApiError } from "@/lib/api";
import { isDemoMode } from "@/lib/demoMode";
import { cn } from "@/lib/cn";
import {
  type ClientNotification,
  type ClientNotificationType,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/features/notifications/api";
import { DEMO_NOTIFICATIONS } from "@/features/notifications/mockData";

type ChipFilter = "ALL" | "UNREAD" | ClientNotificationType;

const CHIPS: { value: ChipFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "UNREAD", label: "Unread" },
  { value: "TRX_RECEIVED", label: "Received" },
  { value: "TRX_APPROVED", label: "Approved" },
  { value: "TRX_REJECTED", label: "Rejected" },
  { value: "BANK_DEACTIVATED", label: "Bank changes" },
];

const PAGE_SIZE = 20;

/**
 * Notifications full-page (D10 / Phase 9). Mirrors the visual language
 * of the bell dropdown but in a roomier layout: filter chips at the
 * top, infinite-scroll list below. The dropdown already wires every
 * type to an icon so we reuse that mapping verbatim.
 */
export function NotificationsPage() {
  const { me } = useMe();
  const demo = isDemoMode();

  const [profilePanelOpen, setProfilePanelOpen] = useState(false);
  const [items, setItems] = useState<ClientNotification[] | null>(null);
  const [filter, setFilter] = useState<ChipFilter>("ALL");

  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingNext, setLoadingNext] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  /* ─── Initial fetch ─────────────────────────────────────────────── */

  useEffect(() => {
    if (demo) {
      setItems(DEMO_NOTIFICATIONS);
      setHasMore(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const result = await listNotifications(0, PAGE_SIZE);
        if (cancelled) return;
        setItems(result.content);
        setHasMore(result.content.length >= PAGE_SIZE);
        setPage(0);
      } catch (err) {
        if (cancelled) return;
        if (!(err instanceof ApiError)) throw err;
        setItems([]);
        setHasMore(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [demo]);

  /* ─── Load more on scroll ───────────────────────────────────────── */

  useEffect(() => {
    if (demo || !hasMore || loadingNext || items === null) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        void loadNext();
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, hasMore, loadingNext, items, page]);

  async function loadNext() {
    if (loadingNext || !hasMore) return;
    setLoadingNext(true);
    const nextPage = page + 1;
    try {
      const result = await listNotifications(nextPage, PAGE_SIZE);
      if (result.content.length === 0) {
        setHasMore(false);
      } else {
        setItems((prev) => [...(prev ?? []), ...result.content]);
        setPage(nextPage);
        setHasMore(result.content.length >= PAGE_SIZE);
      }
    } catch {
      setHasMore(false);
    } finally {
      setLoadingNext(false);
    }
  }

  /* ─── Mark read actions ─────────────────────────────────────────── */

  async function onMarkRead(id: string) {
    setItems(
      (list) => list?.map((n) => (n.id === id ? { ...n, isRead: true } : n)) ?? null,
    );
    if (demo) return;
    try {
      await markNotificationRead(id);
    } catch {
      // Reconciles on next fetch.
    }
  }

  async function onMarkAllRead() {
    setItems((list) => list?.map((n) => ({ ...n, isRead: true })) ?? null);
    if (demo) return;
    try {
      await markAllNotificationsRead();
    } catch {
      // Reconciles on next fetch.
    }
  }

  /* ─── Filtered view ─────────────────────────────────────────────── */

  const filtered = useMemo(() => {
    if (!items) return [] as ClientNotification[];
    if (filter === "ALL") return items;
    if (filter === "UNREAD") return items.filter((n) => !n.isRead);
    return items.filter((n) => n.type === filter);
  }, [items, filter]);

  const unreadCount = items ? items.filter((n) => !n.isRead).length : 0;

  const initials = deriveInitials(me);

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-surface-soft">
      <TopBar
        variant="light"
        pageName="Notifications"
        me={me ? { initials, trustScore: me.trustScore, profilePictureUrl: me.profilePictureUrl } : null}
        onAvatarClick={() => setProfilePanelOpen(true)}
      />

      <ProfilePanel
        open={profilePanelOpen}
        onClose={() => setProfilePanelOpen(false)}
        me={me}
      />

      <main className="flex flex-1 flex-col overflow-y-auto px-4 pb-12 pt-6 sm:px-8">
        <div className="mx-auto flex w-full max-w-[920px] flex-col gap-5">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h1 className="font-sans text-[22px] font-bold text-text-primary">
                Notifications
              </h1>
              {unreadCount > 0 && (
                <span className="inline-flex h-[24px] items-center rounded-full bg-accent-soft px-3 font-sans text-[12px] font-semibold text-accent">
                  {unreadCount} unread
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onMarkAllRead}
              disabled={unreadCount === 0}
              className="font-sans text-[13px] font-semibold text-text-secondary transition-colors duration-150 ease-out hover:text-accent disabled:cursor-default disabled:text-text-faint disabled:hover:text-text-faint"
            >
              Mark all read
            </button>
          </div>

          {/* Filter chips */}
          <div
            role="tablist"
            aria-label="Filter notifications"
            className="flex flex-wrap items-stretch gap-2"
          >
            {CHIPS.map((chip) => {
              const active = chip.value === filter;
              return (
                <button
                  key={chip.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(chip.value)}
                  className={cn(
                    "h-[34px] rounded-full border px-4 font-sans text-[12px] font-semibold transition-colors duration-150 ease-out",
                    active
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border-soft bg-surface-card text-text-secondary hover:border-accent/40 hover:text-text-primary",
                  )}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>

          {/* List */}
          <div className="overflow-hidden rounded-[14px] border border-border-soft bg-surface-card">
            {items === null && <ListSkeleton />}
            {items !== null && filtered.length === 0 && <EmptyState />}
            {filtered.map((n, i) => (
              <div key={n.id} className="flex flex-col">
                <NotificationRow notification={n} onMarkRead={onMarkRead} />
                {i < filtered.length - 1 && (
                  <div aria-hidden className="h-px w-full bg-border-soft" />
                )}
              </div>
            ))}
          </div>

          {/* Sentinel + footer */}
          {items !== null && filtered.length > 0 && (
            <div ref={sentinelRef} className="flex justify-center py-2">
              {loadingNext ? (
                <p className="font-sans text-[12px] text-text-secondary">
                  Loading more…
                </p>
              ) : hasMore ? (
                <p className="font-sans text-[12px] text-text-muted">
                  Scroll for more
                </p>
              ) : (
                <p className="font-sans text-[12px] text-text-muted">
                  You're all caught up.
                </p>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/* ─── Row (mirrors the bell dropdown) ────────────────────────────────── */

function NotificationRow({
  notification,
  onMarkRead,
}: {
  notification: ClientNotification;
  onMarkRead: (id: string) => void;
}) {
  const { Icon, iconClass, iconBgClass } = visualForType(notification.type);
  const isUnread = !notification.isRead;

  return (
    <button
      type="button"
      onClick={() => isUnread && onMarkRead(notification.id)}
      className={cn(
        "flex w-full items-start gap-3 px-5 py-4 text-left transition-colors duration-150 ease-out",
        isUnread
          ? "bg-accent-soft hover:bg-accent-soft/80"
          : "bg-transparent hover:bg-surface-soft",
        !isUnread && "cursor-default",
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-[10px]",
          iconBgClass,
        )}
        aria-hidden
      >
        <Icon className={cn("size-5", iconClass)} strokeWidth={2} />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate font-sans text-[14px] font-semibold text-text-primary">
          {notification.title}
        </p>
        <p className="font-sans text-[13px] text-text-secondary">
          {notification.body}
        </p>
        <p className="font-sans text-[11px] text-text-muted">
          {formatRelativeStamp(notification.createdAt)}
        </p>
      </div>

      {isUnread && (
        <span
          className="mt-1.5 size-2 shrink-0 rounded-full bg-accent"
          aria-label="Unread"
        />
      )}
    </button>
  );
}

interface RowVisual {
  Icon: LucideIcon;
  iconClass: string;
  iconBgClass: string;
}

function visualForType(type: ClientNotificationType): RowVisual {
  switch (type) {
    case "TRX_RECEIVED":
      return {
        Icon: ArrowDownLeft,
        iconClass: "text-positive",
        iconBgClass: "bg-positive-soft",
      };
    case "TRX_APPROVED":
    case "BANK_REACTIVATED":
    case "REGISTRATION_APPROVED":
      return {
        Icon: CheckCircle2,
        iconClass: "text-positive",
        iconBgClass: "bg-positive-soft",
      };
    case "TRX_REJECTED":
    case "REGISTRATION_REJECTED":
      return {
        Icon: XCircle,
        iconClass: "text-negative",
        iconBgClass: "bg-negative-soft",
      };
    case "BANK_DEACTIVATED":
      return {
        Icon: Ban,
        iconClass: "text-warning",
        iconBgClass: "bg-warning-soft",
      };
  }
}

function formatRelativeStamp(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  const month = d.toLocaleString("en-US", { month: "short" });
  return `${month} ${d.getDate()}`;
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-px bg-border-soft">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="h-[88px] animate-pulse bg-surface-card"
          aria-hidden
        />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
      <Bell className="size-7 text-text-faint" strokeWidth={1.6} aria-hidden />
      <p className="font-sans text-[15px] font-semibold text-text-primary">
        Nothing here yet.
      </p>
      <p className="font-sans text-[13px] text-text-secondary">
        New activity on your account will land here.
      </p>
    </div>
  );
}
