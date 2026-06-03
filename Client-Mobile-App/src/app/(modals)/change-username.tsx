import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { AtSign, X } from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { useColorScheme } from "@/hooks/useColorScheme";
import { ApiError } from "@/lib/api/error";
import { useMe } from "@/hooks/useMe";
import { useAuthStore } from "@/store/authStore";
import { normalizeUsername, validateUsername } from "@/features/me/usernameRules";
import { type ClientProfile, updateUsername } from "@/features/me/api";

export default function ChangeUsernameModal() {
  const insets = useSafeAreaInsets();
  const { colors } = useColorScheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { me } = useMe();
  const userId = useAuthStore((s) => s.userId);

  const [value, setValue] = useState(me?.username ?? "");
  const [busy, setBusy] = useState(false);

  const current = me?.username ?? "";
  const normalized = normalizeUsername(value);
  const validation = validateUsername(value);
  const unchanged = normalized === current.toLowerCase();
  const canSave = validation.ok && !unchanged && !busy;

  async function submit() {
    if (!canSave) return;
    setBusy(true);
    try {
      const updated = await updateUsername(normalized);
      queryClient.setQueryData<ClientProfile>(["me", userId], (old) => (old ? { ...old, ...updated } : updated));
      toast.showToast({ tier: "success", message: "Username updated." });
      router.back();
    } catch (err) {
      toast.showToast({ tier: "danger", message: usernameErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  const inlineError = value.trim().length > 0 && !validation.ok ? (validation as { reason: string }).reason : null;

  return (
    <View className="flex-1 bg-surface-soft" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-4 py-3">
        <Text className="font-display-bold text-[18px] text-text-primary">Change username</Text>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/dashboard"))} accessibilityLabel="Close" hitSlop={8} className="size-9 items-center justify-center rounded-full">
          <X size={22} color={colors.textPrimary} strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 16 }}
      >
        <Text className="font-sans text-[13px] text-text-secondary">
          Your @username is how other PayZo users find you. 3-30 characters: lowercase letters, digits, dots,
          and underscores, starting with a letter.
        </Text>

        <TextField
          label="Username"
          value={value}
          onChangeText={setValue}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="firstname.lastname"
          editable={!busy}
          error={inlineError}
          rightSlot={<AtSign size={18} color={colors.textMuted} strokeWidth={2} />}
        />

        <Button busy={busy} disabled={!canSave} onPress={submit}>
          {busy ? "Saving" : "Save username"}
        </Button>
      </ScrollView>
    </View>
  );
}

function usernameErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return "Unable to update your username. Please try again.";
  switch (err.errorCode) {
    case "USERNAME_INVALID":
      return "This username is not valid.";
    case "USERNAME_TAKEN":
      return "This username is already taken.";
    case "USERNAME_RESERVED":
      return "This username is reserved.";
    default:
      return err.message ?? "Unable to update your username. Please try again.";
  }
}
