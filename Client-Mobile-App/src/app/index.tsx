import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Redirect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { angleToStartEnd, gradients, palette } from "@/lib/tokens";
import { PayZoWordmark } from "@/components/ui/PayZoWordmark";
import { refreshTokens } from "@/lib/auth/keycloak";
import { useAuthStore } from "@/store/authStore";

type Target = "/(tabs)/dashboard" | "/login" | "/biometric-unlock";

const navy = gradients.authNavy;
const { start, end } = angleToStartEnd(navy.angle);

function BootSplash() {
  return (
    <View className="flex-1">
      <StatusBar style="light" />
      <LinearGradient
        colors={navy.colors}
        locations={navy.locations}
        start={start}
        end={end}
        style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 24 }}
      >
        <PayZoWordmark width={170} color={palette.light.textOnInverse} />
        <ActivityIndicator color={palette.light.textOnInverse} />
      </LinearGradient>
    </View>
  );
}

export default function Index() {
  const [target, setTarget] = useState<Target | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const store = useAuthStore.getState();
      await store.hydrateFlags();

      if (store.biometricEnabled) {
        if (!cancelled) setTarget("/biometric-unlock");
        return;
      }

      const refresh = await store.loadRefreshFromStore();
      if (!refresh) {
        if (!cancelled) setTarget("/login");
        return;
      }
      try {
        const raw = await refreshTokens(refresh);
        store.applyTokens(raw);
        await store.persistRefresh();
        if (!cancelled) setTarget("/(tabs)/dashboard");
      } catch {
        await store.clearSession();
        if (!cancelled) setTarget("/login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (__DEV__ && target) console.log("[boot] target=", target);
  }, [target]);

  if (!target) return <BootSplash />;
  return <Redirect href={target} />;
}
