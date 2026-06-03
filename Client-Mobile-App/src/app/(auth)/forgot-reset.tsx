import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { AuthScreen } from "@/components/layout/AuthScreen";
import { Button } from "@/components/ui/Button";
import { PasswordField } from "@/components/ui/PasswordField";
import { PasswordRequirementsList } from "@/components/auth/PasswordRequirementsList";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/error";
import { isPasswordValid } from "@/features/me/passwordPolicy";
import { forgotPasswordReset } from "@/lib/api/endpoints";
import { forgotFlow } from "@/store/authFlow";

export default function ForgotResetScreen() {
  const toast = useToast();
  const flow = forgotFlow.get();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!flow?.resetToken) router.replace("/forgot");
  }, [flow]);

  if (!flow?.resetToken) return null;

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
      await forgotPasswordReset(flow!.resetToken!, password);
      forgotFlow.clear();
      toast.showToast({ tier: "success", message: "Password updated. You can now sign in." });
      router.replace("/login");
    } catch (err) {
      toast.showToast({
        tier: "danger",
        message:
          err instanceof ApiError && err.status === 410
            ? "This reset link has expired. Please start again."
            : err instanceof ApiError && err.message
              ? err.message
              : "Unable to update your password. Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreen>
      <View className="gap-2">
        <Text className="font-display-bold text-[26px] text-text-primary">Set a new password</Text>
        <Text className="font-sans text-[14px] text-text-secondary">
          Choose a new password you haven't used before.
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
        {busy ? "Updating" : "Update password"}
      </Button>
    </AuthScreen>
  );
}
