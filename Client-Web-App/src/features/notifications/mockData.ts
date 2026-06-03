import type { ClientNotification } from "@/features/notifications/api";

const minutesAgo = (n: number) =>
  new Date(Date.now() - n * 60_000).toISOString();

/**
 * Bell-dropdown mock used by `?demo`. 2 unread + 2 read mirrors
 * Figma 18:55 (the top two rows have the cyan tint + the unread dot,
 * the bottom two are already read).
 */
export const DEMO_NOTIFICATIONS: ClientNotification[] = [
  {
    id: "n-1",
    type: "TRX_RECEIVED",
    title: "Transfer received",
    body: "Sara M. sent you 250.000 TND",
    isRead: false,
    createdAt: minutesAgo(2),
  },
  {
    id: "n-2",
    type: "TRX_APPROVED",
    title: "Transfer cleared",
    body: "Your suspended transfer was cleared",
    isRead: false,
    createdAt: minutesAgo(2),
  },
  {
    id: "n-3",
    type: "BANK_DEACTIVATED",
    title: "Bank deactivated",
    body: "BIAT temporarily deactivated",
    isRead: true,
    createdAt: minutesAgo(2),
  },
  {
    id: "n-4",
    type: "TRX_RECEIVED",
    title: "Transfer received",
    body: "Sara M. sent you 250.000 TND",
    isRead: true,
    createdAt: minutesAgo(2),
  },
];
