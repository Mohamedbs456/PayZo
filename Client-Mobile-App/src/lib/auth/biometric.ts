import * as LocalAuthentication from "expo-local-authentication";

export async function biometricAvailable(): Promise<boolean> {
  console.log("[biometric] checking...");
  const hardware = await LocalAuthentication.hasHardwareAsync();
  console.log("[biometric] hasHardware:", hardware);
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  console.log("[biometric] isEnrolled:", enrolled);
  return hardware && enrolled;
}

export async function authenticate(promptMessage = "Unlock PayZo"): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    cancelLabel: "Use password instead",
  });
  return result.success;
}
