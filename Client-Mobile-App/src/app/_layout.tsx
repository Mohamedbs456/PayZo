import "../../global.css";

import { useEffect, useState } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { StatusBar } from "expo-status-bar";
import { vars } from "nativewind";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import {
  InstrumentSans_600SemiBold,
  InstrumentSans_700Bold,
} from "@expo-google-fonts/instrument-sans";
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
} from "@expo-google-fonts/jetbrains-mono";
import { ToastHost } from "@/components/ui/Toast";
import { getStoredTheme } from "@/lib/clientPrefs";
import { cssVars } from "@/lib/tokens";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useHealthCheck } from "@/hooks/useHealthCheck";
import { usePushNotifications } from "@/lib/push/handlers";
import { BrandSplash } from "@/components/layout/BrandSplash";

void SplashScreen.preventAutoHideAsync();

// Cross-screen services that must live inside the QueryClient provider: backend
// health polling (maintenance gate) and push listeners (foreground + tap).
function AppServices() {
  useHealthCheck();
  usePushNotifications();
  return null;
}

export default function RootLayout() {
  const { scheme, setColorScheme } = useColorScheme();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  const [loaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    InstrumentSans_600SemiBold,
    InstrumentSans_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });

  // Apply the stored theme; leave it on the system scheme when unset.
  useEffect(() => {
    void getStoredTheme().then((t) => {
      setColorScheme(t ?? "light");
    });
  }, [setColorScheme]);

  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  if (!loaded) return <BrandSplash />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={vars(cssVars(scheme))} className="flex-1">
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <BottomSheetModalProvider>
              <Stack screenOptions={{ headerShown: false, animation: "fade_from_bottom", animationDuration: 280 }}>
                <Stack.Screen
                  name="(modals)"
                  options={{ presentation: "modal", animation: "slide_from_bottom", animationDuration: 320 }}
                />
              </Stack>
              <AppServices />
              <ToastHost />
              <StatusBar style={scheme === "dark" ? "light" : "dark"} />
            </BottomSheetModalProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </View>
    </GestureHandlerRootView>
  );
}
