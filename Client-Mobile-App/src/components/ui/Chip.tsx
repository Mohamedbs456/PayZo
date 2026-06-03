import { Pressable, Text, View } from "react-native";
import { cn } from "@/lib/cn";

export type ChipTone = "neutral" | "positive" | "warning" | "negative" | "accent";

interface ChipProps {
  label: string;
  tone?: ChipTone;
  dot?: boolean;
  selected?: boolean;
  onPress?: () => void;
}

const TONE_BG: Record<ChipTone, string> = {
  neutral: "bg-surface-raised",
  positive: "bg-positive-soft",
  warning: "bg-warning-soft",
  negative: "bg-negative-soft",
  accent: "bg-accent-soft",
};

const DOT_BG: Record<ChipTone, string> = {
  neutral: "bg-text-muted",
  positive: "bg-positive",
  warning: "bg-warning",
  negative: "bg-negative",
  accent: "bg-accent",
};

export function Chip({ label, tone = "neutral", dot = false, selected, onPress }: ChipProps) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected: !!selected }}
        className={cn(
          "h-8 flex-row items-center justify-center rounded-full px-3.5",
          selected ? "bg-accent" : "border border-border bg-surface-soft",
        )}
      >
        <Text
          className={cn(
            "text-[12px]",
            selected ? "font-sans-semibold text-accent-foreground" : "font-sans-medium text-text-secondary",
          )}
        >
          {label}
        </Text>
      </Pressable>
    );
  }

  return (
    <View
      className={cn(
        "flex-row items-center gap-1.5 self-start rounded-full py-[3px] pl-2 pr-2.5",
        TONE_BG[tone],
      )}
    >
      {dot ? <View className={cn("size-1.5 rounded-full", DOT_BG[tone])} /> : null}
      <Text
        className={cn(
          "font-sans-semibold text-[11px]",
          tone === "neutral" ? "text-text-secondary" : "text-text-primary",
        )}
      >
        {label}
      </Text>
    </View>
  );
}
