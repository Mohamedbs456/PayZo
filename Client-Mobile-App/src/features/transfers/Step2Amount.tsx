import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { ArrowLeft, ArrowRight, Check } from "lucide-react-native";
import { cn } from "@/lib/cn";
import { useColorScheme } from "@/hooks/useColorScheme";
import { formatMoney } from "@/lib/format";
import { formatRibDisplay } from "@/lib/rib";
import type { ClientAccount } from "@/features/dashboard/api";

const QUICK_AMOUNTS = [10, 50, 100, 200, 500, 1000];

interface Step2Props {
  accounts: ClientAccount[];
  initial: { sourceAccountNumber: string; amount: string; motif: string };
  defaultSourceAccountId: string | null;
  recipientSummary: { displayName: string; bankLabel: string | null; accountNumber: string; initials: string };
  busy: boolean;
  onBack: () => void;
  onNext: (args: { sourceAccountNumber: string; amount: string; motif: string }) => void;
}

export function Step2Amount({
  accounts,
  initial,
  defaultSourceAccountId,
  recipientSummary,
  busy,
  onBack,
  onNext,
}: Step2Props) {
  const { colors } = useColorScheme();

  const initialAccount =
    accounts.find((a) => a.accountNumber === initial.sourceAccountNumber) ??
    accounts.find((a) => a.accountNumber === defaultSourceAccountId) ??
    accounts[0] ??
    null;

  const [accountNumber, setAccountNumber] = useState(initialAccount?.accountNumber ?? "");
  const [amount, setAmount] = useState(initial.amount);
  const [motif, setMotif] = useState(initial.motif);

  const selected = useMemo(
    () => accounts.find((a) => a.accountNumber === accountNumber) ?? null,
    [accounts, accountNumber],
  );

  const numericAmount = Number(amount);
  const valid = numericAmount > 0 && !!selected && numericAmount <= selected.balance;

  function submit() {
    if (!valid) return;
    onNext({ sourceAccountNumber: accountNumber, amount, motif });
  }

  return (
    <View className="flex-1">
      <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 18, paddingBottom: 16 }}>
        <View className="gap-2">
          <Text className="font-sans-bold text-[11px] uppercase tracking-[0.1em] text-text-muted">From</Text>
          {accounts.length === 0 ? (
            <Text className="font-sans text-[13px] text-text-muted">No accounts on file.</Text>
          ) : (
            <View className="gap-2">
              {accounts.map((a) => {
                const active = a.accountNumber === accountNumber;
                return (
                  <Pressable
                    key={a.accountNumber}
                    onPress={() => setAccountNumber(a.accountNumber)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    className={cn(
                      "flex-row items-center gap-3 rounded-xl border bg-surface-card px-4 py-3",
                      active ? "border-accent bg-accent-soft" : "border-border-soft",
                    )}
                  >
                    <View className="size-9 items-center justify-center rounded-2xl bg-accent">
                      <Text className="font-sans-bold text-[11px] text-accent-foreground">
                        {a.bankCode.slice(0, 2)}
                      </Text>
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text className="font-sans-semibold text-[14px] text-text-primary">
                        {a.bankCode} · {a.type === "CHECKING" ? "Checking" : "Savings"}
                      </Text>
                      <Text numberOfLines={1} className="font-mono text-[11px] text-text-secondary">
                        {formatRibDisplay(a.accountNumber)}
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text className="font-sans-semibold text-[13px] text-text-primary">
                        {formatMoney(a.balance)}
                      </Text>
                      <Text className="font-sans text-[10px] text-text-muted">TND</Text>
                    </View>
                    {active ? <Check size={18} color={colors.accent} strokeWidth={2.4} /> : null}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        <View className="gap-2">
          <Text className="font-sans-bold text-[11px] uppercase tracking-[0.1em] text-text-muted">
            Amount to send
          </Text>
          <View className="h-[76px] flex-row items-center rounded-[14px] border-2 border-accent bg-accent-soft px-5">
            <TextInput
              value={amount}
              onChangeText={(v) => setAmount(v.replace(/[^0-9.,]/g, "").replace(",", "."))}
              keyboardType="decimal-pad"
              placeholder="0.000"
              placeholderTextColor={colors.textMuted}
              className="min-w-0 flex-1 p-0 font-display-bold text-[36px] text-text-primary"
            />
            <Text className="font-sans-bold text-[16px] text-text-secondary">TND</Text>
          </View>
          <View className="flex-row flex-wrap items-center gap-1.5">
            {QUICK_AMOUNTS.map((v) => {
              const sel = Number(amount) === v;
              return (
                <Pressable
                  key={v}
                  onPress={() => setAmount(String(v))}
                  className={cn(
                    "h-7 items-center justify-center rounded-full border px-3",
                    sel ? "border-accent bg-accent-soft" : "border-border-soft bg-surface-card",
                  )}
                >
                  <Text className={cn("font-sans-semibold text-[12px]", sel ? "text-accent" : "text-text-secondary")}>
                    {v}
                  </Text>
                </Pressable>
              );
            })}
            {selected ? (
              <Pressable
                onPress={() => setAmount(String(selected.balance))}
                className={cn(
                  "h-7 items-center justify-center rounded-full border px-3",
                  Number(amount) === selected.balance
                    ? "border-accent bg-accent-soft"
                    : "border-border-soft bg-surface-card",
                )}
              >
                <Text
                  className={cn(
                    "font-sans-semibold text-[12px]",
                    Number(amount) === selected.balance ? "text-accent" : "text-text-secondary",
                  )}
                >
                  ALL
                </Text>
              </Pressable>
            ) : null}
          </View>
          {selected ? (
            <Text className="font-sans text-[11px] text-text-secondary">
              Available: {formatMoney(selected.balance)} TND
            </Text>
          ) : null}
          {numericAmount > 0 && selected && numericAmount > selected.balance ? (
            <Text className="font-sans text-[12px] text-negative">This exceeds the account balance.</Text>
          ) : null}
        </View>

        <View className="gap-2">
          <Text className="font-sans-bold text-[11px] uppercase tracking-[0.1em] text-text-muted">
            Motif (optional)
          </Text>
          <TextInput
            value={motif}
            onChangeText={(v) => setMotif(v.slice(0, 500))}
            placeholder="Add a reason for this transfer"
            placeholderTextColor={colors.textMuted}
            className="h-12 rounded-[10px] border border-border-soft bg-accent-soft px-4 font-sans text-[14px] text-text-primary"
          />
        </View>

        <View className="flex-row items-center gap-3 rounded-xl border border-border-soft bg-surface-raised px-4 py-3">
          <View className="size-10 items-center justify-center rounded-full bg-accent">
            <Text className="font-sans-bold text-[13px] text-accent-foreground">{recipientSummary.initials}</Text>
          </View>
          <View className="min-w-0 flex-1">
            <Text className="font-sans-bold text-[14px] text-text-primary">
              Sending to {recipientSummary.displayName}
            </Text>
            <Text numberOfLines={1} className="font-mono text-[12px] text-text-secondary">
              {recipientSummary.bankLabel ? `${recipientSummary.bankLabel} · ` : ""}
              {formatRibDisplay(recipientSummary.accountNumber)}
            </Text>
          </View>
        </View>
      </ScrollView>

      <View className="flex-row items-center justify-between pt-4">
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          className="h-11 flex-row items-center gap-1.5 rounded-[10px] bg-surface-raised pl-4 pr-5"
        >
          <ArrowLeft size={16} color={colors.textSecondary} strokeWidth={2.2} />
          <Text className="font-sans-semibold text-[14px] text-text-secondary">Back</Text>
        </Pressable>
        <Pressable
          onPress={submit}
          disabled={!valid || busy}
          accessibilityRole="button"
          className={cn(
            "h-11 flex-row items-center gap-1.5 rounded-[10px] bg-accent pl-6 pr-5",
            (!valid || busy) && "opacity-50",
          )}
        >
          <Text className="font-sans-bold text-[14px] text-accent-foreground">{busy ? "Starting" : "Next"}</Text>
          {!busy ? <ArrowRight size={16} color={colors.accentForeground} strokeWidth={2.4} /> : null}
        </Pressable>
      </View>
    </View>
  );
}
