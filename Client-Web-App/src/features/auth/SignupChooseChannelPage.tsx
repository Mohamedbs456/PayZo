import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api";
import { SignupLayout } from "@/features/auth/components/SignupLayout";
import {
  ChannelCard,
  type OtpChannel,
} from "@/features/auth/components/ChannelCard";
import { sendRegistrationOtp } from "@/features/auth/api";
import { DEMO_PROFILE, isDemoMode, withDemo } from "@/lib/demoMode";

interface ChannelState {
  cin: string;
  maskedEmail: string;
  maskedPhone: string;
}

/**
 * Step 2a (Figma 77:66). User picks a delivery channel for the
 * verification code. On submit we POST /auth/register/send-otp with the
 * selected channel and hand off to the OTP-entry screen, carrying the
 * destination forward via router state so the caption ("We sent a 6-
 * digit code to …") can render from the masked value the BE already
 * gave us in the previous step.
 */
export function SignupChooseChannelPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const demo = isDemoMode();
  // In demo mode we accept missing router state — fall back to the mock
  // profile so the page is reachable directly via /signup/channel?demo.
  const state =
    (location.state as ChannelState | null) ??
    (demo
      ? {
          cin: DEMO_PROFILE.cin,
          maskedEmail: DEMO_PROFILE.email,
          maskedPhone: DEMO_PROFILE.phone,
        }
      : null);

  // Bounce out if the user landed here directly without a CIN.
  if (!state?.cin) {
    return <Navigate to="/signup" replace />;
  }

  const [channel, setChannel] = useState<OtpChannel>("EMAIL");
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    if (busy) return;
    setBusy(true);
    try {
      if (!demo) {
        await sendRegistrationOtp({ cin: state!.cin, channel });
      }
      navigate(withDemo("/signup/verify"), {
        state: {
          cin: state!.cin,
          channel,
          maskedDestination:
            channel === "EMAIL" ? state!.maskedEmail : state!.maskedPhone,
        },
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
    <SignupLayout current={2}>
      <div className="flex w-full flex-col gap-6">
        <p className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-accent">
          Step 2 of 3
        </p>
        <h1 className="font-sans text-[clamp(22px,2.6vw,28px)] font-bold leading-tight tracking-tight text-text-primary">
          Verify it's you
        </h1>
        <p className="font-sans text-[14px] leading-[1.6] text-text-secondary">
          Pick how you'd like to receive your verification code. We'll send
          it now.
        </p>

        <div role="radiogroup" aria-label="Delivery channel" className="flex w-full gap-3">
          <ChannelCard
            channel="EMAIL"
            maskedValue={state.maskedEmail}
            selected={channel === "EMAIL"}
            onSelect={setChannel}
            disabled={busy}
          />
          <ChannelCard
            channel="SMS"
            maskedValue={state.maskedPhone}
            selected={channel === "SMS"}
            onSelect={setChannel}
            disabled={busy}
          />
        </div>

        <Button
          type="button"
          variant="primary"
          size="lg"
          busy={busy}
          onClick={onSubmit}
          trailingIcon={
            <ArrowRight className="size-4" strokeWidth={2.2} aria-hidden />
          }
          className="w-fit self-center"
        >
          {busy ? "Sending…" : "Send verification code"}
        </Button>
      </div>
    </SignupLayout>
  );
}
