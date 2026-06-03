import { useCallback } from "react";
import { BackHandler } from "react-native";
import { router, useFocusEffect } from "expo-router";

// Runs `onBack` on Android hardware back while the screen is focused. Return
// true to consume the press (stay in the flow), false to allow the default pop.
export function useHardwareBack(onBack: () => boolean) {
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
      return () => sub.remove();
    }, [onBack]),
  );
}

// Step to the previous screen on back, so multi-step flows (OTP, scanner) don't
// exit on a single press. Falls through to the default when nothing can pop.
export function backToPrevious(): boolean {
  if (router.canGoBack()) {
    router.back();
    return true;
  }
  return false;
}
