import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SignupLayout } from "@/features/auth/components/SignupLayout";
import { WhatHappensNextCard } from "@/features/auth/components/WhatHappensNextCard";
import { DEMO_PROFILE, isDemoMode } from "@/lib/demoMode";

interface SubmittedState {
  cin: string;
  /** Already-masked email — passed through from the channel-picker step. */
  maskedDestination: string;
}

/**
 * Step 3 (Figma 77:126). Confirmation screen — the registration is
 * PENDING_APPROVAL. We tell the user what happens next and route them
 * back to /login. There's no FE-driven status polling here; the user
 * will be notified by the BE (email) when an admin approves.
 */
export function SignupSubmittedPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state =
    (location.state as SubmittedState | null) ??
    (isDemoMode()
      ? { cin: DEMO_PROFILE.cin, maskedDestination: DEMO_PROFILE.email }
      : null);

  if (!state?.cin) {
    return <Navigate to="/signup" replace />;
  }

  return (
    <SignupLayout current={3}>
      <div className="flex w-full flex-col items-center gap-6 text-center">
        <div className="flex size-24 items-center justify-center rounded-3xl bg-positive-soft">
          <Check className="size-12 text-positive" strokeWidth={2.4} aria-hidden />
        </div>

        <h1 className="font-sans text-[clamp(24px,3vw,32px)] font-bold leading-tight tracking-tight text-text-primary">
          You're all set
        </h1>
        <p className="font-sans text-[14px] text-text-secondary">
          Your registration has been submitted for review.
        </p>

        <WhatHappensNextCard
          steps={[
            {
              title: "An admin reviews your application",
              body: "Usually within 24 hours.",
            },
            {
              title: "You'll receive your credentials by email",
              body: (
                <>
                  We'll send your username and a temporary password to{" "}
                  <span className="font-medium text-text-primary">
                    {state.maskedDestination}
                  </span>
                  .
                </>
              ),
            },
            {
              title: "Log in and change your password",
              body: "On first login you'll be asked to set your own password.",
            },
          ]}
        />

        <Button
          type="button"
          variant="primary"
          size="lg"
          onClick={() => navigate("/login", { replace: true })}
          trailingIcon={
            <ArrowRight className="size-4" strokeWidth={2.2} aria-hidden />
          }
        >
          Go to login
        </Button>
      </div>
    </SignupLayout>
  );
}
