import { useEffect, useState } from "react";
import { ArrowLeft, Lock } from "lucide-react";
import { OtpInput, type OtpState } from "@/components/ui/OtpInput";

interface Step3OtpConfirmationProps {
  maskedPhone: string;
  recipientName: string;
  amountLabel: string;
  /** Controlled OTP value owned by `<SendToSomeoneFlow />`. */
  otp: string;
  /** Visual state of the cells — driven by the flow. */
  otpState: OtpState;
  /** Fired on every keystroke so the flow can dim "error" / "verified"
   *  states once the user starts editing again. */
  onOtpChange: (value: string) => void;
  /** Fired when 6 digits have been typed. The flow flips
   *  `otpState` to "verified" but does NOT call the BE — that
   *  happens on "Confirm and send" in the summary panel. */
  onOtpComplete: (value: string) => void;
  /** Fires the resend cooldown reset. */
  onResend: () => void;
  onBack: () => void;
}

const OTP_RESEND_SECONDS = 60;

/**
 * Step 3 — OTP entry. Cells turn green the moment 6 digits are typed
 * (visual "verified"); the actual BE submit happens later, on the
 * summary-panel "Confirm and send" click.
 */
export function Step3OtpConfirmation({
  maskedPhone,
  recipientName,
  amountLabel,
  otp,
  otpState,
  onOtpChange,
  onOtpComplete,
  onResend,
  onBack,
}: Step3OtpConfirmationProps) {
  const [resendIn, setResendIn] = useState(OTP_RESEND_SECONDS);

  useEffect(() => {
    const handle = setInterval(
      () => setResendIn((s) => Math.max(0, s - 1)),
      1000,
    );
    return () => clearInterval(handle);
  }, []);

  function resend() {
    if (resendIn > 0) return;
    setResendIn(OTP_RESEND_SECONDS);
    onResend();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto pr-1">
      <p className="font-sans text-[14px] leading-[1.6] text-text-secondary">
        We sent a 6-digit code to your phone ({maskedPhone}). Enter it below
        to authorize the transfer of{" "}
        <span className="font-semibold text-text-primary">{amountLabel}</span>{" "}
        to{" "}
        <span className="font-semibold text-text-primary">{recipientName}</span>
        .
      </p>

      <OtpInput
        value={otp}
        onChange={onOtpChange}
        onSubmit={onOtpComplete}
        state={otpState}
        variant="card"
      />

      <div className="flex items-center justify-center gap-2">
        <p className="font-sans text-[13px] text-text-secondary">
          Didn't receive it?
        </p>
        {resendIn > 0 ? (
          <span className="inline-flex h-8 items-center rounded-lg bg-accent-soft px-3 font-sans text-[13px] font-semibold text-accent">
            Resend in {resendIn}s
          </span>
        ) : (
          <button
            type="button"
            onClick={resend}
            className="inline-flex h-8 items-center rounded-lg bg-accent-soft px-3 font-sans text-[13px] font-semibold text-accent transition-colors duration-150 ease-out hover:bg-accent hover:text-accent-foreground"
          >
            Send a new code
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 rounded-xl bg-surface-raised px-4 py-3.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-positive-soft">
          <Lock className="size-4 text-positive" strokeWidth={2} aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="font-sans text-[13px] font-bold text-text-primary">
            Treat this code like a key to your money
          </p>
          <p className="font-sans text-[12px] text-text-secondary">
            Anyone who has it can authorize this transfer — never share it,
            not even with someone claiming to be from PayZo.
          </p>
        </div>
      </div>

      </div>

      <div className="flex shrink-0 pt-4">
        <button
          type="button"
          onClick={onBack}
          className="flex h-11 items-center gap-1.5 rounded-[10px] bg-surface-raised pl-4 pr-5 font-sans text-[14px] font-semibold text-text-secondary transition-colors duration-150 ease-out hover:bg-surface-soft"
        >
          <ArrowLeft className="size-4" strokeWidth={2.2} aria-hidden />
          Back
        </button>
      </div>
    </div>
  );
}
