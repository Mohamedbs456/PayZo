import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { PasswordField } from "@/components/ui/PasswordField";
import { PasswordRequirementsList } from "@/components/auth/PasswordRequirementsList";
import { useToast } from "@/components/ui/Toast";
import { useColorScheme } from "@/hooks/useColorScheme";
import { ApiError } from "@/lib/api/error";
import { isPasswordValid } from "@/features/me/passwordPolicy";
import { changePassword } from "@/features/me/api";

export default function ChangePasswordModal() {
  const insets = useSafeAreaInsets();
  const { colors } = useColorScheme();
  const toast = useToast();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  const matches = next === confirm;
  const policyOK = isPasswordValid(next);
  const valid = current.length > 0 && policyOK && matches;

  async function submit() {
    setSubmitted(true);
    if (!valid || busy) return;
    setBusy(true);
    try {
      await changePassword({ currentPassword: current, newPassword: next });
      toast.showToast({ tier: "success", message: "Password updated." });
      router.back();
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 401
          ? "The current password is incorrect."
          : err instanceof ApiError && err.message
            ? err.message
            : "Unable to update your password. Please try again.";
      toast.showToast({ tier: "danger", message: msg });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="flex-1 bg-surface-soft" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-4 py-3">
        <Text className="font-display-bold text-[18px] text-text-primary">Reset password</Text>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/dashboard"))} accessibilityLabel="Close" hitSlop={8} className="size-9 items-center justify-center rounded-full">
          <X size={22} color={colors.textPrimary} strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 16 }}
      >
        <Text className="font-sans text-[13px] text-text-secondary">
          Type your current password, then choose a new one.
        </Text>
        <PasswordField label="Current password" placeholder="Current password" value={current} onChangeText={setCurrent} editable={!busy} />
        <PasswordField
          label="New password"
          placeholder="New password"
          value={next}
          onChangeText={setNext}
          editable={!busy}
          textContentType="newPassword"
          error={submitted && !policyOK ? "Does not meet all requirements." : null}
        />
        <PasswordRequirementsList password={next} />
        <PasswordField
          label="Confirm new password"
          placeholder="Re-enter new password"
          value={confirm}
          onChangeText={setConfirm}
          editable={!busy}
          error={submitted && !matches && confirm.length > 0 ? "Passwords don't match." : null}
        />
        <Button busy={busy} disabled={!valid} onPress={submit}>
          {busy ? "Saving" : "Save new password"}
        </Button>
      </ScrollView>
    </View>
  );
}
