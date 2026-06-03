import { Image, Pressable, Text, View } from "react-native";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  ChevronDown,
  Clock,
  X,
} from "lucide-react-native";
import { cn } from "@/lib/cn";
import { useColorScheme } from "@/hooks/useColorScheme";
import { formatMoney } from "@/lib/format";
import { resolveBackendUrl } from "@/lib/backendUrl";
import type { ClientTransaction } from "@/features/dashboard/api";

type Category = "SENT" | "RECEIVED" | "INTERNAL";

export function TransactionRow({
  tx,
  expanded,
  onToggle,
}: {
  tx: ClientTransaction;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { colors } = useColorScheme();
  const category = deriveCategory(tx);
  const status = tx.status ?? "APPROVED";
  const counterpartLabel = tx.internal ? "Internal transfer" : tx.counterpartName ?? "Unknown";

  return (
    <View className={cn(expanded ? "bg-accent-soft" : "bg-surface-card")}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        className="h-[72px] flex-row items-center justify-between gap-3 px-4"
      >
        <View className="min-w-0 flex-1 flex-row items-center gap-3">
          <RowAvatar tx={tx} category={category} status={status} colors={colors} />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text numberOfLines={1} className="font-sans-bold text-[14px] text-text-primary">
              {counterpartLabel}
            </Text>
            {subtitleLines(tx, category).map((line, i) => (
              <Text key={i} numberOfLines={1} className="font-sans text-[12px] text-text-secondary">
                {line}
              </Text>
            ))}
          </View>
        </View>
        <View className="shrink-0 flex-row items-center gap-2">
          <View className="items-end">
            <Text
              className={cn(
                "font-sans-bold text-[15px]",
                amountColorClass(category, status),
                (status === "REJECTED" || status === "CANCELLED") && "line-through",
              )}
            >
              {formatAmount(tx, category)}
            </Text>
            <Text className="font-sans text-[11px] text-text-secondary">{formatTime(tx.timestamp)}</Text>
          </View>
          <ChevronDown
            size={14}
            color={colors.textSecondary}
            strokeWidth={2.4}
            style={{ transform: [{ rotate: expanded ? "180deg" : "0deg" }] }}
          />
        </View>
      </Pressable>

      {expanded ? <ExpandedDetail tx={tx} /> : null}
    </View>
  );
}

function RowAvatar({
  tx,
  category,
  status,
  colors,
}: {
  tx: ClientTransaction;
  category: Category;
  status: NonNullable<ClientTransaction["status"]>;
  colors: ReturnType<typeof useColorScheme>["colors"];
}) {
  const failed = status === "REJECTED" || status === "CANCELLED";
  const pending =
    status === "PENDING_OTP" || status === "PENDING_SCORING" || status === "SUSPENDED_PENDING_ANALYST";
  const pictureUrl = resolveBackendUrl(tx.counterpartProfilePictureUrl);

  if (pictureUrl && category !== "INTERNAL") {
    return (
      <Image
        source={{ uri: pictureUrl }}
        className={cn("size-10 rounded-full", (failed || pending) && "opacity-60")}
        resizeMode="cover"
      />
    );
  }
  if (failed) {
    return (
      <View className="size-10 items-center justify-center rounded-[20px] bg-negative-soft">
        <X size={20} color={colors.negative} strokeWidth={2.4} />
      </View>
    );
  }
  if (pending) {
    return (
      <View className="size-10 items-center justify-center rounded-[20px] bg-warning-soft">
        <Clock size={20} color={colors.warning} strokeWidth={2.4} />
      </View>
    );
  }
  if (category === "RECEIVED") {
    return (
      <View className="size-10 items-center justify-center rounded-[20px] bg-positive-soft">
        <ArrowDownLeft size={20} color={colors.positive} strokeWidth={2.4} />
      </View>
    );
  }
  if (category === "SENT") {
    return (
      <View className="size-10 items-center justify-center rounded-[20px] bg-negative-soft">
        <ArrowUpRight size={20} color={colors.negative} strokeWidth={2.4} />
      </View>
    );
  }
  return (
    <View className="size-10 items-center justify-center rounded-[20px] bg-accent-soft">
      <ArrowLeftRight size={20} color={colors.accent} strokeWidth={2.2} />
    </View>
  );
}

function ExpandedDetail({ tx }: { tx: ClientTransaction }) {
  const counterpartParts = [
    tx.counterpartName,
    tx.counterpartUsername ? `@${tx.counterpartUsername}` : null,
    tx.type === "DEBIT" ? tx.destMaskedAccount : tx.sourceMaskedAccount,
  ].filter(Boolean) as string[];
  const counterpartLine = counterpartParts.length > 0 ? counterpartParts.join(" · ") : "—";
  const fromLine = tx.internal
    ? `${tx.sourceBankCode ?? "—"} · ${tx.sourceMaskedAccount ?? "—"}`
    : tx.type === "DEBIT"
      ? `${tx.sourceMaskedAccount ?? "Your account"} (you)`
      : counterpartLine;
  const toLine = tx.internal
    ? `${tx.destBankCode ?? "—"} · ${tx.destMaskedAccount ?? "—"}`
    : tx.type === "DEBIT"
      ? counterpartLine
      : `${tx.destMaskedAccount ?? "Your account"} (you)`;
  const banks = tx.sourceBankCode && tx.destBankCode ? `${tx.sourceBankCode} → ${tx.destBankCode}` : "—";
  const mlDecision =
    tx.riskLevel && typeof tx.mlScore === "number"
      ? `${tx.riskLevel} · ${tx.mlScore.toFixed(2)} / 1.00`
      : tx.riskLevel ?? "—";
  const finalStatus = tx.finalStatusLabel ?? humanizeStatus(tx.status);

  return (
    <View className="gap-3 px-4 pb-4 pt-1">
      <View className="flex-row flex-wrap gap-x-6 gap-y-3">
        <Cell label="Reference" mono value={tx.reference?.trim() || "—"} />
        <Cell label="Motif" value={tx.description?.trim() || "—"} />
        <Cell label="From" value={fromLine} wide />
        <Cell label="To" value={toLine} wide />
        <Cell label="Banks" value={banks} />
        <Cell label="Created" value={formatDateTime(tx.timestamp)} />
        <Cell label="ML decision" value={mlDecision} />
        <Cell label="Final status" value={finalStatus} />
      </View>
    </View>
  );
}

function Cell({ label, value, mono, wide }: { label: string; value: string; mono?: boolean; wide?: boolean }) {
  return (
    <View className="gap-1" style={{ width: wide ? "100%" : "44%" }}>
      <Text className="font-sans-bold text-[10px] uppercase tracking-[0.08em] text-text-muted">{label}</Text>
      <Text className={mono ? "font-mono text-[13px] text-text-primary" : "font-sans-semibold text-[13px] text-text-primary"}>
        {value}
      </Text>
    </View>
  );
}

function deriveCategory(tx: ClientTransaction): Category {
  if (tx.internal) return "INTERNAL";
  return tx.type === "DEBIT" ? "SENT" : "RECEIVED";
}

// Collapsed-row subtitle as separate lines: the @username on one line and the
// OTHER party's masked account on its own line below it — where the money went
// (debit) or came from (credit), not both ends, and not truncated. Internal
// transfers (own → own) keep the full route. Expanded detail still lists From/To.
function subtitleLines(tx: ClientTransaction, category: Category): string[] {
  const handle = tx.counterpartUsername ? `@${tx.counterpartUsername}` : null;
  const lines: string[] = [];
  if (category === "INTERNAL") {
    const route =
      tx.sourceMaskedAccount && tx.destMaskedAccount
        ? `${tx.sourceMaskedAccount} → ${tx.destMaskedAccount}`
        : null;
    if (route) lines.push(route);
  } else {
    const counterpartAccount = tx.type === "DEBIT" ? tx.destMaskedAccount : tx.sourceMaskedAccount;
    if (handle) lines.push(handle);
    if (counterpartAccount) lines.push(counterpartAccount);
  }
  if (tx.subtitleSuffix) {
    if (lines.length === 0) lines.push(tx.subtitleSuffix);
    else lines[lines.length - 1] = `${lines[lines.length - 1]} · ${tx.subtitleSuffix}`;
  }
  return lines.length > 0 ? lines : ["—"];
}

function amountColorClass(category: Category, status: NonNullable<ClientTransaction["status"]>): string {
  if (status === "REJECTED" || status === "CANCELLED") return "text-text-muted";
  if (status === "PENDING_OTP" || status === "PENDING_SCORING" || status === "SUSPENDED_PENDING_ANALYST") {
    return "text-text-muted";
  }
  if (category === "RECEIVED") return "text-positive";
  if (category === "INTERNAL") return "text-text-primary";
  return "text-negative";
}

function formatAmount(tx: ClientTransaction, category: Category): string {
  const amt = formatMoney(tx.amount);
  if (category === "RECEIVED") return `+${amt} TND`;
  if (category === "SENT") return `-${amt} TND`;
  return `${amt} TND`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${date} · ${formatTime(iso)}`;
}

function humanizeStatus(s: ClientTransaction["status"]): string {
  switch (s) {
    case "APPROVED":
      return "Approved";
    case "PENDING_OTP":
      return "Awaiting OTP";
    case "PENDING_SCORING":
      return "Pending review";
    case "SUSPENDED_PENDING_ANALYST":
      return "Held by ML";
    case "REJECTED":
      return "Rejected";
    case "CANCELLED":
      return "Cancelled";
    default:
      return "—";
  }
}
