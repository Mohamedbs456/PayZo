import { Pressable, Text, View } from "react-native";
import { Check, Mail, Smartphone } from "lucide-react-native";
import { cn } from "@/lib/cn";
import { useColorScheme } from "@/hooks/useColorScheme";
import type { OtpChannel } from "@/lib/api/endpoints";

const COPY: Record<OtpChannel, { label: string; Icon: typeof Mail }> = {
  EMAIL: { label: "Email", Icon: Mail },
  SMS: { label: "SMS", Icon: Smartphone },
};

export function ChannelOption({
  channel,
  maskedValue,
  selected,
  onSelect,
  disabled = false,
}: {
  channel: OtpChannel;
  maskedValue: string;
  selected: boolean;
  onSelect: (c: OtpChannel) => void;
  disabled?: boolean;
}) {
  const { colors } = useColorScheme();
  const { label, Icon } = COPY[channel];
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={() => onSelect(channel)}
      className={cn(
        "flex-1 gap-2.5 rounded-xl px-4 py-4",
        selected ? "border-2 border-accent bg-accent-soft" : "border border-border bg-surface-card",
        disabled && "opacity-60",
      )}
    >
      <View className="flex-row items-center gap-2.5">
        <Icon size={22} color={colors.textPrimary} strokeWidth={1.6} />
        <Text className="font-sans-semibold text-[14px] text-text-primary">{label}</Text>
        {selected ? (
          <View className="size-[18px] items-center justify-center rounded-full bg-accent">
            <Check size={12} color={colors.accentForeground} strokeWidth={3} />
          </View>
        ) : null}
      </View>
      <Text className="font-mono text-[12px] text-text-muted">{maskedValue}</Text>
    </Pressable>
  );
}
