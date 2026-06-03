import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api";
import { isDemoMode, withDemo } from "@/lib/demoMode";
import { useMe } from "@/features/me/MeProvider";
import {
  type ClientAccount,
  getAccounts,
} from "@/features/dashboard/api";
import { DEMO_ACCOUNTS } from "@/features/dashboard/mockData";
import {
  type RibResolveResponse,
  type UsernameResolveResponse,
  confirmTransferOtp,
  initiateTransfer,
  resendTransferOtp,
} from "@/features/transfers/api";
import type { BeneficiaryResponse } from "@/features/transfers/beneficiariesApi";
import type { OtpState } from "@/components/ui/OtpInput";
import { formatRibDisplay } from "@/lib/rib";
import { TransferSummaryPanel } from "@/features/transfers/components/TransferSummaryPanel";
import { SendStepIndicator } from "@/features/transfers/components/SendStepIndicator";
import {
  type Step1RecipientSelection,
  type Step1UsernameSelection,
  Step1Recipient,
} from "@/features/transfers/steps/Step1Recipient";
import { Step2SourceAndAmount } from "@/features/transfers/steps/Step2SourceAndAmount";
import { Step3OtpConfirmation } from "@/features/transfers/steps/Step3OtpConfirmation";
import { Step4Outcome } from "@/features/transfers/steps/Step4Outcome";

export type SendStep = 1 | 2 | 3 | 4;

// One of three mutually-exclusive recipient modes. Mirrors the
// tri-shape body the backend accepts on POST /api/v1/client/transfers.
type RecipientMode = "manual" | "beneficiary" | "username";

interface SendWizardState {
  step: SendStep;

  // Recipient — exactly one of the three branches below is "active",
  // tracked by `mode`. We hold each branch's local state separately so
  // back-navigation doesn't lose unrelated data.
  mode: RecipientMode | null;

  // Manual (RIB + sender-typed names) branch.
  rib: string;                              // normalized 20 digits
  firstName: string;
  lastName: string;
  resolved: RibResolveResponse | null;      // bank + masked names
  saveBeneficiary: boolean;
  beneficiaryNickname: string;

  // Saved-beneficiary branch.
  beneficiary: BeneficiaryResponse | null;

  // Username branch.
  payzoUsername: string;
  usernameResolved: UsernameResolveResponse | null;

  // Amount step.
  sourceAccountNumber: string;
  amount: string;
  motif: string;

  // OTP step.
  transactionId: string | null;
  otpMaskedPhone: string;
}

const initialState: SendWizardState = {
  step: 1,
  mode: null,
  rib: "",
  firstName: "",
  lastName: "",
  resolved: null,
  saveBeneficiary: false,
  beneficiaryNickname: "",
  beneficiary: null,
  payzoUsername: "",
  usernameResolved: null,
  sourceAccountNumber: "",
  amount: "",
  motif: "",
  transactionId: null,
  otpMaskedPhone: "",
};

/**
 * Holds wizard state and renders the active step + the right-rail
 * summary panel. The flow is 4 steps in all three paths:
 *   1. Pick recipient (3-tab segmented control: @username · Saved · RIB)
 *   2. Source account + amount + motif
 *   3. OTP confirmation
 *   4. Outcome screen
 *
 * Per D53, exactly one of three recipient modes carries through the
 * wizard, and the body of the eventual POST /transfers reflects it:
 *   - `manual`      → { sourceAccountNumber, destRib, destFirstName, destLastName, ... }
 *   - `beneficiary` → { sourceAccountNumber, beneficiaryId, ... }
 *   - `username`    → { sourceAccountNumber, payzoUsername, ... }
 */
export function SendToSomeoneFlow() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { me } = useMe();
  const demo = isDemoMode();

  const [state, setState] = useState<SendWizardState>(initialState);
  const [accounts, setAccounts] = useState<ClientAccount[]>([]);
  const [busy, setBusy] = useState(false);

  // OTP state lives at the flow level so the summary-panel CTA can read it.
  const [otp, setOtp] = useState("");
  const [otpState, setOtpState] = useState<OtpState>("idle");

  // Load accounts once for step 2's bank/account dropdowns.
  useEffect(() => {
    if (demo) {
      setAccounts(DEMO_ACCOUNTS);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await getAccounts();
        if (!cancelled) setAccounts(data);
      } catch (err) {
        if (cancelled) return;
        if (!(err instanceof ApiError)) throw err;
        setAccounts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [demo]);

  const patch = useCallback(
    (updates: Partial<SendWizardState>) =>
      setState((s) => ({ ...s, ...updates })),
    [],
  );

  // Pre-select a beneficiary handed in via router state (e.g. from a
  // BeneficiariesPage bubble tap). One-shot on mount: jumps the wizard
  // straight to Step 2 with the recipient pre-loaded, then clears the
  // state so a hard refresh doesn't re-fire the skip.
  useEffect(() => {
    const preSelect = (
      location.state as { preSelectBeneficiary?: BeneficiaryResponse } | null
    )?.preSelectBeneficiary;
    if (preSelect && state.step === 1) {
      handleStep1FromSaved(preSelect);
      navigate(location.pathname + location.search, {
        replace: true,
        state: null,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── Step transitions ─────────────────────────────────────────────── */

  function handleStep1Manual(sel: Step1RecipientSelection) {
    patch({
      mode: "manual",
      rib: sel.rib,
      firstName: sel.firstName,
      lastName: sel.lastName,
      resolved: sel.resolved,
      saveBeneficiary: sel.saveBeneficiary,
      beneficiaryNickname: sel.beneficiaryNickname,
      beneficiary: null,
      payzoUsername: "",
      usernameResolved: null,
      step: 2,
    });
  }

  function handleStep1FromSaved(b: BeneficiaryResponse) {
    patch({
      mode: "beneficiary",
      rib: b.accountNumber,
      firstName: "",
      lastName: "",
      resolved: null,
      beneficiary: b,
      saveBeneficiary: false,
      beneficiaryNickname: "",
      payzoUsername: "",
      usernameResolved: null,
      step: 2,
    });
  }

  function handleStep1FromUsername(sel: Step1UsernameSelection) {
    patch({
      mode: "username",
      // Carry the masked account so the summary panel can show a RIB-shaped
      // hint without revealing the full 20 digits.
      rib: sel.resolved.accountNumberMasked,
      firstName: sel.resolved.firstName,
      lastName: sel.resolved.lastName,
      resolved: null,
      beneficiary: null,
      saveBeneficiary: false,
      beneficiaryNickname: "",
      payzoUsername: sel.username,
      usernameResolved: sel.resolved,
      step: 2,
    });
  }

  async function handleStep2Next(args: {
    sourceAccountNumber: string;
    amount: string;
    motif: string;
  }) {
    if (busy) return;
    setBusy(true);
    try {
      const numericAmount = Number(args.amount);
      if (demo) {
        patch({
          ...args,
          step: 3,
          transactionId: "demo-tx-id",
          otpMaskedPhone: "•••••86",
        });
      } else {
        const body = buildInitiateBody(state, args, numericAmount);
        if (!body) {
          throw new ApiError(400, "No recipient selected.", "MISSING_RECIPIENT");
        }
        const res = await initiateTransfer(body);
        patch({
          ...args,
          step: 3,
          transactionId: res.transactionId,
          otpMaskedPhone: res.maskedPhone,
        });
      }
      setOtp("");
      setOtpState("idle");
    } catch (err) {
      toast.showToast({
        tier: "danger",
        message: initiateErrorMessage(err),
      });
    } finally {
      setBusy(false);
    }
  }

  /* ─── OTP — local "verified" on 6 digits, BE call on Confirm ───────── */

  function handleOtpChange(next: string) {
    setOtp(next);
    if (otpState === "error" && next.length < 6) setOtpState("idle");
    if (otpState === "verified" && next.length < 6) setOtpState("idle");
  }

  function handleOtpComplete(value: string) {
    setOtp(value);
    setOtpState("verified");
  }

  async function handleConfirmAndSend() {
    if (busy) return;
    if (otp.length !== 6) return;
    setBusy(true);
    setOtpState("submitting");
    try {
      if (demo) {
        await new Promise((r) => setTimeout(r, 500));
      } else {
        await confirmTransferOtp(state.transactionId!, otp);
      }
      setOtpState("verified");
      patch({ step: 4 });
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) {
        setOtpState("expired");
      } else if (err instanceof ApiError && err.status === 401) {
        setOtpState("error");
      } else {
        setOtpState("error");
        toast.showToast({
          tier: "danger",
          message: "Couldn't send the transfer. Try again.",
        });
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleResendOtp() {
    // Clear the input so the user can type the new code, then ask the
    // backend to issue a fresh OTP. Backend enforces the 60s rate-limit;
    // we surface its error as a toast and KEEP the previous code valid
    // (the failed resend doesn't invalidate the original token).
    setOtp("");
    setOtpState("idle");
    if (demo) {
      // Demo mode has no backend OTP — just reset the input.
      toast.showToast({ tier: "info", message: "Demo mode: pretend new code sent" });
      return;
    }
    if (!state.transactionId) return;
    try {
      await resendTransferOtp(state.transactionId);
      toast.showToast({ tier: "success", message: "A new code has been sent" });
    } catch (e) {
      const message =
        e instanceof ApiError ? e.message : "Could not resend the code. Please wait a moment and try again.";
      toast.showToast({ tier: "danger", message });
    }
  }

  function back() {
    setState((s) =>
      s.step > 1 ? { ...s, step: (s.step - 1) as SendStep } : s,
    );
  }

  function startOver() {
    setState({ ...initialState });
    setOtp("");
    setOtpState("idle");
  }

  /* ─── Summary derivation ───────────────────────────────────────────── */

  const recipientDisplayName =
    state.mode === "beneficiary"
      ? state.beneficiary?.displayName ?? ""
      : state.mode === "username"
        ? `${state.usernameResolved?.firstName ?? ""} ${state.usernameResolved?.lastName ?? ""}`.trim()
        : `${state.firstName} ${state.lastName}`.trim();

  const recipientBankLabel =
    state.mode === "beneficiary"
      ? state.beneficiary?.bankCode ?? null
      : state.mode === "username"
        ? state.usernameResolved?.bankCode ?? null
        : state.resolved?.bankCode ?? null;

  const recipientInitials =
    state.mode === "beneficiary"
      ? state.beneficiary?.initials ?? "··"
      : state.mode === "username"
        ? initialsFromName(
            state.usernameResolved?.firstName ?? "",
            state.usernameResolved?.lastName ?? "",
          )
        : initialsFromName(state.firstName, state.lastName);

  const summaryFields = buildSummaryFields({
    state,
    accounts,
    recipientDisplayName,
    recipientBankLabel,
  });

  /* ─── Render ───────────────────────────────────────────────────────── */

  return (
    <div className="flex w-full min-h-0 flex-1 flex-col gap-4 lg:flex-row">
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border-soft bg-surface-card px-6 py-5 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.18)] sm:px-8 sm:py-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <p
              className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-accent"
              style={{ fontVariationSettings: "'wdth' 100" }}
            >
              Step {state.step} of 4
            </p>
            <h1 className="font-sans text-[clamp(18px,2.2vw,22px)] font-bold leading-tight text-text-primary">
              {STEP_TITLES[state.step]}
            </h1>
          </div>
          <SendStepIndicator current={state.step} />
        </header>

        <div
          key={state.step}
          className="mt-3 flex min-h-0 flex-1 animate-step-fade-in flex-col"
        >
          {state.step === 1 && (
            <Step1Recipient
              initial={{
                rib: state.mode === "manual" ? state.rib : "",
                firstName: state.firstName,
                lastName: state.lastName,
                saveBeneficiary: state.saveBeneficiary,
                beneficiaryNickname: state.beneficiaryNickname,
              }}
              busy={busy}
              onContinueManual={handleStep1Manual}
              onContinueFromSaved={handleStep1FromSaved}
              onContinueFromUsername={handleStep1FromUsername}
            />
          )}
          {state.step === 2 && (
            <Step2SourceAndAmount
              accounts={accounts}
              initial={{
                sourceAccountNumber: state.sourceAccountNumber,
                amount: state.amount,
                motif: state.motif,
              }}
              defaultSourceAccountId={me?.defaultAccountId ?? null}
              recipientSummary={{
                displayName: recipientDisplayName,
                bankLabel: recipientBankLabel,
                accountNumber: state.rib,
                initials: recipientInitials || "··",
              }}
              busy={busy}
              onBack={back}
              onNext={handleStep2Next}
            />
          )}
          {state.step === 3 && (
            <Step3OtpConfirmation
              maskedPhone={state.otpMaskedPhone || "•••••86"}
              recipientName={recipientDisplayName || "the recipient"}
              amountLabel={summaryFields.amount ?? "0.000 TND"}
              otp={otp}
              otpState={otpState}
              onOtpChange={handleOtpChange}
              onOtpComplete={handleOtpComplete}
              onResend={handleResendOtp}
              onBack={back}
            />
          )}
          {state.step === 4 && (
            <Step4Outcome
              recipientName={recipientDisplayName || "the recipient"}
              amountLabel={summaryFields.amount ?? "0.000 TND"}
              onSendAnother={startOver}
              onDone={() => navigate(withDemo("/dashboard"), { replace: true })}
            />
          )}
        </div>
      </main>

      <TransferSummaryPanel
        headerEyebrow="Transfer summary"
        headerTitle="Sending money"
        headerSubtitle="Live preview as you fill each step"
        fields={summaryFields}
        cta={
          state.step === 3
            ? {
                label: "Confirm and send",
                helperText: "By tapping Confirm, you authorize this transfer.",
                disabled: otpState !== "verified" || busy,
                busy,
                onClick: handleConfirmAndSend,
              }
            : undefined
        }
      />
    </div>
  );
}

const STEP_TITLES: Record<SendStep, string> = {
  1: "Choose recipient",
  2: "From which account and how much?",
  3: "Confirm with your one-time code",
  4: "All done",
};

/* ─── Initiate-body builder ───────────────────────────────────────────── */

function buildInitiateBody(
  state: SendWizardState,
  args: { sourceAccountNumber: string; amount: string; motif: string },
  numericAmount: number,
) {
  const motif = args.motif || undefined;
  if (state.mode === "username" && state.payzoUsername) {
    return {
      sourceAccountNumber: args.sourceAccountNumber,
      payzoUsername: state.payzoUsername,
      amount: numericAmount,
      motif,
    };
  }
  if (state.mode === "beneficiary" && state.beneficiary) {
    return {
      sourceAccountNumber: args.sourceAccountNumber,
      beneficiaryId: state.beneficiary.id,
      amount: numericAmount,
      motif,
    };
  }
  if (state.mode === "manual" && state.rib) {
    return {
      sourceAccountNumber: args.sourceAccountNumber,
      destRib: state.rib,
      destFirstName: state.firstName,
      destLastName: state.lastName,
      saveBeneficiary: state.saveBeneficiary || undefined,
      beneficiaryNickname:
        state.saveBeneficiary && state.beneficiaryNickname
          ? state.beneficiaryNickname
          : undefined,
      amount: numericAmount,
      motif,
    };
  }
  return null;
}

/* ─── Summary derivation ──────────────────────────────────────────────── */

function buildSummaryFields({
  state,
  accounts,
  recipientDisplayName,
  recipientBankLabel,
}: {
  state: SendWizardState;
  accounts: ClientAccount[];
  recipientDisplayName: string;
  recipientBankLabel: string | null;
}) {
  const sourceAccount = accounts.find(
    (a) => a.accountNumber === state.sourceAccountNumber,
  );
  const numericAmount = Number(state.amount);

  const hasRecipient = !!recipientDisplayName.trim();
  const hasRib = !!state.rib;

  const accountSecondary = hasRib
    ? state.mode === "username"
      ? state.rib // already pre-masked by the backend
      : formatRibDisplay(state.rib)
    : undefined;

  const toSecondary =
    state.mode === "beneficiary"
      ? "Saved beneficiary"
      : state.mode === "username"
        ? `@${state.payzoUsername}`
        : state.resolved
          ? "Identity verified ✓"
          : undefined;

  return {
    toName: hasRecipient ? recipientDisplayName : undefined,
    toSecondary,

    accountTitle: hasRib
      ? recipientBankLabel
        ? `${recipientBankLabel} account`
        : "Destination account"
      : undefined,
    accountSecondary,

    fromTitle: sourceAccount
      ? `${sourceAccount.bankCode} · ${sourceAccount.type === "CHECKING" ? "Checking" : "Savings"}`
      : undefined,
    fromSecondary: sourceAccount
      ? `${formatRibDisplay(sourceAccount.accountNumber)} · ${formatTnd(sourceAccount.balance)} TND`
      : undefined,

    amount: numericAmount > 0 ? `${formatTnd(numericAmount)} TND` : undefined,
    motif: state.motif || undefined,
  };
}

function initialsFromName(first: string, last: string): string {
  const f = first.trim().charAt(0).toUpperCase();
  const l = last.trim().charAt(0).toUpperCase();
  return (f + l) || "··";
}

function initiateErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return "Couldn't start the transfer. Try again.";
  switch (err.errorCode) {
    case "INSUFFICIENT_FUNDS":
      return "That source account doesn't have enough balance.";
    case "INVALID_RIB":
      return "We can't read that destination RIB.";
    case "NAME_MISMATCH":
      return "The name we re-checked at the bank no longer matches. Try again.";
    case "CANNOT_TRANSFER_TO_SELF":
      return "You can't send money to your own account here.";
    case "BANK_NOT_REGISTERED":
      return "We don't currently support transfers to this bank.";
    case "BANK_INACTIVE":
      return "Transfers to this bank are temporarily paused.";
    case "PENDING_TRANSFER":
      return "Wrap up your other pending transfer before starting a new one.";
    case "CLIENT_BLOCKED":
      return "Your account is on hold. Reach out to PayZo support.";
    case "RECIPIENT_NO_DEFAULT_ACCOUNT":
      return "Recipient has no default account.";
    default:
      return err.message ?? "Couldn't start the transfer. Try again.";
  }
}

function formatTnd(value: number): string {
  const fixed = Math.abs(value).toFixed(3);
  const [intPart, fracPart] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${grouped}.${fracPart}`;
}
