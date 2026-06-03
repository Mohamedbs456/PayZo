import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { cn } from "@/lib/cn";

interface ListRowProps {
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  meta?: string;
  monoSubtitle?: boolean;
  trailing?: ReactNode;
  onPress?: () => void;
  className?: string;
}

export function ListRow({
  leading,
  title,
  subtitle,
  meta,
  monoSubtitle = false,
  trailing,
  onPress,
  className,
}: ListRowProps) {
  const body = (
    <View
      className={cn(
        "flex-row items-center gap-3 rounded-[14px] border border-border-soft bg-surface-card p-4",
        className,
      )}
    >
      {leading}
      <View className="min-w-0 flex-1 flex-col gap-0.5">
        <Text numberOfLines={1} className="font-sans-bold text-[15px] text-text-primary">
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={1}
            className={cn(
              "text-[11px] text-text-secondary",
              monoSubtitle ? "font-mono" : "font-sans",
            )}
          >
            {subtitle}
          </Text>
        ) : null}
        {meta ? <Text className="font-sans text-[11px] text-text-muted">{meta}</Text> : null}
      </View>
      {trailing}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button">
        {body}
      </Pressable>
    );
  }
  return body;
}
