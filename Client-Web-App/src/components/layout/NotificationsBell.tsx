import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownLeft,
  Ban,
  Bell,
  CheckCircle2,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { withDemo } from "@/lib/demoMode";
import { ApiError } from "@/lib/api";
import { isDemoMode } from "@/lib/demoMode";
import {
  type ClientNotification,
  type ClientNotificationType,
  getRecentNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/features/notifications/api";
import { DEMO_NOTIFICATIONS } from "@/features/notifications/mockData";

type Variant = "dark" | "light";

interface NotificationsBellProps {
  /** Match the TopBar variant so the bell button blends in. */
  variant: Variant;
}

/**
 * Self-contained bell button + dropdown (Figma 18:55, Impact 23).
 *
 *   - Click bell → toggle dropdown
 *   - Click outside / Escape → close
 *   - Click a notification → mark it as read (no expansion, no nav —
 *     we never built a full notifications page, by design)
 *   - "Mark all read" → flip every row to read
 *
 * Hard-capped at 4 most-recent notifications. Anything older lives
 * server-side; the user just sees the last batch.
 *
 * Production fetches via `getRecentNotifications`; demo mode short-
 * circuits to `DEMO_NOTIFICATIONS` so `?demo` works on every
 * internal page without a backend.
 */
export function NotificationsBell({ variant }: NotificationsBellProps) {
  const isDark = variant === "dark";

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ClientNotification[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const demo = isDemoMode();

  // Initial fetch — refetch every time the dropdown is opened so the
  // numbers stay fresh after time-away. Demo skips the wire.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (demo) {
        if (!cancelled) setItems(DEMO_NOTIFICATIONS);
        return;
      }
      try {
        const page = await getRecentNotifications(4);
        if (!cancelled) setItems(page.content.slice(0, 4));
      } catch (err) {
        if (cancelled) return;
        if (!(err instanceof ApiError)) throw err;
        // Endpoint not reachable — render empty rather than blocking.
        setItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [demo, open]);

  // Click-outside + Escape to close.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unreadCount = items.filter((n) => !n.isRead).length;

  async function onMarkRead(id: string) {
    // Optimistic — flip locally, fire-and-forget. Demo skips the call.
    setItems((list) =>
      list.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
    );
    if (demo) return;
    try {
      await markNotificationRead(id);
    } catch {
      // Silent — the dropdown re-fetches on next open and reconciles.
    }
  }

  async function onMarkAllRead() {
    setItems((list) => list.map((n) => ({ ...n, isRead: true })));
    if (demo) return;
    try {
      await markAllNotificationsRead();
    } catch {
      // Same as above — eventual reconciliation on next open.
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      {/* Bell trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={
          unreadCount > 0
            ? `Notifications (${unreadCount} unread)`
            : "Notifications"
        }
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "relative flex size-10 shrink-0 items-center justify-center rounded-[10px] transition-colors duration-150 ease-out",
          isDark
            ? "text-text-on-inverse hover:bg-white/5"
            : "text-text-primary hover:bg-surface-card",
        )}
      >
        <Bell className="size-5" strokeWidth={1.8} aria-hidden />
        {unreadCount > 0 && (
          <span
            className="absolute right-2 top-2 size-2 rounded-full bg-negative"
            aria-hidden
          />
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          role="menu"
          aria-label="Notifications"
          className={cn(
            "absolute right-0 top-full z-50 mt-2 w-[min(92vw,420px)] origin-top-right",
            "overflow-hidden rounded-2xl border border-border bg-surface-raised",
            "shadow-[0px_16px_48px_0px_rgba(0,0,0,0.45)]",
            "animate-in fade-in zoom-in-95 duration-150",
          )}
          style={{
            // Tailwind v4 doesn't ship the animate-in plugin by default,
            // so back the entry animation with an inline keyframe ref.
            animation: "fadeIn 150ms ease-out",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border-soft px-5 py-4">
            <h3 className="font-sans text-[16px] font-semibold text-text-primary">
              Notifications
            </h3>
            <button
              type="button"
              onClick={onMarkAllRead}
              disabled={unreadCount === 0}
              className="font-sans text-[12px] font-semibold text-text-secondary transition-colors duration-150 ease-out hover:text-accent disabled:cursor-default disabled:text-text-faint disabled:hover:text-text-faint"
            >
              Mark all read
            </button>
          </div>

          {/* List */}
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
              <Bell
                className="size-6 text-text-faint"
                strokeWidth={1.6}
                aria-hidden
              />
              <p className="font-sans text-[13px] font-semibold text-text-primary">
                Nothing new
              </p>
              <p className="font-sans text-[12px] text-text-muted">
                You're all caught up.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col">
              {items.slice(0, 4).map((n) => (
                <NotificationRow
                  key={n.id}
                  notification={n}
                  onMarkRead={onMarkRead}
                />
              ))}
            </ul>
          )}

          {/* Footer — View all → /notifications (D10) */}
          <div className="border-t border-border-soft px-5 py-3 text-right">
            <Link
              to={withDemo("/notifications")}
              onClick={() => setOpen(false)}
              className="font-sans text-[12px] font-semibold text-accent transition-colors duration-150 ease-out hover:text-accent/80"
            >
              View all notifications →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Row ─────────────────────────────────────────────────────────────── */

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
    <li>
      <button
        type="button"
        onClick={() => isUnread && onMarkRead(notification.id)}
        className={cn(
          "flex w-full items-start gap-3 border-t border-border-soft px-5 py-3.5 text-left transition-colors duration-150 ease-out",
          isUnread
            ? "bg-accent-soft hover:bg-accent-soft/80"
            : "bg-transparent hover:bg-surface-soft",
          !isUnread && "cursor-default",
        )}
      >
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-[10px]",
            iconBgClass,
          )}
          aria-hidden
        >
          <Icon className={cn("size-4", iconClass)} strokeWidth={2} />
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="truncate font-sans text-[13px] font-semibold text-text-primary">
            {notification.title}
          </p>
          <p className="truncate font-sans text-[12px] text-text-secondary">
            {notification.body}
          </p>
          <p className="font-sans text-[11px] text-text-muted">
            {formatRelativeStamp(notification.createdAt)}
          </p>
        </div>

        {isUnread && (
          <span
            className="mt-1 size-2 shrink-0 rounded-full bg-accent"
            aria-label="Unread"
          />
        )}
      </button>
    </li>
  );
}

/* ─── Type → icon mapping ─────────────────────────────────────────────── */

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

/* ─── Time formatter ──────────────────────────────────────────────────── */

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
