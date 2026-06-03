import { ActivityIndicator, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ServerCog } from "lucide-react-native";
import { PayZoWordmark } from "@/components/ui/PayZoWordmark";
import { angleToStartEnd, gradients, palette } from "@/lib/tokens";

const navy = gradients.authNavy;
const { start, end } = angleToStartEnd(navy.angle);
const cream = palette.light.textOnInverse;
const teal = palette.light.brandTeal;

export default function MaintenanceScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1">
      <StatusBar style="light" />
      <LinearGradient colors={navy.colors} locations={navy.locations} start={start} end={end} style={{ flex: 1 }}>
        <View
          className="flex-1 items-center justify-center gap-6 px-8"
          style={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }}
        >
          <PayZoWordmark width={150} color={cream} />

          <View
            className="size-20 items-center justify-center rounded-full"
            style={{ backgroundColor: "rgba(168,218,220,0.16)" }}
          >
            <ServerCog size={36} color={teal} strokeWidth={1.6} />
          </View>

          <View className="items-center gap-2">
            <Text className="text-center font-display-bold text-[24px]" style={{ color: cream }}>
              Temporarily unavailable
            </Text>
            <Text className="max-w-[320px] text-center font-sans text-[14px] leading-6" style={{ color: teal }}>
              We're unable to reach PayZo right now. Your account and balance are safe. This screen
              will close on its own once service is restored.
            </Text>
          </View>

          <View className="flex-row items-center gap-2 pt-2">
            <ActivityIndicator color={teal} />
            <Text className="font-sans-medium text-[12px] uppercase" style={{ color: teal, letterSpacing: 0.8 }}>
              Reconnecting
            </Text>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}
