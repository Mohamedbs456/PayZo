import type { ComponentType, ReactNode } from "react";
import { Text, View } from "react-native";
import type { LucideProps } from "lucide-react-native";
import { useColorScheme } from "@/hooks/useColorScheme";

interface EmptyStateProps {
  icon: ComponentType<LucideProps>;
  title: string;
  message?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, message, action }: EmptyStateProps) {
  const { colors } = useColorScheme();
  return (
    <View className="flex-1 items-center justify-center gap-3 py-16">
      <View className="size-14 items-center justify-center rounded-full bg-accent-soft">
        <Icon size={24} color={colors.accent} strokeWidth={2} />
      </View>
      <Text className="font-sans-bold text-[16px] text-text-primary">{title}</Text>
      {message ? (
        <Text className="max-w-[300px] text-center font-sans text-[13px] text-text-secondary">
          {message}
        </Text>
      ) : null}
      {action ? <View className="mt-1">{action}</View> : null}
    </View>
  );
}
