import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown, LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AlertTriangle, Check, Info, X } from "lucide-react-native";
import { create } from "zustand";
import { cn } from "@/lib/cn";
import { useColorScheme } from "@/hooks/useColorScheme";

export type ToastTier = "success" | "danger" | "warning" | "info" | "neutral";

interface ToastInput {
  tier?: ToastTier;
  message: string;
  duration?: number;
}

interface ActiveToast {
  id: string;
  tier: ToastTier;
  message: string;
  duration: number;
}

const MAX_VISIBLE = 3;
const DEFAULT_DURATION = 3000;

interface ToastStore {
  toasts: ActiveToast[];
  show: (input: ToastInput) => void;
  dismiss: (id: string) => void;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  show: (input) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const next: ActiveToast = {
      id,
      tier: input.tier ?? "neutral",
      message: input.message,
      duration: input.duration ?? DEFAULT_DURATION,
    };
    set((state) => {
      const trimmed =
        state.toasts.length >= MAX_VISIBLE ? state.toasts.slice(1) : state.toasts;
      return { toasts: [...trimmed, next] };
    });
    timers.set(
      id,
      setTimeout(() => get().dismiss(id), next.duration),
    );
  },
  dismiss: (id) => {
    const handle = timers.get(id);
    if (handle) {
      clearTimeout(handle);
      timers.delete(id);
    }
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));

export function showToast(input: ToastInput) {
  useToastStore.getState().show(input);
}

export function useToast() {
  const show = useToastStore((s) => s.show);
  return { showToast: show };
}

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: 0, right: 0, bottom: insets.bottom + 24 }}
      className="items-center gap-2 px-4"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </View>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ActiveToast; onDismiss: () => void }) {
  const { colors } = useColorScheme();
  const tierColor: Record<ToastTier, string | undefined> = {
    success: colors.positive,
    danger: colors.negative,
    warning: colors.warning,
    info: colors.textFaint,
    neutral: undefined,
  };
  const Icon = iconForTier(toast.tier);
  const color = tierColor[toast.tier];

  return (
    <Animated.View
      entering={FadeInDown.duration(200)}
      exiting={FadeOutDown.duration(150)}
      layout={LinearTransition}
      pointerEvents="auto"
      className="w-full max-w-[480px]"
    >
      <View className="flex-row items-center gap-2.5 rounded-xl bg-surface-inverse px-4 py-3 shadow-lg">
        {Icon && color ? (
          <Icon size={16} color={color} strokeWidth={2} />
        ) : null}
        <Text className="min-w-0 flex-1 font-sans-medium text-[13px] text-text-on-inverse">
          {toast.message}
        </Text>
        {toast.tier === "danger" ? (
          <Pressable
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Dismiss notification"
            hitSlop={8}
          >
            <X size={14} color={colors.textOnInverse} strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

function iconForTier(tier: ToastTier) {
  switch (tier) {
    case "success":
      return Check;
    case "danger":
      return X;
    case "warning":
      return AlertTriangle;
    case "info":
      return Info;
    default:
      return null;
  }
}
