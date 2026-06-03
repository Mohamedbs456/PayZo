import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { OtpInput, type OtpState } from "@/components/ui/OtpInput";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api";
import { SignupLayout } from "@/features/auth/components/SignupLayout";
import {
  sendRegistrationOtp,
  submitRegistration,
  type RegistrationChannel,
} from "@/features/auth/api";
import { DEMO_PROFILE, isDemoMode, withDemo } from "@/lib/demoMode";

interface VerifyState {
  cin: string;
  channel: RegistrationChannel;
  maskedDestination: string;
}

const OTP_TTL_SECONDS = 5 * 60;
const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Step 2b (Figma 94:5). 6-digit OTP entry. The previous screen has
 * already triggered `sendRegistrationOtp`, so we mount with the timer
 * already counting down. On submit (auto-fired when the 6th digit is
 * typed) we POST /auth/register/step2 with the CIN + code; on success
 * we hand off to the "submitted" screen.
 */
export function SignupVerifyOtpPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const demo = isDemoMode();
  const state =
    (location.state as VerifyState | null) ??
    (demo
      ? {
          cin: DEMO_PROFILE.cin,
          channel: "EMAIL" as RegistrationChannel,
          maskedDestination: DEMO_PROFILE.email,
        }
      : null);

  if (!state?.cin || !state.channel) {
    return <Navigate to="/signup" replace />;
  }

  const [code, setCode] = useState("");
  const [otpState, setOtpState] = useState<OtpState>("idle");
  const [helper, setHelper] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(OTP_TTL_SECONDS);
  const [resendIn, setResendIn] = useState(RESEND_COOLDOWN_SECONDS);
  const submittedFor = useRef<string | null>(null);

  // Single 1Hz tick drives both the TTL countdown and the resend cooldown.
  useEffect(() => {
    const handle = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
      setResendIn((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(handle);
  }, []);

  // TTL hit → lock the input and surface the resend affordance.
  useEffect(() => {
    if (secondsLeft === 0 && otpState !== "expired") {
      setOtpState("expired");
      setHelper("Code expired. Request a new one to continue.");
    }
  }, [secondsLeft, otpState]);

  async function attempt(value: string) {
    if (otpState === "submitting" || otpState === "verified") return;
    if (submittedFor.current === value) return; // de-dupe
    submittedFor.current = value;
    setOtpState("submitting");
    setHelper(null);
    try {
      if (!demo) {
        await submitRegistration({ cin: state!.cin, otpCode: value });
      }
      setOtpState("verified");
      // Brief positive flash, then forward to the submitted screen.
      setTimeout(() => {
        navigate(withDemo("/signup/submitted"), {
          state: {
            cin: state!.cin,
            maskedDestination: state!.maskedDestination,
          },
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
          // Backend may include `attemptsLeft` in errorCode/message; fall
          // back to a generic message if not. Three strikes invalidates.
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
        await sendRegistrationOtp({ cin: state!.cin, channel: state!.channel });
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
    <SignupLayout current={2}>
      <div className="flex w-full flex-col gap-5 lg:gap-6">
        <p className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-accent">
          Step 2 of 3
        </p>
        <h1 className="font-sans text-[clamp(22px,2.6vw,28px)] font-bold leading-tight tracking-tight text-text-primary">
          Enter verification code
        </h1>
        <p className="font-sans text-[14px] leading-[1.6] text-text-secondary">
          We sent a 6-digit code to{" "}
          <span className="font-medium text-text-primary">
            {state.maskedDestination}
          </span>
          . It expires in {formatCountdown(secondsLeft)}.
        </p>

        <div className="flex flex-col gap-3">
          <p
            id="otp-label"
            className="font-sans text-[11px] font-medium uppercase tracking-[0.06em] text-text-secondary"
          >
            Enter 6-digit code
          </p>
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
            ariaLabelledBy="otp-label"
          />
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
                  ? "font-sans text-[12px] text-negative"
                  : "font-sans text-[12px] text-text-muted"
              }
            >
              {helper}
            </p>
          )}
          <p className="font-sans text-[12px] text-text-muted">
            Didn't receive a code?{" "}
            {resendIn > 0 ? (
              <span>Resend in {formatCountdown(resendIn)}</span>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                className="font-semibold text-accent transition-colors duration-150 ease-out hover:text-text-primary"
              >
                Send a new code
              </button>
            )}
          </p>
        </div>

        <div className="flex w-full gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-12 items-center gap-2 rounded-xl border border-border-strong bg-surface-card px-5 font-sans text-[14px] font-semibold text-text-primary transition-all duration-150 ease-out hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-soft"
          >
            <ArrowLeft className="size-4" strokeWidth={2.2} aria-hidden />
            Back
          </button>
          <Button
            type="button"
            variant="primary"
            size="lg"
            disabled={code.length !== 6 || lockedForNewCode}
            busy={otpState === "submitting"}
            onClick={() => attempt(code)}
            trailingIcon={
              <ArrowRight className="size-4" strokeWidth={2.2} aria-hidden />
            }
          >
            {otpState === "submitting" ? "Verifying…" : "Verify and submit"}
          </Button>
        </div>
      </div>
    </SignupLayout>
  );
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function parseAttemptsLeft(err: ApiError): number | null {
  // Backend convention TBD; we accept both an `attemptsLeft` errorCode and
  // a numeric tail in the message. Anything else returns null and the page
  // surfaces the generic-error helper text.
  const code = err.errorCode ?? "";
  const match = code.match(/(\d+)/) ?? err.message.match(/(\d+)\s*(?:left|remaining)/i);
  return match ? Number(match[1]) : null;
}
