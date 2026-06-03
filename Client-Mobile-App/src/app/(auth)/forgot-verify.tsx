import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { AuthScreen } from "@/components/layout/AuthScreen";
import { OtpInput, type OtpState } from "@/components/ui/OtpInput";
import { useToast } from "@/components/ui/Toast";
import { useHardwareBack, backToPrevious } from "@/hooks/useHardwareBack";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/api/error";
import { forgotPasswordStart, forgotPasswordVerifyOtp } from "@/lib/api/endpoints";
import { forgotFlow } from "@/store/authFlow";

export default function ForgotVerifyScreen() {
  const toast = useToast();
  const flow = forgotFlow.get();
  const [code, setCode] = useState("");
  const [otpState, setOtpState] = useState<OtpState>("idle");
  const [helper, setHelper] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(60);
  const [attemptKey, setAttemptKey] = useState(0);
  const submittedFor = useRef<string | null>(null);

  // Hardware back returns to the start screen, not out of the flow (item 20).
  useHardwareBack(backToPrevious);

  useEffect(() => {
    if (!flow) router.replace("/forgot");
  }, [flow]);

  useEffect(() => {
    const handle = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(handle);
  }, []);

  if (!flow) return null;

  async function attempt(value: string) {
    if (otpState === "submitting" || otpState === "verified") return;
    if (submittedFor.current === value) return;
    submittedFor.current = value;
    setOtpState("submitting");
    setHelper(null);
    try {
      const res = await forgotPasswordVerifyOtp(flow!.cin, value);
      forgotFlow.patch({ resetToken: res.resetToken });
      setOtpState("verified");
      setTimeout(() => router.replace("/forgot-reset"), 400);
    } catch (err) {
      submittedFor.current = null;
      setOtpState("error");
      setHelper(
        err instanceof ApiError && err.status === 410
          ? "Your code has expired. Request a new one."
          : "Incorrect code. Please try again.",
      );
      setTimeout(() => {
        setCode("");
        setAttemptKey((k) => k + 1);
        setOtpState((c) => (c === "error" ? "idle" : c));
      }, 1200);
    }
  }

  async function handleResend() {
    if (resendIn > 0) return;
    try {
      await forgotPasswordStart(flow!.cin);
      setCode("");
      setAttemptKey((k) => k + 1);
      setOtpState("idle");
      setHelper(null);
      setResendIn(60);
      toast.showToast({ tier: "success", message: "New code sent." });
    } catch {
      toast.showToast({ tier: "danger", message: "Unable to send a new code. Please try again." });
    }
  }

  return (
    <AuthScreen>
      <View className="gap-2">
        <Text className="font-display-bold text-[26px] text-text-primary">Enter your code</Text>
        <Text className="font-sans text-[14px] text-text-secondary">
          Sent to <Text className="font-sans-semibold text-text-primary">{flow.maskedDestination}</Text>.
        </Text>
      </View>

      <View className="gap-3">
        <OtpInput key={attemptKey} state={otpState} onChange={setCode} onSubmit={attempt} />
        {helper ? (
          <Text
            className={cn(
              "font-sans text-[12px]",
              otpState === "error" ? "text-negative" : "text-text-muted",
            )}
          >
            {helper}
          </Text>
        ) : null}
        <View className="flex-row items-center gap-1">
          <Text className="font-sans text-[12px] text-text-muted">Didn't receive a code?</Text>
          {resendIn > 0 ? (
            <Text className="font-sans text-[12px] text-text-muted">Resend in {resendIn}s</Text>
          ) : (
            <Pressable onPress={handleResend} hitSlop={6}>
              <Text className="font-sans-semibold text-[12px] text-accent">Send a new code</Text>
            </Pressable>
          )}
        </View>
      </View>
    </AuthScreen>
  );
}
