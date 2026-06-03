import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api";
import {
  AuthBrandPanel,
  AuthBrandStrip,
} from "@/features/auth/components/AuthBrandPanel";
import {
  ChannelCard,
  type OtpChannel,
} from "@/features/auth/components/ChannelCard";
import { initiateLoginOtp } from "@/features/auth/api";
import { DEMO_PROFILE, isDemoMode, withDemo } from "@/lib/demoMode";

interface RawTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  token_type: "Bearer";
}

interface ChannelState {
  tokens: RawTokens;
  userId: string;
  /** What the user typed on the credentials screen (CIN or username). */
  identifier: string;
  maskedEmail: string | null;
  maskedPhone: string | null;
  /** Original deep-link the user was bouncing to before /login. */
  from?: string;
}

/**
 * Step 2 of 2 of the login flow. After ROPC mints a JWT, the user lands
 * here to pick where the OTP gets dispatched. On submit we POST
 * {@code /auth/login/initiate-otp} with the chosen channel and hand off
 * to {@code /login/verify} carrying the masked destination so the
 * caption ("We sent a 6-digit code to …") can render without re-fetching.
 *
 * Layout matches {@code LoginPage.tsx} / {@code LoginVerifyOtpPage.tsx}
 * — same {@code <AuthBrandStrip />} + {@code <AuthBrandPanel />} +
 * {@code <main>} shell, no stepper (login is one continuous flow).
 */
export function LoginChooseChannelPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const demo = isDemoMode();

  // Demo lets us preview the page directly via /login/channel?demo with a
  // synthetic state — production paths must come through <LoginForm />.
  const state =
    (location.state as ChannelState | null) ??
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
          identifier: DEMO_PROFILE.cin,
          maskedEmail: DEMO_PROFILE.email,
          maskedPhone: DEMO_PROFILE.phone,
        } satisfies ChannelState)
      : null);

  if (!state) {
    return <Navigate to="/login" replace />;
  }

  const [channel, setChannel] = useState<OtpChannel>("EMAIL");
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    if (busy) return;
    setBusy(true);
    try {
      if (!demo) {
        await initiateLoginOtp({
          accessToken: state!.tokens.access_token,
          channel,
        });
      }
      navigate(withDemo("/login/verify"), {
        state: {
          tokens: state!.tokens,
          userId: state!.userId,
          identifier: state!.identifier,
          channel,
          maskedDestination:
            channel === "EMAIL" ? state!.maskedEmail : state!.maskedPhone,
          from: state!.from,
        },
        replace: true,
      });
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 429
          ? "Too many requests — give it a minute and try again."
          : err instanceof ApiError && err.message
            ? err.message
            : "Couldn't send the code. Try again.";
      toast.showToast({ tier: "danger", message: msg });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-surface-soft md:flex-row">
      <AuthBrandStrip />
      <AuthBrandPanel />

      <main className="flex h-full min-h-0 flex-1 items-center justify-center overflow-y-auto bg-surface-soft p-6 sm:p-10 lg:p-20">
        <div className="w-full max-w-[440px]">
          <div className="flex w-full flex-col gap-5 lg:gap-7">
            <header className="flex flex-col gap-2">
              <p className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-accent">
                Step 2 of 2
              </p>
              <h1 className="font-sans text-[clamp(24px,3vw,32px)] font-bold leading-tight tracking-tight text-text-primary">
                One last check
              </h1>
              <p className="font-sans text-[14px] leading-[1.6] text-text-secondary">
                Pick where to send your sign-in code. We'll deliver it the
                moment you tap the button.
              </p>
            </header>

            <div
              role="radiogroup"
              aria-label="Delivery channel"
              className="flex w-full gap-3"
            >
              <ChannelCard
                channel="EMAIL"
                maskedValue={state.maskedEmail ?? "—"}
                selected={channel === "EMAIL"}
                onSelect={setChannel}
                disabled={busy || !state.maskedEmail}
              />
              <ChannelCard
                channel="SMS"
                maskedValue={state.maskedPhone ?? "—"}
                selected={channel === "SMS"}
                onSelect={setChannel}
                disabled={busy || !state.maskedPhone}
              />
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
                busy={busy}
                onClick={onSubmit}
                trailingIcon={
                  <ArrowRight className="size-4" strokeWidth={2.2} aria-hidden />
                }
              >
                {busy ? "Sending…" : "Send sign-in code"}
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
