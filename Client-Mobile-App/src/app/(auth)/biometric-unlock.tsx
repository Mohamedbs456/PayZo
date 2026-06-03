import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Fingerprint } from "lucide-react-native";
import { angleToStartEnd, gradients, palette } from "@/lib/tokens";
import { PayZoWordmark } from "@/components/ui/PayZoWordmark";
import { refreshTokens } from "@/lib/auth/keycloak";
import { useAuthStore } from "@/store/authStore";

const navy = gradients.authNavy;
const { start, end } = angleToStartEnd(navy.angle);
const cream = palette.light.textOnInverse;

export default function BiometricUnlockScreen() {
  const [status, setStatus] = useState<"unlocking" | "failed">("unlocking");

  // Reading the refresh token from the requireAuthentication SecureStore key
  // triggers the fingerprint prompt — that read IS the gate (no second prompt).
  const tryUnlock = useCallback(async () => {
    setStatus("unlocking");
    try {
      const store = useAuthStore.getState();
      const token = await store.loadBiometricRefresh();
      if (!token) throw new Error("no token");
      const raw = await refreshTokens(token);
      store.applyTokens(raw);
      router.replace("/(tabs)/dashboard");
    } catch {
      setStatus("failed");
    }
  }, []);

  useEffect(() => {
    void tryUnlock();
  }, [tryUnlock]);

  async function usePassword() {
    // Fall back to a clean password login and let the user re-enroll after.
    await useAuthStore.getState().clearSession();
    router.replace("/login");
  }

  return (
    <View className="flex-1">
      <StatusBar style="light" />
      <LinearGradient
        colors={navy.colors}
        locations={navy.locations}
        start={start}
        end={end}
        style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 28, padding: 32 }}
      >
        <PayZoWordmark width={160} color={cream} />

        {status === "unlocking" ? (
          <>
            <ActivityIndicator color={cream} />
            <Text className="font-sans text-[13px]" style={{ color: cream }}>
              Unlocking with fingerprint
            </Text>
          </>
        ) : (
          <View className="items-center gap-5">
            <Pressable
              onPress={tryUnlock}
              accessibilityRole="button"
              accessibilityLabel="Try fingerprint again"
              className="size-16 items-center justify-center rounded-full"
              style={{ backgroundColor: "rgba(241,250,238,0.12)" }}
            >
              <Fingerprint size={32} color={cream} strokeWidth={1.6} />
            </Pressable>
            <Text className="text-center font-sans text-[13px]" style={{ color: cream }}>
              Tap to try again
            </Text>
            <Pressable onPress={usePassword} hitSlop={8}>
              <Text className="font-sans-semibold text-[13px]" style={{ color: cream }}>
                Use password instead
              </Text>
            </Pressable>
          </View>
        )}
      </LinearGradient>
    </View>
  );
}
