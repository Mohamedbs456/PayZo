import { useEffect, type ComponentType, type ReactNode } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { AlertCircle, AlertTriangle, CheckCircle2, type LucideProps } from "lucide-react-native";
import { cn } from "@/lib/cn";
import { motion } from "@/lib/tokens";
import { useColorScheme } from "@/hooks/useColorScheme";

export type AlertVariant = "danger" | "warning" | "positive" | "primary";

interface VariantStyle {
  Icon: ComponentType<LucideProps> | null;
  iconWrapper: string;
  iconColor: (c: ReturnType<typeof useColorScheme>["colors"]) => string;
  confirmBox: string;
  confirmText: string;
}

const VARIANT_STYLES: Record<AlertVariant, VariantStyle> = {
  danger: { Icon: AlertTriangle, iconWrapper: "bg-negative-soft", iconColor: (c) => c.negative, confirmBox: "bg-negative", confirmText: "text-white" },
  warning: { Icon: AlertCircle, iconWrapper: "bg-warning-soft", iconColor: (c) => c.warning, confirmBox: "bg-warning", confirmText: "text-white" },
  positive: { Icon: CheckCircle2, iconWrapper: "bg-positive-soft", iconColor: (c) => c.positive, confirmBox: "bg-positive", confirmText: "text-white" },
  primary: { Icon: null, iconWrapper: "", iconColor: (c) => c.accent, confirmBox: "bg-accent", confirmText: "text-accent-foreground" },
};

// Same look + API as ConfirmDialog, but built on a native Modal so it renders
// above navigation modals (the @gorhom bottom-sheet portal does not).
export function AlertDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "primary",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: AlertVariant;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { colors } = useColorScheme();
  const style = VARIANT_STYLES[variant];
  const Icon = style.Icon;

  const reduced = useReducedMotion();
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = reduced
      ? open
        ? 1
        : 0
      : withTiming(open ? 1 : 0, {
          duration: open ? motion.medium : motion.fast,
          easing: Easing.bezier(...motion.easeOut),
        });
  }, [open, reduced, progress]);
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.96 + progress.value * 0.04 }, { translateY: (1 - progress.value) * 8 }],
  }));

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (!busy) onCancel();
      }}
    >
      <Pressable
        onPress={() => {
          if (!busy) onCancel();
        }}
        className="flex-1 items-center justify-center px-8"
        style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      >
        <Animated.View style={cardStyle} className="w-full max-w-[380px]">
          <Pressable onPress={() => {}} className="rounded-[20px] bg-surface-card p-6">
          <View className="flex-row items-start gap-3">
            {Icon ? (
              <View className={cn("size-9 shrink-0 items-center justify-center rounded-full", style.iconWrapper)}>
                <Icon size={20} color={style.iconColor(colors)} strokeWidth={2} />
              </View>
            ) : null}
            <View className="min-w-0 flex-1">
              <Text className="font-sans-bold text-[15px] text-text-primary">{title}</Text>
              <View className="mt-1.5">
                {typeof message === "string" ? (
                  <Text className="font-sans text-[13px] leading-5 text-text-muted">{message}</Text>
                ) : (
                  message
                )}
              </View>
            </View>
          </View>

          <View className="mt-5 flex-row items-center justify-end gap-2">
            <Pressable
              onPress={onCancel}
              disabled={busy}
              accessibilityRole="button"
              className={cn("h-9 items-center justify-center rounded-full border border-border bg-surface-card px-4", busy && "opacity-50")}
            >
              <Text className="font-sans-semibold text-[12px] text-text-primary">{cancelLabel}</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              disabled={busy}
              accessibilityRole="button"
              className={cn("h-9 items-center justify-center rounded-full px-4", style.confirmBox, busy && "opacity-60")}
            >
              <Text className={cn("font-sans-semibold text-[12px]", style.confirmText)}>{busy ? "Working" : confirmLabel}</Text>
            </Pressable>
          </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
