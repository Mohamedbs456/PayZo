import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowDownLeft,
  Ban,
  Bell,
  CheckCircle2,
  XCircle,
  X,
  type LucideIcon,
} from "lucide-react-native";
import { useColorScheme } from "@/hooks/useColorScheme";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/api/error";
import {
  type ClientNotification,
  type ClientNotificationType,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/features/notifications/api";

const PAGE_SIZE = 20;

export default function NotificationsModal() {
  const insets = useSafeAreaInsets();
  const { colors } = useColorScheme();

  const [items, setItems] = useState<ClientNotification[] | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingNext, setLoadingNext] = useState(false);

  useEffect(() => {
    if (__DEV__) console.log("[notif] screen mounted");
    let cancelled = false;
    void (async () => {
      try {
        const res = await listNotifications(0, PAGE_SIZE);
        if (cancelled) return;
        setItems(res.content);
        setHasMore(res.content.length >= PAGE_SIZE);
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
  }, []);

  const loadNext = useCallback(async () => {
    if (loadingNext || !hasMore || items === null) return;
    setLoadingNext(true);
    const next = page + 1;
    try {
      const res = await listNotifications(next, PAGE_SIZE);
      if (res.content.length === 0) setHasMore(false);
      else {
        setItems((prev) => [...(prev ?? []), ...res.content]);
        setPage(next);
        setHasMore(res.content.length >= PAGE_SIZE);
      }
    } catch {
      setHasMore(false);
    } finally {
      setLoadingNext(false);
    }
  }, [loadingNext, hasMore, items, page]);

  async function markRead(id: string) {
    setItems((list) => list?.map((n) => (n.id === id ? { ...n, isRead: true } : n)) ?? null);
    try {
      await markNotificationRead(id);
    } catch {
      // Reconciles on next fetch.
    }
  }

  async function markAll() {
    setItems((list) => list?.map((n) => ({ ...n, isRead: true })) ?? null);
    try {
      await markAllNotificationsRead();
    } catch {
      // Reconciles on next fetch.
    }
  }

  const unreadCount = items ? items.filter((n) => !n.isRead).length : 0;

  return (
    <View className="flex-1 bg-surface-soft" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-4 py-3">
        <View className="flex-row items-center gap-2">
          <Text className="font-display-bold text-[18px] text-text-primary">Notifications</Text>
          {unreadCount > 0 ? (
            <View className="h-6 justify-center rounded-full bg-accent-soft px-2.5">
              <Text className="font-sans-semibold text-[12px] text-accent">{unreadCount} unread</Text>
            </View>
          ) : null}
        </View>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/dashboard"))} accessibilityLabel="Close" hitSlop={8} className="size-9 items-center justify-center rounded-full">
          <X size={22} color={colors.textPrimary} strokeWidth={2} />
        </Pressable>
      </View>

      <FlatList
        data={items ?? []}
        keyExtractor={(n) => n.id}
        onEndReached={loadNext}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View className="gap-3 px-4 pb-3 pt-1">
            <View className="flex-row justify-end">
              <Pressable onPress={markAll} disabled={unreadCount === 0} accessibilityRole="button" hitSlop={6}>
                <Text className={cn("font-sans-semibold text-[13px]", unreadCount === 0 ? "text-text-faint" : "text-accent")}>
                  Mark all read
                </Text>
              </Pressable>
            </View>
          </View>
        }
        renderItem={({ item }) => <NotificationRow notification={item} colors={colors} onMarkRead={markRead} />}
        ItemSeparatorComponent={() => <View className="h-px bg-border-soft" />}
        ListEmptyComponent={
          items === null ? (
            <View className="items-center py-16">
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : (
            <View className="items-center gap-2 px-6 py-16">
              <Bell size={28} color={colors.textFaint} strokeWidth={1.6} />
              <Text className="font-sans-semibold text-[15px] text-text-primary">Nothing here yet.</Text>
              <Text className="text-center font-sans text-[13px] text-text-secondary">
                New activity on your account will appear here.
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          loadingNext ? (
            <View className="items-center py-5">
              <ActivityIndicator color={colors.textMuted} />
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      />
    </View>
  );
}

function NotificationRow({
  notification,
  colors,
  onMarkRead,
}: {
  notification: ClientNotification;
  colors: ReturnType<typeof useColorScheme>["colors"];
  onMarkRead: (id: string) => void;
}) {
  const visual = visualForType(notification.type, colors);
  const unread = !notification.isRead;
  return (
    <Pressable
      onPress={() => unread && onMarkRead(notification.id)}
      className={cn("flex-row items-start gap-3 px-4 py-4", unread ? "bg-accent-soft" : "bg-surface-soft")}
    >
      <View className={cn("size-10 items-center justify-center rounded-[10px]", visual.bg)}>
        <visual.Icon size={20} color={visual.color} strokeWidth={2} />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text numberOfLines={1} className="font-sans-semibold text-[14px] text-text-primary">
          {notification.title}
        </Text>
        <Text className="font-sans text-[13px] text-text-secondary">{notification.body}</Text>
        <Text className="font-sans text-[11px] text-text-muted">{formatStamp(notification.createdAt)}</Text>
      </View>
      {unread ? <View className="mt-1.5 size-2 rounded-full bg-accent" /> : null}
    </Pressable>
  );
}

function visualForType(
  type: ClientNotificationType,
  colors: ReturnType<typeof useColorScheme>["colors"],
): { Icon: LucideIcon; color: string; bg: string } {
  switch (type) {
    case "TRX_RECEIVED":
      return { Icon: ArrowDownLeft, color: colors.positive, bg: "bg-positive-soft" };
    case "TRX_APPROVED":
    case "BANK_REACTIVATED":
    case "REGISTRATION_APPROVED":
      return { Icon: CheckCircle2, color: colors.positive, bg: "bg-positive-soft" };
    case "TRX_REJECTED":
    case "REGISTRATION_REJECTED":
      return { Icon: XCircle, color: colors.negative, bg: "bg-negative-soft" };
    case "BANK_DEACTIVATED":
      return { Icon: Ban, color: colors.warning, bg: "bg-warning-soft" };
  }
}

function formatStamp(iso: string): string {
  const d = new Date(iso);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return `${d.toLocaleString("en-US", { month: "short" })} ${d.getDate()}`;
}
