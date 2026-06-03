import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Mail } from "lucide-react";
import { OtpInput, type OtpState } from "@/components/ui/OtpInput";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api";
import { ResetPasswordLayout } from "@/features/auth/components/ResetPasswordLayout";
import {
  forgotPasswordStart,
  forgotPasswordVerifyOtp,
} from "@/features/auth/api";
import {
  DEMO_PROFILE,
  DEMO_RESET_DESTINATION,
  DEMO_RESET_TOKEN,
  isDemoMode,
  withDemo,
} from "@/lib/demoMode";

interface VerifyState {
  cin: string;
  maskedDestination: string;
}

const OTP_TTL_SECONDS = 5 * 60;
const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Step 2 of forgot-password (Figma 277:42). Same OTP state machine as
 * everywhere else (Impact 24) — what's distinctive here is the visual
 * layout: a "Code sent to a•••@…" chip + countdown row sits between
 * the title and the cells, the resend pill is highlighted in
 * accent-soft, and the cells use the `card` variant of `OtpInput` to
 * match the chunkier look of the form card.
 */
export function ResetPasswordVerifyOtpPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const demo = isDemoMode();

  const state =
    (location.state as VerifyState | null) ??
    (demo
      ? { cin: DEMO_PROFILE.cin, maskedDestination: DEMO_RESET_DESTINATION }
      : null);

  if (!state?.cin) {
    return <Navigate to={withDemo("/forgot-password")} replace />;
  }

  const [code, setCode] = useState("");
  const [otpState, setOtpState] = useState<OtpState>("idle");
  const [helper, setHelper] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(OTP_TTL_SECONDS);
  const [resendIn, setResendIn] = useState(RESEND_COOLDOWN_SECONDS);
  const submittedFor = useRef<string | null>(null);

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
      setHelper("Code expired. Request a new one to continue.");
    }
  }, [secondsLeft, otpState]);

  async function attempt(value: string) {
    if (otpState === "submitting" || otpState === "verified") return;
    if (submittedFor.current === value) return;
    submittedFor.current = value;
    setOtpState("submitting");
    setHelper(null);

    try {
      let resetToken = DEMO_RESET_TOKEN;
      if (!demo) {
        const res = await forgotPasswordVerifyOtp(state!.cin, value);
        resetToken = res.resetToken;
      }
      setOtpState("verified");
      setTimeout(() => {
        navigate(withDemo("/forgot-password/reset"), {
          state: { resetToken },
          replace: true,
        });
      }, 600);
    } catch (err) {
      submittedFor.current = null;
      if (err instanceof ApiError) {
        if (err.status === 410) {
          setOtpState("expired");
          setHelper("Code expired. Request a new one to continue.");
          return;
        }
        if (err.status === 401) {
          const left = parseAttemptsLeft(err);
          if (left === 0) {
            setOtpState("invalidated");
            setHelper("Too many wrong codes. Request a new one to continue.");
          } else {
            setOtpState("error");
            setHelper(
              left === 1
                ? "Wrong code. 1 attempt left before the code is invalidated."
                : `Code didn't match. ${left ?? 2} attempts left.`,
            );
            // Brief red flash, then clear the cells so the user can retype
            // without backspacing through six digits. Helper text persists.
            scheduleErrorReset();
          }
          return;
        }
      }
      setOtpState("error");
      setHelper("Couldn't reach PayZo. Try again.");
      scheduleErrorReset();
    }
  }

  function scheduleErrorReset() {
    window.setTimeout(() => {
      setCode("");
      setOtpState((current) => (current === "error" ? "idle" : current));
    }, 1200);
  }

  async function handleResend() {
    if (resendIn > 0) return;
    try {
      if (!demo) {
        await forgotPasswordStart(state!.cin);
      }
      setCode("");
      setOtpState("idle");
      setHelper(null);
      setSecondsLeft(OTP_TTL_SECONDS);
      setResendIn(RESEND_COOLDOWN_SECONDS);
      toast.showToast({ tier: "success", message: "New code sent." });
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 429
          ? "Too many requests — give it a minute."
          : "Couldn't send a new code. Try again.";
      toast.showToast({ tier: "danger", message: msg });
    }
  }

  const lockedForNewCode =
    otpState === "expired" || otpState === "invalidated";

  return (
    <ResetPasswordLayout current={2}>
      <div className="flex w-full flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-sans text-[clamp(22px,2.4vw,26px)] font-bold leading-tight tracking-tight text-text-primary">
            Enter the 6-digit code
          </h1>
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <span className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-3.5 py-1.5">
              <Mail className="size-4 text-accent" strokeWidth={1.8} aria-hidden />
              <span className="font-sans text-[13px] font-semibold text-text-primary">
                Code sent to {state.maskedDestination}
              </span>
            </span>
            <span className="font-sans text-[12px] text-text-muted">
              Expires in {formatCountdown(secondsLeft)}
            </span>
          </div>
        </div>

        <OtpInput
          value={code}
          onChange={(next) => {
            setCode(next);
            if (otpState === "error") {
              setOtpState("idle");
              setHelper(null);
            }
          }}
          onSubmit={attempt}
          state={otpState}
          variant="card"
          ariaLabelledBy="reset-otp-label"
        />
        <span id="reset-otp-label" className="sr-only">
          Enter the 6-digit code
        </span>

        {helper && (
          <p
            role={
              otpState === "error" ||
              otpState === "invalidated" ||
              otpState === "expired"
                ? "alert"
                : "status"
            }
            className={
              otpState === "error" ||
              otpState === "invalidated" ||
              otpState === "expired"
                ? "text-center font-sans text-[12px] text-negative"
                : "text-center font-sans text-[12px] text-text-muted"
            }
          >
            {helper}
          </p>
        )}

        <div className="flex items-center justify-center gap-2 font-sans text-[13px] text-text-secondary">
          Didn't receive it?
          {resendIn > 0 ? (
            <span className="inline-flex h-8 items-center rounded-lg bg-accent-soft px-3 font-semibold text-accent">
              Resend in {formatCountdown(resendIn)}
            </span>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              className="inline-flex h-8 items-center rounded-lg bg-accent-soft px-3 font-semibold text-accent transition-colors duration-150 ease-out hover:bg-accent hover:text-accent-foreground"
            >
              Send a new code
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate(withDemo("/forgot-password"))}
            className="flex h-12 items-center gap-2 rounded-[10px] bg-surface-raised pl-4 pr-5 font-sans text-[14px] font-semibold text-text-secondary transition-all duration-150 ease-out hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-card"
          >
            <ArrowLeft className="size-4" strokeWidth={2.2} aria-hidden />
            Back
          </button>
          <button
            type="button"
            disabled={code.length !== 6 || lockedForNewCode || otpState === "submitting"}
            onClick={() => attempt(code)}
            className="flex h-12 items-center gap-2 rounded-[10px] bg-accent pl-6 pr-5 font-sans text-[14px] font-bold text-accent-foreground transition-all duration-150 ease-out hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-card disabled:cursor-not-allowed disabled:opacity-60"
          >
            {otpState === "submitting" ? "Verifying…" : "Continue"}
            {otpState !== "submitting" && (
              <ArrowRight className="size-4" strokeWidth={2.4} aria-hidden />
            )}
          </button>
        </div>
      </div>
    </ResetPasswordLayout>
  );
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function parseAttemptsLeft(err: ApiError): number | null {
  const code = err.errorCode ?? "";
  const match =
    code.match(/(\d+)/) ?? err.message.match(/(\d+)\s*(?:left|remaining)/i);
  return match ? Number(match[1]) : null;
}
