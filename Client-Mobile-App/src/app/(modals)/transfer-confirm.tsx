import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Lock, X } from "lucide-react-native";
import { OtpInput, type OtpState } from "@/components/ui/OtpInput";
import { useToast } from "@/components/ui/Toast";
import { useColorScheme } from "@/hooks/useColorScheme";
import { ApiError } from "@/lib/api/error";
import { formatMoney } from "@/lib/format";
import { formatRibDisplay } from "@/lib/rib";
import {
  confirmTransferOtp,
  resendTransferOtp,
} from "@/features/transfers/api";
import {
  useTransferFlow,
  recipientBankLabel,
  recipientDisplayName,
} from "@/store/transferFlow";
import { TransferReviewCard } from "@/features/transfers/components/TransferReviewCard";

const RESEND_SECONDS = 60;

export default function TransferConfirmModal() {
  const insets = useSafeAreaInsets();
  const { colors } = useColorScheme();
  const toast = useToast();
  const flow = useTransferFlow();

  const [otp, setOtp] = useState("");
  const [otpState, setOtpState] = useState<OtpState>("idle");
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(RESEND_SECONDS);

  useEffect(() => {
    const handle = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(handle);
  }, []);

  const amountLabel = `${formatMoney(Number(flow.amount || 0))} TND`;
  const name = recipientDisplayName(flow) || "the recipient";

  async function confirm() {
    if (busy || otp.length !== 6) return;
    setBusy(true);
    setOtpState("submitting");
    try {
      await confirmTransferOtp(flow.transactionId!, otp);
      setOtpState("verified");
      router.replace("/transfer-outcome");
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) {
        setOtpState("expired");
      } else {
        setOtpState("error");
        if (!(err instanceof ApiError && err.status === 401)) {
          toast.showToast({ tier: "danger", message: "Unable to send the transfer. Please try again." });
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (resendIn > 0 || !flow.transactionId) return;
    setResendIn(RESEND_SECONDS);
    setOtp("");
    setOtpState("idle");
    try {
      await resendTransferOtp(flow.transactionId);
      toast.showToast({ tier: "success", message: "A new code has been sent." });
    } catch (err) {
      toast.showToast({
        tier: "danger",
        message: err instanceof ApiError && err.message ? err.message : "Unable to resend the code. Please try again.",
      });
    }
  }

  const sourceLine = flow.sourceAccountNumber
    ? formatRibDisplay(flow.sourceAccountNumber)
    : undefined;

  return (
    <View className="flex-1 bg-surface-soft" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-4 py-3">
        <Text className="font-display-bold text-[18px] text-text-primary">Confirm with your code</Text>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/dashboard"))} accessibilityLabel="Close" hitSlop={8} className="size-9 items-center justify-center rounded-full">
          <X size={22} color={colors.textPrimary} strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 18 }}
      >
        <TransferReviewCard
          fields={{
            toName: name,
            toSecondary:
              flow.mode === "username"
                ? `@${flow.payzoUsername}`
                : flow.mode === "beneficiary"
                  ? "Saved beneficiary"
                  : recipientBankLabel(flow)
                    ? `${recipientBankLabel(flow)} account`
                    : undefined,
            fromTitle: "Your account",
            fromSecondary: sourceLine,
            amount: amountLabel,
            motif: flow.motif || undefined,
          }}
        />

        <Text className="font-sans text-[14px] leading-6 text-text-secondary">
          We sent a 6-digit code to your phone ({flow.otpMaskedPhone || "•••••86"}). Enter it to authorize
          sending <Text className="font-sans-semibold text-text-primary">{amountLabel}</Text> to{" "}
          <Text className="font-sans-semibold text-text-primary">{name}</Text>.
        </Text>

        <OtpInput
          state={otpState}
          variant="card"
          onChange={(v) => {
            setOtp(v);
            if ((otpState === "error" || otpState === "verified") && v.length < 6) setOtpState("idle");
          }}
          onSubmit={(v) => {
            setOtp(v);
            setOtpState("verified");
          }}
        />

        <View className="flex-row items-center justify-center gap-2">
          <Text className="font-sans text-[13px] text-text-secondary">Didn't receive it?</Text>
          {resendIn > 0 ? (
            <View className="h-8 justify-center rounded-lg bg-accent-soft px-3">
              <Text className="font-sans-semibold text-[13px] text-accent">Resend in {resendIn}s</Text>
            </View>
          ) : (
            <Pressable onPress={resend} className="h-8 justify-center rounded-lg bg-accent-soft px-3">
              <Text className="font-sans-semibold text-[13px] text-accent">Send a new code</Text>
            </Pressable>
          )}
        </View>

        <View className="flex-row items-center gap-3 rounded-xl bg-surface-raised px-4 py-3.5">
          <View className="size-9 items-center justify-center rounded-full bg-positive-soft">
            <Lock size={16} color={colors.positive} strokeWidth={2} />
          </View>
          <View className="min-w-0 flex-1">
            <Text className="font-sans-bold text-[13px] text-text-primary">
              Keep this code private
            </Text>
            <Text className="font-sans text-[12px] text-text-secondary">
              Anyone with this code can authorize this transfer. Never share it, including with anyone
              claiming to be from PayZo.
            </Text>
          </View>
        </View>

        <Pressable
          onPress={confirm}
          disabled={otpState !== "verified" || busy}
          accessibilityRole="button"
          className={`h-[52px] flex-row items-center justify-center rounded-xl bg-accent ${
            otpState !== "verified" || busy ? "opacity-50" : ""
          }`}
        >
          <Text className="font-sans-bold text-[15px] text-accent-foreground">
            {busy ? "Processing" : "Confirm and send"}
          </Text>
        </Pressable>
        <Text className="text-center font-sans text-[11px] text-text-muted">
          By tapping Confirm, you authorize this transfer.
        </Text>
      </ScrollView>
    </View>
  );
}
