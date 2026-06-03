import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { Check } from "lucide-react-native";
import { useColorScheme } from "@/hooks/useColorScheme";
import { motion } from "@/lib/tokens";

interface SendStepIndicatorProps {
  current: 1 | 2 | 3 | 4;
}

type Colors = ReturnType<typeof useColorScheme>["colors"];

// Compact 4-chip stepper: 1 recipient · 2 amount · 3 OTP · 4 outcome. The fill
// animates so it tracks the page slide; each chip shows its number (muted when
// upcoming, light when active) and a check once completed.
export function SendStepIndicator({ current }: SendStepIndicatorProps) {
  const { colors } = useColorScheme();
  const reduced = useReducedMotion();
  const cur = useSharedValue<number>(current);

  useEffect(() => {
    cur.value = reduced
      ? current
      : withTiming(current, { duration: motion.medium, easing: Easing.bezier(...motion.easeOut) });
  }, [current, reduced, cur]);

  return (
    <View className="flex-row items-center gap-1.5">
      {([1, 2, 3, 4] as const).map((step, idx) => (
        <View key={step} className="flex-row items-center gap-1.5">
          <Chip step={step} cur={cur} colors={colors} />
          {idx < 3 ? <Connector index={step} cur={cur} colors={colors} /> : null}
        </View>
      ))}
    </View>
  );
}

function Chip({ step, cur, colors }: { step: number; cur: SharedValue<number>; colors: Colors }) {
  const boxStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      cur.value,
      [step - 0.6, step, step + 0.6],
      [colors.surfaceRaised, colors.accent, colors.positive],
    ),
    transform: [
      { scale: interpolate(cur.value, [step - 0.6, step, step + 0.6], [1, 1.12, 1], Extrapolation.CLAMP) },
    ],
  }));
  const todoNum = useAnimatedStyle(() => ({
    opacity: interpolate(cur.value, [step - 0.5, step], [1, 0], Extrapolation.CLAMP),
  }));
  const activeNum = useAnimatedStyle(() => ({
    opacity: interpolate(cur.value, [step - 0.5, step, step + 0.5], [0, 1, 0], Extrapolation.CLAMP),
  }));
  const doneCheck = useAnimatedStyle(() => ({
    opacity: interpolate(cur.value, [step + 0.2, step + 0.6], [0, 1], Extrapolation.CLAMP),
  }));
  return (
    <Animated.View style={boxStyle} className="size-6 items-center justify-center rounded-[12px]">
      <Animated.View style={todoNum} className="absolute inset-0 items-center justify-center">
        <Text className="font-sans-bold text-[11px] text-text-muted">{step}</Text>
      </Animated.View>
      <Animated.View style={activeNum} className="absolute inset-0 items-center justify-center">
        <Text className="font-sans-bold text-[11px] text-accent-foreground">{step}</Text>
      </Animated.View>
      <Animated.View style={doneCheck} className="absolute inset-0 items-center justify-center">
        <Check size={12} color="#ffffff" strokeWidth={3} />
      </Animated.View>
    </Animated.View>
  );
}

function Connector({ index, cur, colors }: { index: number; cur: SharedValue<number>; colors: Colors }) {
  const style = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(cur.value, [index, index + 1], [colors.borderSoft, colors.positive]),
  }));
  return <Animated.View style={style} className="h-0.5 w-5 rounded-full" />;
}
