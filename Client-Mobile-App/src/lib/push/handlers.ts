import { useEffect } from "react";
import { router } from "expo-router";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { showToast, type ToastTier } from "@/components/ui/Toast";
import { routeForPush, type PushData } from "@/lib/push/deeplink";

// Foreground notifications are surfaced as a Toast, not the system tray, so the
// OS banner is suppressed while the app is active (SDK 52 handler shape).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const LAST_RESP_KEY = "payzo.client.lastPushResponseId";

// Only a recognized client notification has a real in-app destination. A typeless
// or unknown notification must NOT deep-link: routeForPush falls back to the
// Notifications inbox, which (with the response listener re-firing the launch
// notification on every cold start) drags even a signed-out user onto that screen
// repeatedly.
const DEEP_LINK_TYPES = new Set([
  "TRX_RECEIVED",
  "TRX_APPROVED",
  "TRX_REJECTED",
  "FRAUD_ALERT_PENDING",
  "REGISTRATION_APPROVED",
  "REGISTRATION_REJECTED",
  "BANK_DEACTIVATED",
  "BANK_REACTIVATED",
]);

function tierForType(type: unknown): ToastTier {
  switch (type) {
    case "TRX_RECEIVED":
    case "TRX_APPROVED":
    case "REGISTRATION_APPROVED":
    case "BANK_REACTIVATED":
      return "success";
    case "TRX_REJECTED":
    case "REGISTRATION_REJECTED":
    case "FRAUD_ALERT_PENDING":
      return "danger";
    case "BANK_DEACTIVATED":
      return "warning";
    default:
      return "info";
  }
}

function dataOf(notification: Notifications.Notification): PushData {
  return (notification.request.content.data ?? {}) as PushData;
}

// The events behind a push change account state; refresh what the user sees.
function invalidateAfterPush(qc: QueryClient) {
  for (const key of [["unreadCount"], ["recent"], ["alertSummary"], ["transactions"], ["accounts"]]) {
    void qc.invalidateQueries({ queryKey: key });
  }
}

export function usePushNotifications() {
  const queryClient = useQueryClient();

  useEffect(() => {
    async function openFrom(response: Notifications.NotificationResponse) {
      const id = response.notification.request.identifier;
      // The launch notification is redelivered to this listener AND to
      // getLastNotificationResponseAsync on EVERY cold start, so an in-memory
      // guard (reset per process) re-navigates on each open. Dedup persistently —
      // act on a given notification id at most once, ever.
      if (id) {
        if ((await AsyncStorage.getItem(LAST_RESP_KEY)) === id) return;
        await AsyncStorage.setItem(LAST_RESP_KEY, id);
      }
      const data = dataOf(response.notification);
      const type = typeof data.type === "string" ? data.type : null;
      if (__DEV__) console.log("[push] openFrom", JSON.stringify({ id, type }));
      if (!type || !DEEP_LINK_TYPES.has(type)) return;
      invalidateAfterPush(queryClient);
      router.push(routeForPush(data));
    }

    const received = Notifications.addNotificationReceivedListener((n) => {
      const { title, body, data } = n.request.content;
      showToast({ tier: tierForType(data?.type), message: body || title || "New activity on your account." });
      invalidateAfterPush(queryClient);
    });
    const tapped = Notifications.addNotificationResponseReceivedListener((r) => void openFrom(r));

    // Cold-start: resolve the launch notification once the tree has mounted.
    const cold = setTimeout(() => {
      void Notifications.getLastNotificationResponseAsync().then((r) => {
        if (r) void openFrom(r);
      });
    }, 100);

    return () => {
      received.remove();
      tapped.remove();
      clearTimeout(cold);
    };
  }, [queryClient]);
}
