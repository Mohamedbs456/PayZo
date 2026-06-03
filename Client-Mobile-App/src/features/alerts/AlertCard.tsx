import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { Check, ChevronDown, Clock, TrendingDown, TrendingUp, X } from "lucide-react-native";
import { cn } from "@/lib/cn";
import { useColorScheme } from "@/hooks/useColorScheme";
import { formatMoney } from "@/lib/format";
import type { ClientAlert } from "@/features/dashboard/api";

export function AlertCard({ alert, onCancel }: { alert: ClientAlert; onCancel?: () => void }) {
  const { colors } = useColorScheme();
  const [whyOpen, setWhyOpen] = useState(false);
  const hasReasons = !!alert.mlReasons?.length;

  const route = [
    alert.counterpartUsername ? `@${alert.counterpartUsername}` : null,
    alert.sourceMaskedAccount && alert.destMaskedAccount
      ? `${alert.sourceMaskedAccount} → ${alert.destMaskedAccount}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View className="flex-row overflow-hidden rounded-[14px] border border-border-soft bg-surface-card">
      <View className={cn("w-1.5", riskBar(alert.riskLevel))} />
      <View className="min-w-0 flex-1">
        <View className="flex-row items-start justify-between gap-3 px-4 pb-3 pt-4">
          <View className="min-w-0 flex-1 gap-2">
            <View className="flex-row flex-wrap items-center gap-1.5">
              <Pill {...riskPill(alert.riskLevel)} />
              <Pill {...statusPill(alert.status)} />
            </View>
            <Text className="font-sans-bold text-[16px] text-text-primary">
              Transfer to {alert.counterpartName}
            </Text>
            {route ? (
              <Text numberOfLines={1} className="font-sans text-[12px] text-text-secondary">
                {route}
              </Text>
            ) : null}
          </View>
          <View className="shrink-0 items-end">
            <Text className="font-sans-bold text-[18px] text-text-primary">{formatMoney(alert.amount)} TND</Text>
            <Text className="font-sans text-[11px] text-text-secondary">{formatRelative(alert.createdAt)}</Text>
          </View>
        </View>

        {hasReasons ? (
          <Pressable
            onPress={() => setWhyOpen((v) => !v)}
            accessibilityRole="button"
            className="flex-row items-center gap-1.5 px-4 pb-3"
          >
            <Text className="font-sans-semibold text-[12px] text-text-secondary underline">
              {whyOpen ? "Hide why we flagged this" : "Why we flagged this"}
            </Text>
            <ChevronDown
              size={12}
              color={colors.textSecondary}
              strokeWidth={2.6}
              style={{ transform: [{ rotate: whyOpen ? "180deg" : "0deg" }] }}
            />
          </Pressable>
        ) : null}

        {hasReasons && whyOpen ? (
          <View className="gap-2 bg-accent-soft px-4 py-3.5">
            {alert.mlReasons!.map((reason, i) => (
              <View key={i} className="flex-row items-start gap-2.5">
                <View className="mt-1.5 size-1.5 rounded-full bg-text-secondary" />
                <Text className="flex-1 font-sans text-[13px] leading-5 text-text-primary">{reason}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View className="gap-3 border-t border-border-soft px-4 pb-4 pt-3">
          <DecisionBlock alert={alert} colors={colors} />
          <View className="flex-row flex-wrap items-center gap-2">
            {typeof alert.trustDelta === "number" && alert.trustDelta !== 0 ? (
              <TrustDeltaPill delta={alert.trustDelta} status={alert.status} colors={colors} />
            ) : null}
            {alert.status === "PENDING_ANALYST" && onCancel ? (
              <Pressable
                onPress={onCancel}
                accessibilityRole="button"
                className="h-9 items-center justify-center rounded-[9px] border border-border-soft bg-surface-card px-3.5"
              >
                <Text className="font-sans-semibold text-[12px] text-negative">Cancel transfer</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => router.push(`/transactions?ref=${alert.transactionReference}`)}
              accessibilityRole="button"
              className="h-9 items-center justify-center rounded-[9px] border border-border-soft bg-surface-card px-3.5"
            >
              <Text className="font-sans-semibold text-[12px] text-text-secondary">View transaction</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

function DecisionBlock({
  alert,
  colors,
}: {
  alert: ClientAlert;
  colors: ReturnType<typeof useColorScheme>["colors"];
}) {
  if (alert.status === "PENDING_ANALYST") {
    return (
      <Row
        bg="bg-warning-soft"
        icon={<Clock size={16} color={colors.warning} strokeWidth={2.2} />}
        title="A PayZo analyst is reviewing your transfer"
        body="Most reviews are resolved within a few minutes. You'll be notified of the decision."
      />
    );
  }
  if (alert.status === "CANCELLED") {
    return (
      <Row
        bg="bg-surface-raised"
        icon={<X size={16} color={colors.textSecondary} strokeWidth={2.4} />}
        title="You cancelled this transfer"
        body="No money moved. The pending transfer was released back to your account."
      />
    );
  }
  const approved = alert.status === "APPROVED";
  return (
    <Row
      bg={approved ? "bg-positive-soft" : "bg-negative-soft"}
      icon={
        approved ? (
          <Check size={16} color={colors.positive} strokeWidth={2.6} />
        ) : (
          <X size={16} color={colors.negative} strokeWidth={2.8} />
        )
      }
      title={`${alert.decidedByName ? `Reviewed by ${alert.decidedByName}` : "Reviewed"}${
        alert.decidedAt ? ` · ${formatLong(alert.decidedAt)}` : ""
      }`}
      body={alert.decisionComment ? `"${alert.decisionComment}"` : undefined}
    />
  );
}

function Row({
  bg,
  icon,
  title,
  body,
}: {
  bg: string;
  icon: React.ReactNode;
  title: string;
  body?: string;
}) {
  return (
    <View className="flex-row items-start gap-3">
      <View className={cn("size-8 items-center justify-center rounded-2xl", bg)}>{icon}</View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="font-sans-bold text-[13px] text-text-primary">{title}</Text>
        {body ? <Text className="font-sans text-[12px] italic text-text-secondary">{body}</Text> : null}
      </View>
    </View>
  );
}

function TrustDeltaPill({
  delta,
  status,
  colors,
}: {
  delta: number;
  status: ClientAlert["status"];
  colors: ReturnType<typeof useColorScheme>["colors"];
}) {
  const negative = delta < 0;
  const bg = status === "REJECTED" ? "bg-negative-soft" : negative ? "bg-warning-soft" : "bg-positive-soft";
  const iconColor = status === "REJECTED" ? colors.negative : negative ? colors.warning : colors.positive;
  return (
    <View className={cn("h-9 flex-row items-center gap-2 rounded-[9px] px-3.5", bg)}>
      {negative ? (
        <TrendingDown size={14} color={iconColor} strokeWidth={2.6} />
      ) : (
        <TrendingUp size={14} color={iconColor} strokeWidth={2.6} />
      )}
      <Text className="font-sans-bold text-[13px] text-text-primary">
        {delta > 0 ? `+${delta}` : delta} trust
      </Text>
    </View>
  );
}

function Pill({ bg, label }: { bg: string; label: string }) {
  return (
    <View className={cn("flex-row items-center gap-1.5 rounded-full px-2.5 py-1", bg)}>
      <Text className="font-sans-bold text-[11px] uppercase tracking-[0.08em] text-text-primary">{label}</Text>
    </View>
  );
}

function riskBar(risk: ClientAlert["riskLevel"]): string {
  if (risk === "HIGH") return "bg-negative";
  if (risk === "MED") return "bg-warning";
  return "bg-positive";
}

function riskPill(risk: ClientAlert["riskLevel"]) {
  if (risk === "HIGH") return { bg: "bg-negative-soft", label: "HIGH RISK" };
  if (risk === "MED") return { bg: "bg-warning-soft", label: "MEDIUM RISK" };
  return { bg: "bg-positive-soft", label: "LOW RISK" };
}

function statusPill(status: ClientAlert["status"]) {
  switch (status) {
    case "PENDING_ANALYST":
      return { bg: "bg-warning-soft", label: "AWAITING REVIEW" };
    case "APPROVED":
      return { bg: "bg-positive-soft", label: "APPROVED · MONEY SENT" };
    case "REJECTED":
      return { bg: "bg-negative-soft", label: "REJECTED · NO MONEY MOVED" };
    default:
      return { bg: "bg-surface-raised", label: "CANCELLED" };
  }
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dayKey = new Date(d);
  dayKey.setHours(0, 0, 0, 0);
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (dayKey.getTime() === today.getTime()) return `Today · ${time}`;
  if (dayKey.getTime() === yesterday.getTime()) return `Yesterday · ${time}`;
  return `${d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} · ${time}`;
}

function formatLong(iso: string): string {
  const d = new Date(iso);
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${d.toLocaleDateString("en-US", { month: "long", day: "numeric" })} · ${time}`;
}
