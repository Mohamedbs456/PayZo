import { useRef, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import * as Haptics from "expo-haptics";
import { Camera, Keyboard, X } from "lucide-react-native";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useHardwareBack, backToPrevious } from "@/hooks/useHardwareBack";
import { isValidRib, normalizeRib } from "@/lib/rib";
import { validateUsername } from "@/features/me/usernameRules";
import { useTransferFlow } from "@/store/transferFlow";

export default function QrScanModal() {
  const insets = useSafeAreaInsets();
  const { colors } = useColorScheme();
  const [permission, requestPermission] = useCameraPermissions();
  const setScannedRib = useTransferFlow((s) => s.setScannedRib);
  const setScannedUsername = useTransferFlow((s) => s.setScannedUsername);

  // CameraView swallows the native back press; dismiss the modal explicitly.
  useHardwareBack(backToPrevious);

  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);

  // Auto-detect: a valid 20-digit RIB goes to the RIB tab; otherwise a
  // well-formed @username goes to the username tab. Anything else is rejected.
  function handleScan(result: BarcodeScanningResult) {
    if (locked.current) return;
    const raw = (result.data ?? "").trim();
    const compact = raw.replace(/\s+/g, "");
    const asRib = normalizeRib(compact);

    if (/^\d/.test(compact) && isValidRib(asRib)) {
      locked.current = true;
      setError(null);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setScannedRib(asRib);
      router.back();
      return;
    }

    const handle = raw.replace(/^@+/, "").trim().toLowerCase();
    if (validateUsername(handle).ok) {
      locked.current = true;
      setError(null);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setScannedUsername(handle);
      router.back();
      return;
    }

    setError("This QR code isn't a PayZo RIB or username.");
  }

  // Permission still loading.
  if (!permission) {
    return <View className="flex-1 bg-black" />;
  }

  // Not granted yet — ask, or send to settings if hard-denied.
  if (!permission.granted) {
    const canAsk = permission.canAskAgain;
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-surface-soft px-8" style={{ paddingTop: insets.top }}>
        <View className="size-16 items-center justify-center rounded-full bg-accent-soft">
          <Camera size={28} color={colors.accent} strokeWidth={2} />
        </View>
        <Text className="text-center font-sans-bold text-[18px] text-text-primary">Camera access required</Text>
        <Text className="max-w-[300px] text-center font-sans text-[13px] text-text-secondary">
          PayZo uses the camera to scan a recipient's RIB QR code. Nothing is recorded.
        </Text>
        <Pressable
          onPress={() => (canAsk ? void requestPermission() : void Linking.openSettings())}
          accessibilityRole="button"
          className="h-12 items-center justify-center rounded-xl bg-accent px-6"
        >
          <Text className="font-sans-semibold text-[14px] text-accent-foreground">
            {canAsk ? "Allow camera" : "Open settings"}
          </Text>
        </Pressable>
        <Pressable onPress={() => router.back()} accessibilityRole="button" className="h-10 items-center justify-center px-4">
          <Text className="font-sans-semibold text-[13px] text-text-secondary">Enter manually instead</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <StatusBar style="light" />
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={handleScan}
      />

      {/* Scan-window cutout overlay */}
      <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
        <View className="size-64 rounded-3xl border-2 border-white/80" />
        <Text className="mt-5 font-sans-semibold text-[14px] text-white">Point the camera at a RIB or @username QR code</Text>
        {error ? (
          <View className="mt-3 rounded-lg bg-negative px-3 py-2">
            <Text className="font-sans-medium text-[12px] text-white">{error}</Text>
          </View>
        ) : null}
      </View>

      {/* Top close */}
      <View className="absolute left-0 right-0 flex-row justify-end px-4" style={{ top: insets.top + 8 }}>
        <Pressable
          onPress={() => router.back()}
          accessibilityLabel="Close scanner"
          className="size-11 items-center justify-center rounded-full bg-black/50"
        >
          <X size={22} color="#ffffff" strokeWidth={2.2} />
        </Pressable>
      </View>

      {/* Bottom action */}
      <View className="absolute left-0 right-0 items-center px-6" style={{ bottom: insets.bottom + 24 }}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          className="h-12 flex-row items-center justify-center gap-2 rounded-xl bg-white/95 px-6"
        >
          <Keyboard size={18} color={colors.textPrimary} strokeWidth={2} />
          <Text className="font-sans-semibold text-[14px] text-text-primary">Enter manually</Text>
        </Pressable>
      </View>
    </View>
  );
}
