import { api } from "@/lib/api/client";
import type { PagedResponse } from "@/lib/api/types";

// Client-facing subset of UserNotificationType. Backoffice-only types never
// reach this app.
export type ClientNotificationType =
  | "TRX_RECEIVED"
  | "TRX_APPROVED"
  | "TRX_REJECTED"
  | "BANK_DEACTIVATED"
  | "BANK_REACTIVATED"
  | "REGISTRATION_APPROVED"
  | "REGISTRATION_REJECTED";

export interface ClientNotification {
  id: string;
  type: ClientNotificationType;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

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
