import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { ArrowRight, BadgeCheck } from "lucide-react-native";
import { AuthScreen } from "@/components/layout/AuthScreen";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useColorScheme } from "@/hooks/useColorScheme";
import { ApiError } from "@/lib/api/error";
import { previewRegistration, type RegistrationPreviewResponse } from "@/lib/api/endpoints";
import { signupFlow } from "@/store/authFlow";

export default function SignupScreen() {
  const { colors } = useColorScheme();
  const [cin, setCin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<RegistrationPreviewResponse | null>(null);

  async function lookup() {
    if (busy) return;
    const trimmed = cin.trim();
    if (trimmed.length < 8) {
      setError("Enter your 8-digit CIN.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await previewRegistration(trimmed);
      setPreview(res);
      signupFlow.set({
        cin: res.cin,
        firstName: res.firstName,
        lastName: res.lastName,
        email: res.email,
        phone: res.phone,
        governorate: res.governorate,
      });
    } catch (err) {
      setPreview(null);
      setError(
        err instanceof ApiError && err.status === 404
          ? "No bank record was found for that CIN."
          : err instanceof ApiError && err.message
            ? err.message
            : "Unable to verify that CIN. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreen>
      <View className="gap-2">
        <Text className="font-display-bold text-[26px] text-text-primary">Create your account</Text>
        <Text className="font-sans text-[14px] text-text-secondary">
          Enter your CIN to retrieve your details from the bank.
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

      {preview ? (
        <View className="gap-3 rounded-[16px] border border-border-soft bg-surface-card p-4">
          <View className="flex-row items-center gap-2">
            <BadgeCheck size={18} color={colors.positive} strokeWidth={2} />
            <Text className="font-sans-semibold text-[13px] text-text-primary">
              {preview.firstName} {preview.lastName}
            </Text>
          </View>
          <Text className="font-sans text-[12px] text-text-secondary">{preview.governorate}</Text>
          <Text className="font-mono text-[12px] text-text-muted">{preview.email}</Text>
          <Text className="font-mono text-[12px] text-text-muted">{preview.phone}</Text>
        </View>
      ) : null}

      {preview ? (
        <Button
          onPress={() => router.push("/signup-channel")}
          trailingIcon={<ArrowRight size={16} color={colors.accentForeground} strokeWidth={2.2} />}
        >
          Confirm and continue
        </Button>
      ) : (
        <Button busy={busy} onPress={lookup}>
          {busy ? "Checking" : "Retrieve my details"}
        </Button>
      )}

      <View className="flex-row items-center justify-center gap-1 pt-1">
        <Text className="font-sans text-[13px] text-text-secondary">Already have an account?</Text>
        <Pressable onPress={() => router.replace("/login")} hitSlop={6}>
          <Text className="font-sans-semibold text-[13px] text-accent">Sign in</Text>
        </Pressable>
      </View>
    </AuthScreen>
  );
}
