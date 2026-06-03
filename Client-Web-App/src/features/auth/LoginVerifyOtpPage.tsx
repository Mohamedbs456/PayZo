import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { OtpInput, type OtpState } from "@/components/ui/OtpInput";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api";
import {
  AuthBrandPanel,
  AuthBrandStrip,
} from "@/features/auth/components/AuthBrandPanel";
import type { OtpChannel } from "@/features/auth/components/ChannelCard";
import { bundleFromRaw, session } from "@/lib/auth/session";
import {
  initiateLoginOtp,
  verifyLoginOtp,
} from "@/features/auth/api";
import { isDemoMode, withDemo } from "@/lib/demoMode";

interface RawTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  token_type: "Bearer";
}

interface VerifyState {
  tokens: RawTokens;
  userId: string;
  /** What the user typed on the credentials screen (CIN or username). */
  identifier: string;
  /** Channel picked on /login/channel — drives the resend dispatch. */
  channel: OtpChannel;
  /** Already-masked destination — the only thing the caption ever shows. */
  maskedDestination: string | null;
  /** Original target the user was bouncing to before /login. */
  from?: string;
}

const OTP_TTL_SECONDS = 5 * 60;
const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Step 2 of the login flow — paired with `<LoginForm />` on `/login`.
 *
 * Visual + structural parity with the credentials screen (Figma 74:5):
 *   - Same `<AuthBrandPanel />` (big shield + tagline + headline)
 *   - Same `<AuthBrandStrip />` below md
 *   - Same `h-dvh + overflow-hidden` shell, same form gap rhythm
 *   - No stepper, no eyebrow — login is one continuous flow
 *
 * The credentials screen handed us the unconfirmed token bundle via
 * router state. Once the OTP verifies, we commit the bundle to
 * sessionStorage and bounce to /dashboard (or wherever the user was
 * heading before they hit /login).
 */
export function LoginVerifyOtpPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const demo = isDemoMode();

  // Demo lets us preview the page directly via /login/verify?demo with a
  // synthetic state — production paths must come through the
  // /login/channel picker so the masked destination is already chosen.
  const state =
    (location.state as VerifyState | null) ??
    (demo
      ? ({
          tokens: {
            access_token: "demo",
            refresh_token: "demo",
            expires_in: 900,
            refresh_expires_in: 86400,
            token_type: "Bearer",
          },
          userId: "00000000-0000-0000-0000-000000000000",
          identifier: "08891234",
          channel: "EMAIL",
          maskedDestination: "ahmed.benali@***.tn",
        } satisfies VerifyState)
      : null);

  if (!state) {
    return <Navigate to="/login" replace />;
  }

  const maskedDestination = state.maskedDestination ?? state.identifier;

  const [code, setCode] = useState("");
  const [otpState, setOtpState] = useState<OtpState>("idle");
  const [helper, setHelper] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(OTP_TTL_SECONDS);
  const [resendIn, setResendIn] = useState(RESEND_COOLDOWN_SECONDS);
  const submittedFor = useRef<string | null>(null);

  // Single 1Hz tick driving both countdowns.
  useEffect(() => {
    const handle = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
      setResendIn((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(handle);
  }, []);

  // TTL hit → lock + surface the resend affordance.
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
      if (!demo) {
        await verifyLoginOtp(
          { userId: state!.userId, otpCode: value },
          state!.tokens.access_token,
        );
        // OTP confirmed → commit the (until-now unconfirmed) token bundle
        // to sessionStorage so subsequent API calls auto-attach the bearer.
        session.put(bundleFromRaw(state!.tokens));
      }

      setOtpState("verified");
      setTimeout(() => {
        const target = demo ? "/login" : (state!.from ?? "/dashboard");
        navigate(target, { replace: true });
        if (demo) {
          toast.showToast({
            tier: "info",
            message: "Demo mode — no real session was created.",
          });
        }
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
        await initiateLoginOtp({
          accessToken: state!.tokens.access_token,
          channel: state!.channel,
        });
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
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-surface-soft md:flex-row">
      <AuthBrandStrip />
      <AuthBrandPanel />

      <main className="flex h-full min-h-0 flex-1 items-center justify-center overflow-y-auto bg-surface-soft p-6 sm:p-10 lg:p-20">
        <div className="w-full max-w-[440px]">
          <div className="flex w-full flex-col gap-5 lg:gap-7">
            <header className="flex flex-col gap-2">
              <h1 className="font-sans text-[clamp(24px,3vw,32px)] font-bold leading-tight tracking-tight text-text-primary">
                Verify it's you
              </h1>
              <p className="font-sans text-[14px] leading-[1.6] text-text-secondary">
                We sent a 6-digit code to{" "}
                <span className="font-medium text-text-primary">
                  {maskedDestination}
                </span>
                . It expires in {formatCountdown(secondsLeft)}.
              </p>
            </header>

            <div className="flex flex-col gap-3">
              <p
                id="login-otp-label"
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
                ariaLabelledBy="login-otp-label"
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
                onClick={() => navigate(withDemo("/login"), { replace: true })}
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
                {otpState === "submitting" ? "Verifying…" : "Verify and continue"}
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ─── Helpers ──────────────────────────────────────────────────────────── */

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
