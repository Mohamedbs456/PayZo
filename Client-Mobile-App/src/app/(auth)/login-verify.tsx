import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { ArrowRight } from "lucide-react-native";
import { AuthScreen } from "@/components/layout/AuthScreen";
import { Button } from "@/components/ui/Button";
import { OtpInput, type OtpState } from "@/components/ui/OtpInput";
import { useToast } from "@/components/ui/Toast";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useHardwareBack, backToPrevious } from "@/hooks/useHardwareBack";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/api/error";
import { initiateLoginOtp, verifyLoginOtp } from "@/lib/api/endpoints";
import { loginFlow } from "@/store/authFlow";
import { useAuthStore } from "@/store/authStore";

const OTP_TTL = 5 * 60;
const RESEND_COOLDOWN = 60;

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function parseAttemptsLeft(err: ApiError): number | null {
  const code = err.errorCode ?? "";
  const match = code.match(/(\d+)/) ?? err.message.match(/(\d+)\s*(?:left|remaining)/i);
  return match ? Number(match[1]) : null;
}

export default function LoginVerifyScreen() {
  const toast = useToast();
  const { colors } = useColorScheme();
  const flow = loginFlow.get();

  const [code, setCode] = useState("");
  const [otpState, setOtpState] = useState<OtpState>("idle");
  const [helper, setHelper] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(OTP_TTL);
  const [resendIn, setResendIn] = useState(RESEND_COOLDOWN);
  const [attemptKey, setAttemptKey] = useState(0);
  const submittedFor = useRef<string | null>(null);

  // Hardware back returns to the channel screen, not out of the flow (item 20).
  useHardwareBack(backToPrevious);

  useEffect(() => {
    if (!flow) router.replace("/login");
  }, [flow]);

  useEffect(() => {
    const handle = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
      setResendIn((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(handle);
  }, []);

  useEffect(() => {
    if (secondsLeft === 0 && otpState !== "expired") {
      setOtpState("expired");
      setHelper("Your code has expired. Request a new one to continue.");
    }
  }, [secondsLeft, otpState]);

  if (!flow) return null;
  const maskedDestination = flow.maskedDestination ?? flow.identifier;

  function scheduleErrorReset() {
    setTimeout(() => {
      setCode("");
      setAttemptKey((k) => k + 1);
      setOtpState((c) => (c === "error" ? "idle" : c));
    }, 1200);
  }

  async function attempt(value: string) {
    if (otpState === "submitting" || otpState === "verified") return;
    if (submittedFor.current === value) return;
    submittedFor.current = value;
    setOtpState("submitting");
    setHelper(null);
    try {
      await verifyLoginOtp({ userId: flow!.userId, otpCode: value }, flow!.tokens.access_token);
      useAuthStore.getState().applyTokens(flow!.tokens);
      await useAuthStore.getState().persistRefresh();
      loginFlow.clear();
      setOtpState("verified");
      setTimeout(() => router.replace("/(tabs)/dashboard"), 500);
    } catch (err) {
      submittedFor.current = null;
      if (err instanceof ApiError) {
        if (err.status === 410) {
          setOtpState("expired");
          setHelper("Your code has expired. Request a new one to continue.");
          return;
        }
        if (err.status === 401) {
          const left = parseAttemptsLeft(err);
          if (left === 0) {
            setOtpState("invalidated");
            setHelper("Too many incorrect attempts. Request a new code to continue.");
          } else {
            setOtpState("error");
            setHelper(
              left === 1
                ? "Incorrect code. 1 attempt remaining before it is invalidated."
                : `Incorrect code. ${left ?? 2} attempts remaining.`,
            );
            scheduleErrorReset();
          }
          return;
        }
      }
      setOtpState("error");
      setHelper("Unable to reach PayZo. Please try again.");
      scheduleErrorReset();
    }
  }

  async function handleResend() {
    if (resendIn > 0) return;
    try {
      await initiateLoginOtp({
        accessToken: flow!.tokens.access_token,
        channel: flow!.channel ?? "EMAIL",
      });
      setCode("");
      setAttemptKey((k) => k + 1);
      setOtpState("idle");
      setHelper(null);
      setSecondsLeft(OTP_TTL);
      setResendIn(RESEND_COOLDOWN);
      toast.showToast({ tier: "success", message: "New code sent." });
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 429
          ? "Too many attempts. Please wait a minute."
          : "Unable to send a new code. Please try again.";
      toast.showToast({ tier: "danger", message: msg });
    }
  }

  const lockedForNewCode = otpState === "expired" || otpState === "invalidated";
  const isError = otpState === "error" || otpState === "invalidated" || otpState === "expired";

  return (
    <AuthScreen>
      <View className="gap-2">
        <Text className="font-display-bold text-[26px] text-text-primary">Verify your identity</Text>
        <Text className="font-sans text-[14px] leading-5 text-text-secondary">
          We sent a 6-digit code to{" "}
          <Text className="font-sans-semibold text-text-primary">{maskedDestination}</Text>. It
          expires in {fmt(secondsLeft)}.
        </Text>
      </View>

      <View className="gap-3">
        <Text className="font-sans-medium text-[11px] uppercase tracking-[0.66px] text-text-secondary">
          Enter 6-digit code
        </Text>
        <OtpInput
          key={attemptKey}
          state={otpState}
          onChange={(next) => {
            setCode(next);
            if (otpState === "error") {
              setOtpState("idle");
              setHelper(null);
            }
          }}
          onSubmit={attempt}
        />
        {helper ? (
          <Text className={cn("font-sans text-[12px]", isError ? "text-negative" : "text-text-muted")}>
            {helper}
          </Text>
        ) : null}
        <View className="flex-row items-center gap-1">
          <Text className="font-sans text-[12px] text-text-muted">Didn't receive a code?</Text>
          {resendIn > 0 ? (
            <Text className="font-sans text-[12px] text-text-muted">Resend in {fmt(resendIn)}</Text>
          ) : (
            <Pressable onPress={handleResend} hitSlop={6}>
              <Text className="font-sans-semibold text-[12px] text-accent">Send a new code</Text>
            </Pressable>
          )}
        </View>
      </View>

      <Button
        disabled={code.length !== 6 || lockedForNewCode}
        busy={otpState === "submitting"}
        onPress={() => attempt(code)}
        trailingIcon={<ArrowRight size={16} color={colors.accentForeground} strokeWidth={2.2} />}
      >
        {otpState === "submitting" ? "Verifying" : "Verify and continue"}
      </Button>
    </AuthScreen>
  );
}
