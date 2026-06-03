import { View } from "react-native";
import { Stack } from "expo-router";
import { vars } from "nativewind";
import { cssVars } from "@/lib/tokens";

// External (pre-auth) screens stay light regardless of the in-app dark-mode
// setting — dark mode is for the authenticated app only. Injecting the light
// token vars here overrides the root scheme for this subtree.
export default function AuthLayout() {
  return (
    <View style={vars(cssVars("light"))} className="flex-1">
      <Stack screenOptions={{ headerShown: false, animation: "fade_from_bottom", animationDuration: 280 }} />
    </View>
  );
}
