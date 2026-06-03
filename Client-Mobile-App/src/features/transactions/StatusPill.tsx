import { Text, View } from "react-native";
import { cn } from "@/lib/cn";
import type { ClientTransaction } from "@/features/dashboard/api";

type Status = NonNullable<ClientTransaction["status"]>;

const VARIANTS: Record<Status, { label: string; bg: string; dot: string; text: string }> = {
  APPROVED: { label: "Approved", bg: "bg-positive-soft", dot: "bg-positive", text: "text-text-primary" },
  PENDING_OTP: { label: "Pending review", bg: "bg-warning-soft", dot: "bg-warning", text: "text-text-primary" },
  PENDING_SCORING: { label: "Pending review", bg: "bg-warning-soft", dot: "bg-warning", text: "text-text-primary" },
  SUSPENDED_PENDING_ANALYST: { label: "Under review", bg: "bg-warning-soft", dot: "bg-warning", text: "text-text-primary" },
  REJECTED: { label: "Rejected", bg: "bg-negative-soft", dot: "bg-negative", text: "text-text-primary" },
  CANCELLED: { label: "Cancelled", bg: "bg-surface-raised", dot: "bg-text-muted", text: "text-text-secondary" },
};

export function StatusPill({ status }: { status: Status }) {
  const v = VARIANTS[status];
  return (
    <View className={cn("flex-row items-center gap-1.5 self-start rounded-full py-[3px] pl-2 pr-2.5", v.bg)}>
      <View className={cn("size-1.5 rounded-full", v.dot)} />
      <Text className={cn("font-sans-semibold text-[11px]", v.text)}>{v.label}</Text>
    </View>
  );
}
