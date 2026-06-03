import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View, type PressableProps } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { cn } from "@/lib/cn";
import { motion } from "@/lib/tokens";
import { useColorScheme } from "@/hooks/useColorScheme";

export type ButtonVariant = "primary" | "outline" | "ghost";
export type ButtonSize = "md" | "lg";

interface ButtonProps extends Omit<PressableProps, "children" | "style"> {
  children: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  busy?: boolean;
  className?: string;
}

const VARIANT_BOX: Record<ButtonVariant, string> = {
  primary: "bg-accent",
  outline: "bg-surface-card border border-border-strong",
  ghost: "",
};

const VARIANT_TEXT: Record<ButtonVariant, string> = {
  primary: "text-accent-foreground",
  outline: "text-text-primary",
  ghost: "text-text-secondary",
};

const SIZE_BOX: Record<ButtonSize, string> = {
  md: "h-11 px-5 gap-1.5",
  lg: "h-12 px-6 gap-2",
};

const SIZE_TEXT: Record<ButtonSize, string> = {
  md: "text-[13px]",
  lg: "text-[14px]",
};

export function Button({
  children,
  variant = "primary",
  size = "lg",
  leadingIcon,
  trailingIcon,
  busy = false,
  disabled,
  onPress,
  className,
  ...rest
}: ButtonProps) {
  const { colors } = useColorScheme();
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const inactive = disabled || busy;

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const spinnerColor = variant === "primary" ? colors.accentForeground : colors.textPrimary;

  return (
    <Animated.View style={animatedStyle} className="w-full">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !!inactive, busy }}
        disabled={inactive}
        onPress={(e) => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress?.(e);
        }}
        onPressIn={() => {
          if (!reduced)
            scale.value = withTiming(0.97, {
              duration: motion.press,
              easing: Easing.bezier(...motion.easeOut),
            });
        }}
        onPressOut={() => {
          scale.value = withTiming(1, {
            duration: motion.medium,
            easing: Easing.bezier(...motion.easeOut),
          });
        }}
        className={cn(
          "w-full flex-row items-center justify-center rounded-xl",
          SIZE_BOX[size],
          VARIANT_BOX[variant],
          inactive && "opacity-60",
          className,
        )}
        {...rest}
      >
        {busy ? (
          <ActivityIndicator size="small" color={spinnerColor} />
        ) : (
          <View className="flex-row items-center" style={{ gap: size === "lg" ? 8 : 6 }}>
            {leadingIcon}
            <Text className={cn("font-sans-semibold", SIZE_TEXT[size], VARIANT_TEXT[variant])}>
              {children}
            </Text>
            {trailingIcon}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}
