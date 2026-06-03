import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Star,
  Wallet,
} from "lucide-react-native";
import { TopBar } from "@/components/layout/TopBar";
import { GradientHeader } from "@/components/ui/GradientHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useMe } from "@/hooks/useMe";
import { useAuthStore } from "@/store/authStore";
import { formatMoney } from "@/lib/format";
import { formatRibDisplay } from "@/lib/rib";
import { getAccounts, type ClientAccount } from "@/features/dashboard/api";

interface Bucket {
  bankCode: string;
  bankName: string;
  total: number;
  accounts: ClientAccount[];
}

export default function AccountsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useColorScheme();
  const { me } = useMe();
  const authed = useAuthStore((s) => s.authed);

  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: getAccounts, enabled: authed });
  const accounts = accountsQ.data ?? [];

  const buckets = useMemo<Bucket[]>(() => {
    const map = new Map<string, Bucket>();
    for (const a of accounts) {
      const cur = map.get(a.bankCode) ?? { bankCode: a.bankCode, bankName: a.bankName, total: 0, accounts: [] };
      cur.total += a.balance;
      cur.accounts.push(a);
      map.set(a.bankCode, cur);
    }
    return Array.from(map.values()).sort((x, y) => y.total - x.total);
  }, [accounts]);

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);

  return (
    <View className="flex-1 bg-surface-soft">
      <TopBar title="My accounts" />

      {accountsQ.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : accounts.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No accounts on file"
          message="Once your bank shares an account with PayZo, it'll appear here."
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 96, gap: 16 }}>
          <GradientHeader variant="balanceTeal" className="gap-3 p-5">
            <Text className="font-sans-medium text-[11px] uppercase tracking-[0.66px] text-text-on-inverse">
              Total balance
            </Text>
            <View className="flex-row items-end gap-2">
              <Text className="font-display-bold text-[34px] text-text-on-inverse">{formatMoney(totalBalance)}</Text>
              <Text className="pb-1.5 font-sans text-[13px] text-text-on-inverse">TND</Text>
            </View>
            <Text className="font-sans text-[12px] text-text-on-inverse">
              {buckets.length} bank{buckets.length === 1 ? "" : "s"} · {accounts.length} account
              {accounts.length === 1 ? "" : "s"}
            </Text>
            <View className="mt-1 gap-2">
              {buckets.map((b) => {
                const pct = totalBalance > 0 ? Math.max(0.04, b.total / totalBalance) : 0;
                return (
                  <View key={b.bankCode} className="gap-1">
                    <View className="flex-row justify-between">
                      <Text className="font-sans-semibold text-[11px] text-text-on-inverse">{b.bankCode}</Text>
                      <Text className="font-sans text-[11px] text-text-on-inverse">{Math.round(pct * 100)}%</Text>
                    </View>
                    <View className="h-1.5 overflow-hidden rounded-full bg-[rgba(241,250,238,0.18)]">
                      <View
                        className="h-full rounded-full bg-[rgba(241,250,238,0.85)]"
                        style={{ width: `${pct * 100}%` }}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          </GradientHeader>

          <View className="gap-3">
            <Text className="px-1 font-display-bold text-[18px] text-text-primary">Your banks</Text>
            {buckets.map((b) => (
              <BankCard
                key={b.bankCode}
                bucket={b}
                defaultAccountId={me?.defaultAccountId ?? null}
                colors={colors}
              />
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function BankCard({
  bucket,
  defaultAccountId,
  colors,
}: {
  bucket: Bucket;
  defaultAccountId: string | null;
  colors: ReturnType<typeof useColorScheme>["colors"];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <View className="overflow-hidden rounded-2xl border border-border-soft bg-surface-card">
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="h-[76px] flex-row items-center justify-between gap-3 px-5"
      >
        <View className="min-w-0 flex-1 flex-row items-center gap-3.5">
          <View className="size-9 items-center justify-center rounded-2xl bg-accent">
            <Text className="font-sans-bold text-[11px] text-accent-foreground">{bucket.bankCode}</Text>
          </View>
          <View className="min-w-0 flex-1">
            <Text className="font-sans-bold text-[15px] text-text-primary">{bucket.bankCode}</Text>
            <Text numberOfLines={1} className="font-sans text-[12px] text-text-secondary">
              {bucket.bankName} · {bucket.accounts.length} account{bucket.accounts.length === 1 ? "" : "s"}
            </Text>
          </View>
        </View>
        <View className="shrink-0 flex-row items-center gap-3">
          <View className="items-end">
            <Text className="font-sans-bold text-[16px] text-text-primary">{formatMoney(bucket.total)} TND</Text>
            <Text className="font-sans text-[11px] text-text-secondary">Total balance</Text>
          </View>
          <ChevronDown
            size={16}
            color={colors.textSecondary}
            strokeWidth={2.4}
            style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}
          />
        </View>
      </Pressable>

      {open
        ? bucket.accounts.map((a) => (
            <AccountRow
              key={a.accountNumber}
              account={a}
              selected={selected === a.accountNumber}
              isDefault={defaultAccountId === a.accountNumber}
              colors={colors}
              onToggle={() => setSelected((cur) => (cur === a.accountNumber ? null : a.accountNumber))}
            />
          ))
        : null}
    </View>
  );
}

function AccountRow({
  account,
  selected,
  isDefault,
  colors,
  onToggle,
}: {
  account: ClientAccount;
  selected: boolean;
  isDefault: boolean;
  colors: ReturnType<typeof useColorScheme>["colors"];
  onToggle: () => void;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  async function copy() {
    await Clipboard.setStringAsync(account.accountNumber);
    setCopied(true);
    toast.showToast({ tier: "success", message: "Account number copied." });
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <View className="border-t border-border-soft">
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: selected }}
        className={cn("h-[60px] flex-row items-center justify-between gap-3 px-5", selected && "bg-accent-soft")}
      >
        <View className="min-w-0 flex-1 flex-row items-center gap-3">
          <View className={cn("rounded-lg px-2 py-0.5", account.type === "SAVINGS" ? "bg-positive-soft" : "bg-accent-soft")}>
            <Text className="font-sans-bold text-[9px] uppercase tracking-[0.08em] text-text-primary">
              {account.type}
            </Text>
          </View>
          <Text className="font-mono text-[14px] tracking-[0.04em] text-text-primary">
            •••• {account.accountNumber.slice(-4)}
          </Text>
          {isDefault ? (
            <Star size={16} color={colors.warning} fill={colors.warning} strokeWidth={1.6} />
          ) : null}
        </View>
        <View className="shrink-0 flex-row items-center gap-2">
          <Text className="font-sans-bold text-[14px] text-text-primary">{formatMoney(account.balance)} TND</Text>
          <ChevronDown
            size={14}
            color={colors.textSecondary}
            strokeWidth={2.4}
            style={{ transform: [{ rotate: selected ? "180deg" : "0deg" }] }}
          />
        </View>
      </Pressable>

      {selected ? (
        <View className="gap-4 bg-accent-soft px-5 pb-5 pt-3">
          <View className="gap-1">
            <Text className="font-sans-bold text-[10px] uppercase tracking-[0.08em] text-text-muted">
              Full account number
            </Text>
            <View className="flex-row items-center gap-2">
              <Text className="flex-1 font-mono text-[13px] text-text-primary">
                {formatRibDisplay(account.accountNumber)}
              </Text>
              <Pressable onPress={copy} accessibilityLabel="Copy account number" hitSlop={6}>
                {copied ? (
                  <Check size={16} color={colors.positive} strokeWidth={2.6} />
                ) : (
                  <Copy size={16} color={colors.textSecondary} strokeWidth={2} />
                )}
              </Pressable>
            </View>
          </View>

          <View className="flex-row flex-wrap gap-x-8 gap-y-3">
            <Detail label="Account type" value={account.type === "CHECKING" ? "Checking" : "Savings"} />
            {account.branch ? <Detail label="Agency" value={account.branch} /> : null}
            {account.openedAt ? <Detail label="Opened" value={formatLongDate(account.openedAt)} /> : null}
            {account.lastActivityAt ? (
              <Detail label="Last activity" value={formatLongDate(account.lastActivityAt)} />
            ) : null}
          </View>

          <Pressable
            onPress={() => router.push(`/transactions?account=${account.accountNumber}`)}
            accessibilityRole="button"
            className="flex-row items-center gap-1.5 self-start"
          >
            <Text className="font-sans-bold text-[13px] text-accent">View transactions</Text>
            <ChevronRight size={14} color={colors.accent} strokeWidth={2.4} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-[130px] gap-1">
      <Text className="font-sans-bold text-[10px] uppercase tracking-[0.08em] text-text-muted">{label}</Text>
      <Text className="font-sans-semibold text-[13px] text-text-primary">{value}</Text>
    </View>
  );
}

function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}
