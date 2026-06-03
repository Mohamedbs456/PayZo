import { useEffect } from "react";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { cn } from "@/lib/cn";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced ? 1 : 0.5);

  useEffect(() => {
    if (reduced) return;
    progress.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [reduced, progress]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: 0.5 + progress.value * 0.5 }));

  return (
    <Animated.View
      style={animatedStyle}
      className={cn("rounded-xl bg-accent-soft", className)}
    />
  );
}
