import { api, type PagedResponse } from "@/lib/api";

/**
 * Subset of `UserNotificationType` (CLAUDE.md taxonomy) that the
 * client app ever surfaces. Backoffice-only types like analyst-
 * reports / colleague-joined never reach this dropdown.
 */
export type ClientNotificationType =
  | "TRX_RECEIVED"
  | "TRX_APPROVED"
  | "TRX_REJECTED"
  | "BANK_DEACTIVATED"
  | "BANK_REACTIVATED"
  | "REGISTRATION_APPROVED"
  | "REGISTRATION_REJECTED";

/** Mirror of the backend `UserNotificationResponse` DTO. */
export interface ClientNotification {
  id: string;
  type: ClientNotificationType;
  title: string;
  body: string;
  isRead: boolean;
  /** ISO-8601 timestamp from the BE OffsetDateTime. */
  createdAt: string;
}

/**
 * Last N notifications for the bell dropdown. The BE endpoint is
 * paged; we just ask for page 0 and trim — N defaults to 4 because
 * that's all the dropdown ever shows (D8 / Impact 23).
 */
export function getRecentNotifications(limit = 4) {
  return api.get<PagedResponse<ClientNotification>>("/notifications", {
    query: { page: 0, size: limit },
  });
}

/** Paginated full-page listing — drives /notifications (D10). */
export function listNotifications(page = 0, size = 20) {
  return api.get<PagedResponse<ClientNotification>>("/notifications", {
    query: { page, size },
  });
}

export function markNotificationRead(id: string) {
  return api.put<void>(`/notifications/${id}/read`);
}

export function markAllNotificationsRead() {
  return api.put<void>("/notifications/read-all");
}

export function getUnreadNotificationCount() {
  return api.get<{ count: number }>("/notifications/unread-count");
}
