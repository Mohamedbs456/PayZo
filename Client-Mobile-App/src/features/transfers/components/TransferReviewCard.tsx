import { Text, View } from "react-native";

export interface ReviewFields {
  toName?: string;
  toSecondary?: string;
  fromTitle?: string;
  fromSecondary?: string;
  amount?: string;
  motif?: string;
}

// Compact stand-in for the web's right-rail TransferSummaryPanel — surfaced
// at the top of the OTP modal so the sender double-checks before confirming.
export function TransferReviewCard({ fields }: { fields: ReviewFields }) {
  return (
    <View className="overflow-hidden rounded-[16px] border border-border-soft bg-surface-card">
      <Row label="To" title={fields.toName ?? "Recipient"} secondary={fields.toSecondary} />
      <Divider />
      <Row label="From" title={fields.fromTitle ?? "—"} secondary={fields.fromSecondary} mono />
      <Divider />
      <View className="gap-1 px-4 py-3">
        <Label>Amount</Label>
        <Text className="font-display-bold text-[22px] text-text-primary">
          {fields.amount ?? "0,000 TND"}
        </Text>
        {fields.motif ? (
          <Text className="font-sans text-[11px] text-text-secondary">Motif: {fields.motif}</Text>
        ) : null}
      </View>
    </View>
  );
}

function Row({
  label,
  title,
  secondary,
  mono,
}: {
  label: string;
  title: string;
  secondary?: string;
  mono?: boolean;
}) {
  return (
    <View className="gap-1 px-4 py-3">
      <Label>{label}</Label>
      <Text className="font-sans-semibold text-[14px] text-text-primary">{title}</Text>
      {secondary ? (
        <Text className={mono ? "font-mono text-[11px] text-text-secondary" : "font-sans text-[11px] text-text-secondary"}>
          {secondary}
        </Text>
      ) : null}
    </View>
  );
}

function Label({ children }: { children: string }) {
  return (
    <Text className="font-sans-bold text-[10px] uppercase tracking-[0.08em] text-text-muted">
      {children}
    </Text>
  );
}

function Divider() {
  return <View className="h-px w-full bg-border-soft" />;
}
