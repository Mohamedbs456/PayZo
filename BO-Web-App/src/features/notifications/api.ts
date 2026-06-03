import { api } from "@/lib/api/client";

/**
 * Mirror of payzo-backend's UserNotificationType enum (backoffice-relevant
 * subset). The FE keeps the full union so unknown values from a forward-
 * compatible backend still type-check; the icon registry has a fallback.
 */
export type NotificationType =
  // Admin
  | "NEW_PENDING_REGISTRATION"
  | "CLIENT_FIRST_LOGIN"
  // Analyst
  | "FRAUD_ALERT_PENDING"
  | "ML_PRIMARY_DOWN"
  | "ML_PRIMARY_UP"
  | "ML_BACKUP_DOWN"
  | "ML_THRESHOLDS_UPDATED"
  // SuperAdmin
  | "ANALYST_THRESHOLD_REPORT"
  | "ML_BACKUP_UP"
  | "ADMIN_CREATED"
  | "ADMIN_DELETED"
  | "ANALYST_CREATED"
  | "ANALYST_DELETED"
  | "BANK_ADDED"
  | "BANK_REMOVED_FROM_CBS"
  | "CLIENT_BLOCKED"
  | "CLIENT_UNBLOCKED"
  // Shared (backoffice)
  | "COLLEAGUE_JOINED"
  | "COLLEAGUE_LEFT"
  // Forward-compat placeholder
  | (string & {});

export interface NotificationItem {
  id: string;
  title: string;
  /** Body text. BE serializes this from {@code message} via {@code @JsonProperty("body")}. */
  body: string;
  type: NotificationType;
  /** Read flag. BE serializes this from {@code read} via {@code @JsonProperty("isRead")}. */
  isRead: boolean;
  /** ISO datetime — server clock. */
  createdAt: string;
}

/** Cursor-paginated envelope from /backoffice/notifications. */
export interface NotificationPage {
  items: NotificationItem[];
  /** Echoed back as `?cursor=…` for the next page; null = end of feed. */
  nextCursor: string | null;
  hasMore: boolean;
}

/* ─── Calls ───────────────────────────────────────────────────────────── */

/** Bell-dropdown feed — newest first, cursor-paginated for infinite scroll. */
export function fetchNotifications(params: {
  cursor?: string | null;
  limit?: number;
  signal?: AbortSignal;
}): Promise<NotificationPage> {
  return api.get<NotificationPage>("/backoffice/notifications", {
    query: {
      cursor: params.cursor ?? undefined,
      limit: params.limit ?? 20,
    },
    signal: params.signal,
  });
}

/** Number of unread rows for the current user — drives the bell red dot. */
export function fetchUnreadCount(signal?: AbortSignal): Promise<number> {
  return api
    .get<{ count: number }>("/notifications/unread-count", { signal })
    .then((r) => r.count);
}

/** Mark a single notification as read. */
export function markNotificationRead(id: string): Promise<void> {
  return api.put<void>(`/notifications/${id}/read`);
}

/** Mark every unread notification as read for the current user. */
export function markAllNotificationsRead(): Promise<void> {
  return api.put<void>("/notifications/read-all");
}
