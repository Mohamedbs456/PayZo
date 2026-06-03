import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { PasswordField } from "@/components/ui/PasswordField";
import { PasswordRequirementsList } from "@/components/auth/PasswordRequirementsList";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/error";
import { isPasswordValid } from "@/features/me/passwordPolicy";
import { completeFirstLogin } from "@/lib/api/endpoints";

export function FirstLoginModal({
  firstName,
  onSuccess,
}: {
  firstName: string;
  onSuccess: () => void;
}) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = isPasswordValid(password);
  const matches = password === confirm;

  async function onSubmit() {
    if (busy) return;
    if (!valid) {
      setError("Your password doesn't meet all requirements.");
      return;
    }
    if (!matches) {
      setError("The passwords don't match.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await completeFirstLogin({ newPassword: password });
      toast.showToast({ tier: "success", message: "Password set. Welcome to PayZo." });
      onSuccess();
    } catch (err) {
      toast.showToast({
        tier: "danger",
        message:
          err instanceof ApiError && err.message
            ? err.message
            : "Unable to set your password. Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="absolute inset-0 bg-surface-soft" style={{ elevation: 20, zIndex: 20 }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + 40, padding: 20, gap: 20, flexGrow: 1 }}
      >
        <View className="gap-2">
          <Text className="font-display-bold text-[24px] text-text-primary">
            {firstName ? `Welcome, ${firstName}` : "Set your password"}
          </Text>
          <Text className="font-sans text-[14px] text-text-secondary">
            Choose a password to finish setting up your account. You'll use it to sign in from now on.
          </Text>
        </View>

        <PasswordField
          label="New password"
          placeholder="New password"
          value={password}
          onChangeText={setPassword}
          editable={!busy}
          textContentType="newPassword"
        />
        <PasswordRequirementsList password={password} />
        <PasswordField
          label="Confirm password"
          placeholder="Re-enter password"
          value={confirm}
          onChangeText={setConfirm}
          editable={!busy}
          error={confirm.length > 0 && !matches ? "Passwords don't match." : error}
        />

        <Button busy={busy} disabled={!valid || !matches} onPress={onSubmit}>
          {busy ? "Saving" : "Set password and continue"}
        </Button>
      </ScrollView>
    </View>
  );
}
