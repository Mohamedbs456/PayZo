import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, ChevronDown, ShieldCheck } from "lucide-react-native";
import { TopBar } from "@/components/layout/TopBar";
import { useColorScheme } from "@/hooks/useColorScheme";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/api/error";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatMoney } from "@/lib/format";
import type { ClientAlert } from "@/features/dashboard/api";
import { cancelPendingAlert, listAlerts } from "@/features/alerts/api";
import { AlertCard } from "@/features/alerts/AlertCard";

type StatusSeg = "ALL" | "PENDING_ANALYST" | "APPROVED" | "REJECTED" | "CANCELLED";

const SEGMENTS: { value: StatusSeg; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PENDING_ANALYST", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
];

const PAGE_SIZE = 20;

export default function AlertsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useColorScheme();
  const toast = useToast();
  const params = useLocalSearchParams<{ id?: string }>();
  const deepLinkId = typeof params.id === "string" ? params.id : undefined;

  const [status, setStatus] = useState<StatusSeg>("ALL");
  const [filterOpen, setFilterOpen] = useState(false);
  const [alerts, setAlerts] = useState<ClientAlert[] | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingNext, setLoadingNext] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<ClientAlert | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const listRef = useRef<FlatList<ClientAlert>>(null);

  const fetchPage = useCallback(
    (pageIdx: number) => listAlerts({ page: pageIdx, size: PAGE_SIZE, status }),
    [status],
  );

  useEffect(() => {
    let cancelled = false;
    setAlerts(null);
    setPage(0);
    setHasMore(true);
    void (async () => {
      try {
        const res = await fetchPage(0);
        if (cancelled) return;
        setAlerts(res.content);
        setHasMore(res.content.length >= PAGE_SIZE);
      } catch (err) {
        if (cancelled) return;
        if (!(err instanceof ApiError)) throw err;
        setAlerts([]);
        setHasMore(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  async function loadNext() {
    if (loadingNext || !hasMore || alerts === null) return;
    setLoadingNext(true);
    const next = page + 1;
    try {
      const res = await fetchPage(next);
      if (res.content.length === 0) setHasMore(false);
      else {
        setAlerts((prev) => [...(prev ?? []), ...res.content]);
        setPage(next);
        setHasMore(res.content.length >= PAGE_SIZE);
      }
    } catch {
      setHasMore(false);
    } finally {
      setLoadingNext(false);
    }
  }

  // Scroll to the deep-linked alert once loaded.
  useEffect(() => {
    if (!deepLinkId || !alerts) return;
    const idx = alerts.findIndex((a) => a.id === deepLinkId);
    if (idx >= 0) {
      const handle = setTimeout(() => {
        listRef.current?.scrollToIndex({ index: idx, viewPosition: 0.2, animated: true });
      }, 150);
      return () => clearTimeout(handle);
    }
  }, [deepLinkId, alerts]);

  async function confirmCancel() {
    if (!cancelTarget) return;
    setCancelBusy(true);
    try {
      await cancelPendingAlert(cancelTarget.id);
      setAlerts((prev) =>
        (prev ?? []).map((a) => (a.id === cancelTarget.id ? { ...a, status: "CANCELLED" } : a)),
      );
      toast.showToast({ tier: "success", message: "Transfer cancelled. The money stays in your account." });
      setCancelTarget(null);
    } catch (err) {
      toast.showToast({
        tier: "danger",
        message: err instanceof ApiError && err.message ? err.message : "Unable to cancel the transfer. Please try again.",
      });
    } finally {
      setCancelBusy(false);
    }
  }

  return (
    <View className="flex-1 bg-surface-soft">
      <TopBar title="Fraud alerts" />

      <FlatList
        ref={listRef}
        data={alerts ?? []}
        keyExtractor={(a) => a.id}
        onEndReached={loadNext}
        onEndReachedThreshold={0.4}
        onScrollToIndexFailed={() => {}}
        ListHeaderComponent={
          <View className="gap-2 px-4 pb-3 pt-3">
            <Pressable
              onPress={() => setFilterOpen((o) => !o)}
              accessibilityRole="button"
              accessibilityState={{ expanded: filterOpen }}
              className="flex-row items-center justify-between rounded-xl border border-border-soft bg-surface-card px-4 py-2.5"
            >
              <View className="flex-row items-center gap-2">
                <Text className="font-sans-medium text-[11px] uppercase tracking-[0.06em] text-text-muted">Status</Text>
                <Text className="font-sans-semibold text-[13px] text-text-primary">
                  {SEGMENTS.find((s) => s.value === status)?.label}
                </Text>
              </View>
              <ChevronDown
                size={16}
                color={colors.textMuted}
                strokeWidth={2.2}
                style={{ transform: [{ rotate: filterOpen ? "180deg" : "0deg" }] }}
              />
            </Pressable>
            {filterOpen ? (
              <View className="overflow-hidden rounded-xl border border-border-soft bg-surface-card">
                {SEGMENTS.map((s, i) => {
                  const active = s.value === status;
                  return (
                    <Pressable
                      key={s.value}
                      onPress={() => {
                        setStatus(s.value);
                        setFilterOpen(false);
                      }}
                      className={cn("flex-row items-center justify-between px-4 py-3", i > 0 && "border-t border-border-soft")}
                    >
                      <Text
                        className={cn(
                          "text-[13px]",
                          active ? "font-sans-semibold text-accent" : "font-sans-medium text-text-secondary",
                        )}
                      >
                        {s.label}
                      </Text>
                      {active ? <Check size={16} color={colors.accent} strokeWidth={2.4} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <View className={cn("px-4", deepLinkId === item.id && "rounded-[16px]")}>
            <View className={cn(deepLinkId === item.id && "rounded-[16px] border-2 border-accent")}>
              <AlertCard alert={item} onCancel={() => setCancelTarget(item)} />
            </View>
          </View>
        )}
        ItemSeparatorComponent={() => <View className="h-3" />}
        ListEmptyComponent={
          alerts === null ? (
            <View className="items-center py-16">
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : (
            <EmptyState
              icon={ShieldCheck}
              title="No alerts here"
              message="Alerts appear when our fraud checks flag an outgoing transfer for review."
            />
          )
        }
        ListFooterComponent={
          alerts !== null && alerts.length > 0 ? (
            <View className="items-center py-5">
              {loadingNext ? (
                <ActivityIndicator color={colors.textMuted} />
              ) : !hasMore ? (
                <Text className="font-sans text-[12px] text-text-muted">You've reached the end.</Text>
              ) : null}
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
      />

      <ConfirmDialog
        open={!!cancelTarget}
        variant="warning"
        title="Cancel this transfer?"
        message={
          cancelTarget
            ? `You're about to cancel the ${formatMoney(cancelTarget.amount)} TND transfer to ${cancelTarget.counterpartName}. The money returns to your account and the analyst is notified.`
            : ""
        }
        confirmLabel="Cancel transfer"
        cancelLabel="Keep waiting"
        busy={cancelBusy}
        onConfirm={confirmCancel}
        onCancel={() => setCancelTarget(null)}
      />
    </View>
  );
}
