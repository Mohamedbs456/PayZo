import type { ReactNode } from "react";
import { View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { vars } from "nativewind";
import { cn } from "@/lib/cn";
import { angleToStartEnd, cssVars, gradients } from "@/lib/tokens";
import { useColorScheme } from "@/hooks/useColorScheme";

type GradientVariant = "authNavy" | "balanceTeal" | "avatar";

interface GradientHeaderProps {
  variant?: GradientVariant;
  children?: ReactNode;
  className?: string;
}

export function GradientHeader({
  variant = "authNavy",
  children,
  className,
}: GradientHeaderProps) {
  const { scheme } = useColorScheme();
  const def =
    variant === "avatar" && scheme === "dark" ? gradients.avatarDark : gradients[variant];
  const { start, end } = angleToStartEnd(def.angle);

  return (
    <LinearGradient
      colors={def.colors}
      locations={def.locations}
      start={start}
      end={end}
      style={{ borderRadius: 16 }}
    >
      <View style={vars(cssVars("light"))} className={cn("p-5", className)}>{children}</View>
    </LinearGradient>
  );
}
