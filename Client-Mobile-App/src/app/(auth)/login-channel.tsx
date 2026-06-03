import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { ArrowRight } from "lucide-react-native";
import { AuthScreen } from "@/components/layout/AuthScreen";
import { Button } from "@/components/ui/Button";
import { ChannelOption } from "@/components/auth/ChannelOption";
import { useToast } from "@/components/ui/Toast";
import { useColorScheme } from "@/hooks/useColorScheme";
import { ApiError } from "@/lib/api/error";
import { initiateLoginOtp, type OtpChannel } from "@/lib/api/endpoints";
import { loginFlow } from "@/store/authFlow";

export default function LoginChannelScreen() {
  const toast = useToast();
  const { colors } = useColorScheme();
  const flow = loginFlow.get();
  const [channel, setChannel] = useState<OtpChannel>("EMAIL");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!flow) router.replace("/login");
    else if (!flow.maskedEmail && flow.maskedPhone) setChannel("SMS");
  }, [flow]);

  if (!flow) return null;

  async function onSubmit() {
    if (busy) return;
    setBusy(true);
    try {
      await initiateLoginOtp({ accessToken: flow!.tokens.access_token, channel });
      loginFlow.patch({
        channel,
        maskedDestination: channel === "EMAIL" ? flow!.maskedEmail : flow!.maskedPhone,
      });
      router.push("/login-verify");
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 429
          ? "Too many attempts. Please wait a minute and try again."
          : err instanceof ApiError && err.message
            ? err.message
            : "Unable to send the code. Please try again.";
      toast.showToast({ tier: "danger", message: msg });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreen>
      <View className="gap-2">
        <Text className="font-sans-semibold text-[11px] uppercase tracking-[0.8px] text-accent">
          Step 2 of 2
        </Text>
        <Text className="font-display-bold text-[26px] text-text-primary">
          Choose where to receive your code
        </Text>
        <Text className="font-sans text-[14px] text-text-secondary">
          Select where to receive your sign-in code. We'll send it as soon as you continue.
        </Text>
      </View>

      <View className="flex-row gap-3">
        <ChannelOption
          channel="EMAIL"
          maskedValue={flow.maskedEmail ?? "—"}
          selected={channel === "EMAIL"}
          onSelect={setChannel}
          disabled={busy || !flow.maskedEmail}
        />
        <ChannelOption
          channel="SMS"
          maskedValue={flow.maskedPhone ?? "—"}
          selected={channel === "SMS"}
          onSelect={setChannel}
          disabled={busy || !flow.maskedPhone}
        />
      </View>

      <Button
        busy={busy}
        onPress={onSubmit}
        trailingIcon={<ArrowRight size={16} color={colors.accentForeground} strokeWidth={2.2} />}
      >
        {busy ? "Sending" : "Send sign-in code"}
      </Button>
    </AuthScreen>
  );
}
