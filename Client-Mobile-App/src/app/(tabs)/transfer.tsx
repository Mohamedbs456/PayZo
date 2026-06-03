import { useCallback, useEffect, useState } from "react";
import { BackHandler, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { router, useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { TopBar } from "@/components/layout/TopBar";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/error";
import { motion } from "@/lib/tokens";
import { useMe } from "@/hooks/useMe";
import { useAuthStore } from "@/store/authStore";
import { getAccounts } from "@/features/dashboard/api";
import {
  type InitiateTransferRequest,
  initiateTransfer,
} from "@/features/transfers/api";
import {
  type TransferFlowState,
  useTransferFlow,
  recipientBankLabel,
  recipientDisplayName,
  recipientInitials,
} from "@/store/transferFlow";
import { SendStepIndicator } from "@/features/transfers/components/SendStepIndicator";
import {
  type ManualSelection,
  type UsernameSelection,
  Step1Recipient,
} from "@/features/transfers/Step1Recipient";
import { Step2Amount } from "@/features/transfers/Step2Amount";
import type { BeneficiaryResponse } from "@/features/transfers/beneficiariesApi";

const STEP_TITLES: Record<1 | 2, string> = {
  1: "Choose recipient",
  2: "Amount and source",
};

export default function TransferScreen() {
  const toast = useToast();
  const { me } = useMe();
  const authed = useAuthStore((s) => s.authed);
  const flow = useTransferFlow();

  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);

  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: getAccounts, enabled: authed });
  const accounts = accountsQ.data ?? [];

  // Both steps stay mounted in a horizontal pager so context is preserved and
  // forward/back reads as a directional slide rather than a hard screen swap.
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const slide = useSharedValue(0);
  useEffect(() => {
    const target = step === 2 ? -width : 0;
    slide.value = reduced
      ? target
      : withTiming(target, { duration: motion.slow, easing: Easing.bezier(...motion.easeOut) });
  }, [step, width, reduced, slide]);
  const pagerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: slide.value }] }));

  // Jump to step 2 when the beneficiaries modal launched the flow.
  useFocusEffect(
    useCallback(() => {
      if (useTransferFlow.getState().consumePreselect()) setStep(2);
    }, []),
  );

  // Android back on step 2 returns to step 1 rather than leaving the tab.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (step === 2) {
          setStep(1);
          return true;
        }
        return false;
      });
      return () => sub.remove();
    }, [step]),
  );

  function handleManual(sel: ManualSelection) {
    flow.setManual(sel);
    setStep(2);
  }
  function handleSaved(b: BeneficiaryResponse) {
    flow.setBeneficiary(b);
    setStep(2);
  }
  function handleUsername(sel: UsernameSelection) {
    flow.setUsername(sel);
    setStep(2);
  }

  async function handleNext(args: { sourceAccountNumber: string; amount: string; motif: string }) {
    if (busy) return;
    setBusy(true);
    try {
      flow.setAmount(args);
      const body = buildInitiateBody(useTransferFlow.getState(), args, Number(args.amount));
      if (!body) throw new ApiError(400, "No recipient selected.", "MISSING_RECIPIENT");
      const res = await initiateTransfer(body);
      flow.setOtpInfo({ transactionId: res.transactionId, otpMaskedPhone: res.maskedPhone });
      router.push("/transfer-confirm");
    } catch (err) {
      toast.showToast({ tier: "danger", message: initiateErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  // Reset the wizard whenever the screen regains focus after an outcome.
  useEffect(() => {
    if (!flow.transactionId && step === 2 && !flow.mode) setStep(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.mode]);

  const summaryName = recipientDisplayName(flow) || "the recipient";

  return (
    <View className="flex-1 bg-surface-soft">
      <TopBar title="Send money" />
      <View className="mb-3 flex-row items-center justify-between px-4 pt-3">
        <View className="gap-0.5">
          <Text className="font-sans-bold text-[10px] uppercase tracking-[0.1em] text-accent">
            Step {step} of 4
          </Text>
          <Text className="font-display-bold text-[20px] text-text-primary">{STEP_TITLES[step]}</Text>
        </View>
        <SendStepIndicator current={step} />
      </View>

      <View className="flex-1 overflow-hidden">
        <Animated.View style={[{ flex: 1, flexDirection: "row", width: width * 2 }, pagerStyle]}>
          <View style={{ width }} className="px-4 pb-4">
            <Step1Recipient
              busy={busy}
              onContinueManual={handleManual}
              onContinueFromSaved={handleSaved}
              onContinueFromUsername={handleUsername}
            />
          </View>
          <View style={{ width }} className="px-4 pb-4">
            <Step2Amount
              accounts={accounts}
              initial={{
                sourceAccountNumber: flow.sourceAccountNumber,
                amount: flow.amount,
                motif: flow.motif,
              }}
              defaultSourceAccountId={me?.defaultAccountId ?? null}
              recipientSummary={{
                displayName: summaryName,
                bankLabel: recipientBankLabel(flow),
                accountNumber: flow.rib,
                initials: recipientInitials(flow),
              }}
              busy={busy}
              onBack={() => setStep(1)}
              onNext={handleNext}
            />
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

function buildInitiateBody(
  state: TransferFlowState,
  args: { sourceAccountNumber: string; amount: string; motif: string },
  numericAmount: number,
): InitiateTransferRequest | null {
  const motif = args.motif || undefined;
  if (state.mode === "username" && state.payzoUsername) {
    return { sourceAccountNumber: args.sourceAccountNumber, payzoUsername: state.payzoUsername, amount: numericAmount, motif };
  }
  if (state.mode === "beneficiary" && state.beneficiary) {
    return { sourceAccountNumber: args.sourceAccountNumber, beneficiaryId: state.beneficiary.id, amount: numericAmount, motif };
  }
  if (state.mode === "manual" && state.rib) {
    return {
      sourceAccountNumber: args.sourceAccountNumber,
      destRib: state.rib,
      destFirstName: state.firstName,
      destLastName: state.lastName,
      saveBeneficiary: state.saveBeneficiary || undefined,
      beneficiaryNickname:
        state.saveBeneficiary && state.beneficiaryNickname ? state.beneficiaryNickname : undefined,
      amount: numericAmount,
      motif,
    };
  }
  return null;
}

function initiateErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return "Unable to start the transfer. Please try again.";
  switch (err.errorCode) {
    case "INSUFFICIENT_FUNDS":
      return "This account does not have sufficient balance.";
    case "INVALID_RIB":
      return "The destination RIB is not valid.";
    case "NAME_MISMATCH":
      return "The name no longer matches the bank's records. Please try again.";
    case "CANNOT_TRANSFER_TO_SELF":
      return "You cannot transfer to your own account here.";
    case "BANK_NOT_REGISTERED":
      return "Transfers to this bank are not supported.";
    case "BANK_INACTIVE":
      return "Transfers to this bank are temporarily paused.";
    case "PENDING_TRANSFER":
      return "Complete your other pending transfer before starting a new one.";
    case "CLIENT_BLOCKED":
      return "Your account is on hold. Please contact PayZo support.";
    case "RECIPIENT_NO_DEFAULT_ACCOUNT":
      return "This recipient has no default account.";
    default:
      return err.message ?? "Unable to start the transfer. Please try again.";
  }
}
