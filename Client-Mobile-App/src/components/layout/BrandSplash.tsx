import { Image, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { angleToStartEnd, gradients } from "@/lib/tokens";

const teal = gradients.balanceTeal;
const { start, end } = angleToStartEnd(teal.angle);

// Shown while the app initializes (fonts/cold-boot). Android 13's native splash
// can only use a solid colour, so the real teal gradient lives here and takes
// over from the native splash (solid #063b4d + same shield) with no visible
// seam — the shield keeps its size and position across the handoff.
export function BrandSplash() {
  return (
    <View className="flex-1">
      <StatusBar style="light" />
      <LinearGradient
        colors={teal.colors}
        locations={teal.locations}
        start={start}
        end={end}
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      >
        <Image
          source={require("../../../assets/images/splash-icon.png")}
          style={{ width: 260, height: 260 }}
          resizeMode="contain"
        />
      </LinearGradient>
    </View>
  );
}
