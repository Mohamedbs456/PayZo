import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Send,
  ShieldAlert,
  Users,
} from "lucide-react-native";
import { TopBar } from "@/components/layout/TopBar";
import { GradientHeader } from "@/components/ui/GradientHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { Chip } from "@/components/ui/Chip";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useMe, deriveInitials } from "@/hooks/useMe";
import { useAuthStore } from "@/store/authStore";
import { formatMoney, formatWelcomeDate, relativeTime } from "@/lib/format";
import { biometricAvailable } from "@/lib/auth/biometric";
import {
  getAccounts,
  getAlertSummary,
  getRecentTransactions,
  type ClientAlertSummary,
  type ClientTransaction,
} from "@/features/dashboard/api";
import { getUnreadNotificationCount } from "@/features/notifications/api";
import { registerForPush } from "@/lib/push/registration";
import { FirstLoginModal } from "@/features/auth/FirstLoginModal";

const EMPTY_SUMMARY: ClientAlertSummary = {
  alerts: [],
  totalCount: 0,
  underReviewCount: 0,
  rejectedCount: 0,
};

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useColorScheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const authed = useAuthStore((s) => s.authed);
  const userId = useAuthStore((s) => s.userId);
  const biometricEnabled = useAuthStore((s) => s.biometricEnabled);
  const { me } = useMe();

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const handle = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(handle);
  }, []);

  // Register for push once the session is live (no-op on emulator / without FCM).
  useEffect(() => {
    if (authed) void registerForPush();
  }, [authed]);

  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: getAccounts, enabled: authed });
  const recentQ = useQuery({
    queryKey: ["recent"],
    queryFn: () => getRecentTransactions(4),
    enabled: authed,
  });
  const alertsQ = useQuery({
    queryKey: ["alertSummary"],
    queryFn: getAlertSummary,
    enabled: authed,
  });
  const unreadQ = useQuery({
    queryKey: ["unreadCount"],
    queryFn: getUnreadNotificationCount,
    enabled: authed,
    refetchInterval: 60_000,
  });

  const accounts = accountsQ.data ?? [];
  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
  const bankCodes = Array.from(new Set(accounts.map((a) => a.bankCode)));
  const firstName = me?.firstName ?? "there";
  const summary = alertsQ.data ?? EMPTY_SUMMARY;

  // Offer biometric enrollment once, after first login, when hardware allows.
  const [showEnroll, setShowEnroll] = useState(false);
  const enrollChecked = useRef(false);
  useEffect(() => {
    console.log("[enroll] run authed=", authed, "firstLogin=", me?.firstLoginCompleted, "bioEnabled=", biometricEnabled, "checked=", enrollChecked.current);
    if (!authed || me?.firstLoginCompleted === false || biometricEnabled) return;
    if (enrollChecked.current) return;
    enrollChecked.current = true;
    void (async () => {
      const asked = await AsyncStorage.getItem("payzo.client.biometricAsked");
      console.log("[enroll] asked=", asked);
      if (asked === "1") return;
      if (await biometricAvailable()) setShowEnroll(true);
    })();
  }, [authed, me?.firstLoginCompleted, biometricEnabled]);

  async function confirmEnroll() {
    setShowEnroll(false);
    await AsyncStorage.setItem("payzo.client.biometricAsked", "1");
    try {
      await useAuthStore.getState().enableBiometric();
      toast.showToast({ tier: "success", message: "Fingerprint unlock is enabled." });
    } catch {
      toast.showToast({
        tier: "warning",
        message: "Unable to enable fingerprint unlock. You can turn it on later in More.",
      });
    }
  }

  function declineEnroll() {
    setShowEnroll(false);
    void AsyncStorage.setItem("payzo.client.biometricAsked", "1");
  }

  return (
    <View className="flex-1 bg-surface-soft">
      <TopBar
        title={`Welcome back, ${firstName}`}
        subtitle={formatWelcomeDate(now)}
        me={me ? { initials: deriveInitials(me), trustScore: me.trustScore, profilePictureUrl: me.profilePictureUrl } : null}
        onAvatarPress={() => router.push("/profile-menu")}
        onBellPress={() => router.push("/notifications")}
        unreadCount={unreadQ.data?.count ?? 0}
      />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 96, gap: 16 }}>
        <BalanceHero
          totalBalance={totalBalance}
          bankCodes={bankCodes}
          accountCount={accounts.length}
          loading={accountsQ.isLoading}
        />

        <View className="flex-row gap-3">
          <Pressable
            onPress={() => router.push("/beneficiaries")}
            accessibilityRole="button"
            accessibilityLabel="Beneficiaries"
            style={{ width: "35%" }}
            className="items-center justify-center gap-1.5 rounded-[14px] border border-border-soft bg-surface-card py-3"
          >
            <Users size={20} color={colors.accent} strokeWidth={2} />
            <Text className="font-sans-semibold text-[12px] text-text-primary">Beneficiaries</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/(tabs)/transfer")}
            accessibilityRole="button"
            className="flex-1 flex-row items-center justify-center gap-2 rounded-[14px] bg-accent py-3.5"
          >
            <Send size={18} color={colors.accentForeground} strokeWidth={2} />
            <Text className="font-sans-bold text-[15px] text-accent-foreground">Send money</Text>
            <ArrowRight size={16} color={colors.accentForeground} strokeWidth={2.4} />
          </Pressable>
        </View>

        <RecentCard
          transactions={recentQ.data?.content ?? []}
          loading={recentQ.isLoading}
          colors={colors}
        />

        <FraudCard summary={summary} accent={colors.warning} />
      </ScrollView>

      {me?.firstLoginCompleted === false ? (
        <FirstLoginModal
          firstName={firstName === "there" ? "" : firstName}
          onSuccess={() =>
            queryClient.setQueryData(
              ["me", userId],
              (old: typeof me) => (old ? { ...old, firstLoginCompleted: true } : old),
            )
          }
        />
      ) : null}

      <ConfirmDialog
        open={showEnroll}
        variant="positive"
        title="Enable fingerprint unlock?"
        message="Use your fingerprint to unlock PayZo next time instead of your password."
        confirmLabel="Enable"
        cancelLabel="Not now"
        onConfirm={confirmEnroll}
        onCancel={declineEnroll}
      />
    </View>
  );
}

function BalanceHero({
  totalBalance,
  bankCodes,
  accountCount,
  loading,
}: {
  totalBalance: number;
  bankCodes: string[];
  accountCount: number;
  loading: boolean;
}) {
  return (
    <GradientHeader variant="balanceTeal" className="gap-3 p-5">
      <Text className="font-sans-medium text-[11px] uppercase tracking-[0.66px] text-text-on-inverse">
        Total balance
      </Text>
      {loading ? (
        <Skeleton className="h-10 w-48" />
      ) : (
        <View className="flex-row items-end gap-2">
          <Text className="font-display-bold text-[36px] text-text-on-inverse">
            {formatMoney(totalBalance)}
          </Text>
          <Text className="pb-1.5 font-sans text-[13px] text-text-on-inverse">TND</Text>
        </View>
      )}
      <View className="flex-row flex-wrap items-center gap-1.5">
        <Text className="font-sans text-[12px] text-text-on-inverse">
          {accountCount} account{accountCount === 1 ? "" : "s"}
        </Text>
        {bankCodes.slice(0, 4).map((code) => (
          <View key={code} className="rounded-full bg-[rgba(241,250,238,0.16)] px-2 py-0.5">
            <Text className="font-sans-semibold text-[10px] text-text-on-inverse">{code}</Text>
          </View>
        ))}
      </View>
    </GradientHeader>
  );
}

function RecentCard({
  transactions,
  loading,
  colors,
}: {
  transactions: ClientTransaction[];
  loading: boolean;
  colors: ReturnType<typeof useColorScheme>["colors"];
}) {
  return (
    <View className="gap-3 rounded-[16px] border border-border-soft bg-surface-card p-4">
      <View className="flex-row items-center justify-between">
        <Text className="font-sans-bold text-[15px] text-text-primary">Recent activity</Text>
        <Pressable onPress={() => router.push("/(tabs)/transactions")} hitSlop={6}>
          <Text className="font-sans-semibold text-[12px] text-accent">See all</Text>
        </Pressable>
      </View>

      {loading ? (
        <View className="gap-3">
          {[0, 1, 2].map((i) => (
            <View key={i} className="flex-row items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <View className="flex-1 gap-2">
                <Skeleton className="h-3.5 w-36" />
                <Skeleton className="h-3 w-20" />
              </View>
            </View>
          ))}
        </View>
      ) : transactions.length === 0 ? (
        <Text className="py-6 text-center font-sans text-[13px] text-text-muted">
          No transactions yet.
        </Text>
      ) : (
        <View className="gap-3">
          {transactions.map((t) => {
            const credit = t.type === "CREDIT";
            return (
              <View key={t.id} className="flex-row items-center gap-3">
                <View
                  className={cnTone(credit)}
                >
                  {credit ? (
                    <ArrowDownLeft size={18} color={colors.positive} strokeWidth={2} />
                  ) : (
                    <ArrowUpRight size={18} color={colors.textSecondary} strokeWidth={2} />
                  )}
                </View>
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="font-sans-semibold text-[14px] text-text-primary">
                    {t.counterpartName ?? t.description ?? "Transaction"}
                  </Text>
                  <Text className="font-sans text-[11px] text-text-muted">
                    {relativeTime(t.timestamp)}
                  </Text>
                </View>
                <Text
                  className="font-sans-semibold text-[14px]"
                  style={{ color: credit ? colors.positive : colors.textPrimary }}
                >
                  {credit ? "+" : "-"}
                  {formatMoney(t.amount)}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function cnTone(credit: boolean): string {
  return credit
    ? "size-10 items-center justify-center rounded-full bg-positive-soft"
    : "size-10 items-center justify-center rounded-full bg-surface-raised";
}

function FraudCard({ summary, accent }: { summary: ClientAlertSummary; accent: string }) {
  const has = summary.totalCount > 0;
  return (
    <View className="flex-row items-center gap-3 rounded-[16px] border border-border-soft bg-surface-card p-4">
      <View className="size-10 items-center justify-center rounded-full bg-warning-soft">
        <ShieldAlert size={20} color={accent} strokeWidth={2} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="font-sans-bold text-[14px] text-text-primary">Fraud alerts</Text>
        <Text className="font-sans text-[12px] text-text-secondary">
          {has
            ? `${summary.underReviewCount} under review · ${summary.rejectedCount} rejected`
            : "No alerts require your attention."}
        </Text>
      </View>
      {has ? <Chip label={String(summary.totalCount)} tone="warning" /> : null}
    </View>
  );
}
