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
import { sendRegistrationOtp, type OtpChannel } from "@/lib/api/endpoints";
import { signupFlow } from "@/store/authFlow";

export default function SignupChannelScreen() {
  const toast = useToast();
  const { colors } = useColorScheme();
  const flow = signupFlow.get();
  const [channel, setChannel] = useState<OtpChannel>("EMAIL");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!flow) router.replace("/signup");
  }, [flow]);

  if (!flow) return null;

  async function onSubmit() {
    if (busy) return;
    setBusy(true);
    try {
      await sendRegistrationOtp({ cin: flow!.cin, channel });
      signupFlow.patch({
        channel,
        maskedDestination: channel === "EMAIL" ? flow!.email : flow!.phone,
      });
      router.push("/signup-verify");
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
          Step 2 of 3
        </Text>
        <Text className="font-display-bold text-[26px] text-text-primary">Confirm your identity</Text>
        <Text className="font-sans text-[14px] text-text-secondary">
          We'll send a verification code to confirm this account belongs to you.
        </Text>
      </View>

      <View className="flex-row gap-3">
        <ChannelOption
          channel="EMAIL"
          maskedValue={flow.email}
          selected={channel === "EMAIL"}
          onSelect={setChannel}
          disabled={busy}
        />
        <ChannelOption
          channel="SMS"
          maskedValue={flow.phone}
          selected={channel === "SMS"}
          onSelect={setChannel}
          disabled={busy}
        />
      </View>

      <Button
        busy={busy}
        onPress={onSubmit}
        trailingIcon={<ArrowRight size={16} color={colors.accentForeground} strokeWidth={2.2} />}
      >
        {busy ? "Sending" : "Send code"}
      </Button>
    </AuthScreen>
  );
}
