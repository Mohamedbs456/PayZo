import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { ArrowRight } from "lucide-react-native";
import { AuthScreen } from "@/components/layout/AuthScreen";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { PasswordField } from "@/components/ui/PasswordField";
import { useToast } from "@/components/ui/Toast";
import { useColorScheme } from "@/hooks/useColorScheme";
import { ApiError } from "@/lib/api/error";
import { decodeJwt } from "@/lib/auth/jwt";
import {
  ropcLogin,
  InvalidCredentialsError,
  AccountDisabledError,
  KeycloakUnreachableError,
  KeycloakConfigError,
} from "@/lib/auth/keycloak";
import { previewLoginChannels, resolveClientIdentifier } from "@/lib/api/endpoints";
import { loginFlow } from "@/store/authFlow";

export default function LoginScreen() {
  const toast = useToast();
  const { colors } = useColorScheme();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit() {
    if (busy) return;
    const trimmed = identifier.trim();
    if (!trimmed || !password) {
      setFormError("Enter your CIN or username and your password.");
      return;
    }
    setFormError(null);
    setBusy(true);
    try {
      const { keycloakUsername } = await resolveClientIdentifier(trimmed);
      const tokens = await ropcLogin(keycloakUsername, password);
      const claims = decodeJwt(tokens.access_token);
      const preview = await previewLoginChannels(tokens.access_token);
      loginFlow.set({
        tokens,
        userId: preview.userId ?? claims.sub,
        identifier: trimmed,
        maskedEmail: preview.maskedEmail,
        maskedPhone: preview.maskedPhone,
      });
      router.push("/login-channel");
    } catch (err) {
      if (err instanceof InvalidCredentialsError) {
        setFormError("Incorrect CIN/username or password.");
      } else if (err instanceof AccountDisabledError) {
        setFormError(
          "This account is not yet active. It will be available once a reviewer approves your registration.",
        );
      } else if (err instanceof ApiError && err.status === 404) {
        setFormError("Incorrect CIN/username or password.");
      } else if (err instanceof KeycloakConfigError) {
        toast.showToast({
          tier: "danger",
          message: "Sign-in is temporarily unavailable. Please contact support if this continues.",
        });
      } else if (err instanceof KeycloakUnreachableError) {
        toast.showToast({
          tier: "danger",
          message: "Unable to reach PayZo. Check your connection and try again.",
        });
      } else {
        toast.showToast({ tier: "danger", message: "An unexpected error occurred. Please try again." });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreen showTagline>
      <View className="gap-2">
        <Text className="font-display-bold text-[26px] text-text-primary">Welcome back</Text>
        <Text className="font-sans text-[14px] text-text-secondary">
          Sign in to your PayZo account
        </Text>
      </View>

      <TextField
        label="CIN or username"
        placeholder="Enter your CIN or username"
        autoCapitalize="none"
        autoCorrect={false}
        value={identifier}
        onChangeText={setIdentifier}
        editable={!busy}
      />
      <PasswordField
        label="Password"
        placeholder="Your password"
        value={password}
        onChangeText={setPassword}
        editable={!busy}
        labelAdornment={
          <Pressable onPress={() => router.push("/forgot")} hitSlop={6}>
            <Text className="font-sans-semibold text-[11px] text-text-secondary">
              Forgot password?
            </Text>
          </Pressable>
        }
      />

      {formError ? <Text className="font-sans text-[13px] text-negative">{formError}</Text> : null}

      <Button
        busy={busy}
        onPress={onSubmit}
        trailingIcon={<ArrowRight size={16} color={colors.accentForeground} strokeWidth={2.2} />}
      >
        {busy ? "Signing in" : "Sign in"}
      </Button>

      <View className="flex-row items-center justify-center gap-1 pt-1">
        <Text className="font-sans text-[13px] text-text-secondary">New to PayZo?</Text>
        <Pressable onPress={() => router.push("/signup")} hitSlop={6}>
          <Text className="font-sans-semibold text-[13px] text-accent">Create an account</Text>
        </Pressable>
      </View>
    </AuthScreen>
  );
}
