import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Home, Plus, type LucideIcon } from "lucide-react-native";
import { useColorScheme } from "@/hooks/useColorScheme";
import { motion } from "@/lib/tokens";
import { formatMoney } from "@/lib/format";
import { useTransferFlow, recipientDisplayName } from "@/store/transferFlow";

export default function TransferOutcomeModal() {
  const insets = useSafeAreaInsets();
  const { colors } = useColorScheme();
  const queryClient = useQueryClient();
  const reduced = useReducedMotion();
  const flow = useTransferFlow();

  const name = recipientDisplayName(flow) || "the recipient";
  const amountLabel = `${formatMoney(Number(flow.amount || 0))} TND`;

  // The transfer moved money in CBS — refresh balances + lists so History
  // shows the new row when the user lands back.
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
    queryClient.invalidateQueries({ queryKey: ["recent"] });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["alertSummary"] });
  }, [queryClient]);

  // One brand-teal ring pulse behind the check (the single success flourish).
  const ring = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    ring.value = withDelay(
      120,
      withSequence(
        withTiming(1, { duration: 700, easing: Easing.bezier(...motion.easeOut) }),
        withTiming(0, { duration: 0 }),
      ),
    );
  }, [reduced, ring]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.5 * (1 - ring.value),
    transform: [{ scale: 0.7 + ring.value * 1.1 }],
  }));

  function sendAnother() {
    flow.reset();
    router.back();
  }
  function done() {
    flow.reset();
    router.replace("/(tabs)/dashboard");
  }

  return (
    <View className="flex-1 bg-surface-soft px-6" style={{ paddingTop: insets.top }}>
      <View className="flex-1 items-center justify-center gap-6">
        <View className="size-20 items-center justify-center">
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                width: 80,
                height: 80,
                borderRadius: 40,
                borderWidth: 2,
                borderColor: colors.brandTeal,
              },
              ringStyle,
            ]}
          />
          <View className="size-16 items-center justify-center rounded-full bg-positive-soft">
            <CheckCircle2 size={36} color={colors.positive} strokeWidth={2} />
          </View>
        </View>

        <View className="items-center gap-2">
          <Text className="font-display-bold text-[22px] text-text-primary">Transfer authorized</Text>
          <Text className="max-w-[320px] text-center font-sans text-[14px] leading-6 text-text-secondary">
            You sent <Text className="font-sans-semibold text-text-primary">{amountLabel}</Text> to{" "}
            <Text className="font-sans-semibold text-text-primary">{name}</Text>. If our fraud checks flag
            anything unusual, you'll be notified before the money clears.
          </Text>
        </View>
      </View>

      <View className="flex-row gap-3" style={{ paddingBottom: insets.bottom + 16 }}>
        <ActionButton variant="ghost" label="Send another" Icon={Plus} onPress={sendAnother} colors={colors} />
        <ActionButton variant="primary" label="Done" Icon={Home} onPress={done} colors={colors} />
      </View>
    </View>
  );
}

function ActionButton({
  variant,
  label,
  Icon,
  onPress,
  colors,
}: {
  variant: "primary" | "ghost";
  label: string;
  Icon: LucideIcon;
  onPress: () => void;
  colors: ReturnType<typeof useColorScheme>["colors"];
}) {
  const primary = variant === "primary";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className={`h-12 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl ${
        primary ? "bg-accent" : "bg-surface-raised"
      }`}
    >
      <Icon size={16} color={primary ? colors.accentForeground : colors.textSecondary} strokeWidth={2.4} />
      <Text
        className={`font-sans-semibold text-[14px] ${primary ? "text-accent-foreground" : "text-text-secondary"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
