import { useCallback, useEffect, useRef, type ComponentType, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { AlertCircle, AlertTriangle, CheckCircle2, type LucideProps } from "lucide-react-native";
import { cn } from "@/lib/cn";
import { useColorScheme } from "@/hooks/useColorScheme";

export type ConfirmVariant = "danger" | "warning" | "positive" | "primary";

interface VariantStyle {
  Icon: ComponentType<LucideProps> | null;
  iconWrapper: string;
  iconColor: (c: ReturnType<typeof useColorScheme>["colors"]) => string;
  confirmBox: string;
  confirmText: string;
}

const VARIANT_STYLES: Record<ConfirmVariant, VariantStyle> = {
  danger: {
    Icon: AlertTriangle,
    iconWrapper: "bg-negative-soft",
    iconColor: (c) => c.negative,
    confirmBox: "bg-negative",
    confirmText: "text-white",
  },
  warning: {
    Icon: AlertCircle,
    iconWrapper: "bg-warning-soft",
    iconColor: (c) => c.warning,
    confirmBox: "bg-warning",
    confirmText: "text-white",
  },
  positive: {
    Icon: CheckCircle2,
    iconWrapper: "bg-positive-soft",
    iconColor: (c) => c.positive,
    confirmBox: "bg-positive",
    confirmText: "text-white",
  },
  primary: {
    Icon: null,
    iconWrapper: "",
    iconColor: (c) => c.accent,
    confirmBox: "bg-accent",
    confirmText: "text-accent-foreground",
  },
};

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "primary",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { colors } = useColorScheme();
  const ref = useRef<BottomSheetModal>(null);
  const style = VARIANT_STYLES[variant];
  const Icon = style.Icon;

  useEffect(() => {
    if (!open) {
      ref.current?.dismiss();
      return;
    }
    // Present on the next frame. Calling present() synchronously while the
    // sheet is still registering with the modal provider — which happens when
    // `open` flips from an on-mount effect like the biometric enrollment offer
    // — silently no-ops, so the dialog never appears.
    const raf = requestAnimationFrame(() => {
      console.log("[dialog] present:", title);
      ref.current?.present();
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.4}
        pressBehavior="close"
        style={[props.style, { backgroundColor: colors.scrim }]}
      />
    ),
    [colors.scrim],
  );

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      onDismiss={() => {
        if (open) onCancel();
      }}
      handleIndicatorStyle={{ backgroundColor: colors.border }}
      backgroundStyle={{ backgroundColor: colors.surfaceCard, borderRadius: 20 }}
    >
      <BottomSheetView className="px-6 pb-8 pt-2">
        <View className="flex-row items-start gap-3">
          {Icon ? (
            <View
              className={cn(
                "size-9 shrink-0 items-center justify-center rounded-full",
                style.iconWrapper,
              )}
            >
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
            className={cn(
              "h-9 items-center justify-center rounded-full border border-border bg-surface-card px-4",
              busy && "opacity-50",
            )}
          >
            <Text className="font-sans-semibold text-[12px] text-text-primary">{cancelLabel}</Text>
          </Pressable>
          <Pressable
            onPress={onConfirm}
            disabled={busy}
            accessibilityRole="button"
            className={cn(
              "h-9 items-center justify-center rounded-full px-4",
              style.confirmBox,
              busy && "opacity-60",
            )}
          >
            <Text className={cn("font-sans-semibold text-[12px]", style.confirmText)}>
              {busy ? "Working" : confirmLabel}
            </Text>
          </Pressable>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
}
