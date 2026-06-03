import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { ArrowRight } from "lucide-react-native";
import { AuthScreen } from "@/components/layout/AuthScreen";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { useColorScheme } from "@/hooks/useColorScheme";
import { ApiError } from "@/lib/api/error";
import { forgotPasswordStart } from "@/lib/api/endpoints";
import { forgotFlow } from "@/store/authFlow";

export default function ForgotScreen() {
  const toast = useToast();
  const { colors } = useColorScheme();
  const [cin, setCin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    if (busy) return;
    const trimmed = cin.trim();
    if (trimmed.length < 8) {
      setError("Enter your 8-digit CIN.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await forgotPasswordStart(trimmed);
      forgotFlow.set({ cin: trimmed, maskedDestination: res.maskedDestination });
      router.push("/forgot-verify");
    } catch (err) {
      // The backend always returns 200 to avoid leaking which CINs exist, so a
      // failure here is a transport problem, not "no such account".
      toast.showToast({
        tier: "danger",
        message:
          err instanceof ApiError && err.message
            ? err.message
            : "Unable to start the reset. Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreen>
      <View className="gap-2">
        <Text className="font-display-bold text-[26px] text-text-primary">Reset your password</Text>
        <Text className="font-sans text-[14px] text-text-secondary">
          Enter your CIN to receive a reset code at your registered contact.
        </Text>
      </View>

      <TextField
        label="CIN"
        placeholder="8 digits"
        keyboardType="number-pad"
        value={cin}
        onChangeText={(t) => setCin(t.replace(/\D/g, "").slice(0, 8))}
        editable={!busy}
        error={error}
      />

      <Button
        busy={busy}
        onPress={onSubmit}
        trailingIcon={<ArrowRight size={16} color={colors.accentForeground} strokeWidth={2.2} />}
      >
        {busy ? "Sending" : "Send reset code"}
      </Button>

      <View className="flex-row items-center justify-center gap-1 pt-1">
        <Pressable onPress={() => router.replace("/login")} hitSlop={6}>
          <Text className="font-sans-semibold text-[13px] text-accent">Back to sign in</Text>
        </Pressable>
      </View>
    </AuthScreen>
  );
}
