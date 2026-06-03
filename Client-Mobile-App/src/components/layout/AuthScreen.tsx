import type { ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { angleToStartEnd, gradients } from "@/lib/tokens";
import { palette } from "@/lib/tokens";
import { PayZoWordmark } from "@/components/ui/PayZoWordmark";

const navy = gradients.authNavy;
const { start, end } = angleToStartEnd(navy.angle);

export function AuthScreen({
  children,
  showTagline = false,
}: {
  children: ReactNode;
  showTagline?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-surface-soft">
      <StatusBar style="light" />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 32 }}
      >
        <LinearGradient
          colors={navy.colors}
          locations={navy.locations}
          start={start}
          end={end}
          style={{ paddingTop: insets.top + 28, paddingBottom: 32, alignItems: "center", gap: 8 }}
        >
          <PayZoWordmark width={150} color={palette.light.textOnInverse} />
          {showTagline ? (
            <Text
              className="font-sans-medium text-[10px] uppercase text-text-on-inverse"
              style={{ letterSpacing: 0.8, color: palette.light.textOnInverse }}
            >
              EASY · INTELLIGENT · TRUSTED
            </Text>
          ) : null}
        </LinearGradient>
        <View className="flex-1 gap-5 px-5 pt-6">{children}</View>
      </ScrollView>
    </View>
  );
}
