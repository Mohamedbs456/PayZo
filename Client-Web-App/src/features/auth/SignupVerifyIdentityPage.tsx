import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { InfoCallout } from "@/components/ui/InfoCallout";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api";
import { SignupLayout } from "@/features/auth/components/SignupLayout";
import {
  VerifiedProfileCard,
  type VerifiedProfile,
} from "@/features/auth/components/VerifiedProfileCard";
import {
  previewRegistration,
  type RegistrationPreviewResponse,
} from "@/features/auth/api";
import { DEMO_PROFILE, isDemoMode, withDemo } from "@/lib/demoMode";

/**
 * Step 1 of 3 (Figma 77:4). User enters their 8-digit CIN; on blur (or
 * when the field is full) we resolve it against the CBS via
 * `previewRegistration` and render the read-only profile preview. Once
 * the profile is on screen, "Confirm and continue" hands the CIN to the
 * channel-picker step.
 */
export function SignupVerifyIdentityPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [cin, setCin] = useState("");
  const [profile, setProfile] = useState<VerifiedProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [cinError, setCinError] = useState<string | null>(null);

  function asProfile(p: RegistrationPreviewResponse): VerifiedProfile {
    return {
      firstName: p.firstName,
      lastName: p.lastName,
      cin: p.cin,
      email: p.email,
      phone: p.phone,
      governorate: p.governorate,
    };
  }

  async function tryPreview(value: string) {
    if (busy) return;
    if (value.length !== 8 || !/^\d{8}$/.test(value)) {
      setProfile(null);
      return;
    }
    // Demo mode short-circuits the BE call so the flow is walkable
    // even when the partner endpoints / CBS aren't seeded yet.
    if (isDemoMode()) {
      setProfile(asProfile({ ...DEMO_PROFILE, cin: value }));
      return;
    }
    setBusy(true);
    setCinError(null);
    try {
      const data = await previewRegistration(value);
      setProfile(asProfile(data));
    } catch (err) {
      setProfile(null);
      if (err instanceof ApiError) {
        if (err.status === 404) {
          setCinError(
            "We couldn't find this CIN in the central banking system.",
          );
        } else if (err.status === 409) {
          setCinError("This CIN already has a PayZo account.");
        } else if (err.status === 501 || err.status === 404) {
          // Endpoint not yet implemented on the BE — surface a soft
          // message rather than a generic error toast.
          setCinError(
            "Sign-up isn't quite ready yet. Please check back shortly.",
          );
        } else {
          toast.showToast({
            tier: "danger",
            message: err.message ?? "Something went wrong. Try again.",
          });
        }
      } else {
        toast.showToast({
          tier: "danger",
          message: "Couldn't reach PayZo. Try again.",
        });
      }
    } finally {
      setBusy(false);
    }
  }

  function handleCinChange(next: string) {
    const sanitized = next.replace(/\D/g, "").slice(0, 8);
    setCin(sanitized);
    setCinError(null);
    if (sanitized.length === 8) {
      void tryPreview(sanitized);
    } else if (profile) {
      setProfile(null);
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!profile) {
      void tryPreview(cin);
      return;
    }
    navigate(withDemo("/signup/channel"), {
      state: {
        cin: profile.cin,
        maskedEmail: profile.email,
        maskedPhone: profile.phone,
      },
    });
  }

  return (
    <SignupLayout current={1}>
      <form onSubmit={onSubmit} className="flex w-full flex-col gap-5 lg:gap-6" noValidate>
        <p className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-accent">
          Step 1 of 3
        </p>
        <h1 className="font-sans text-[clamp(22px,2.6vw,28px)] font-bold leading-tight tracking-tight text-text-primary">
          Verify your identity
        </h1>
        <p className="font-sans text-[14px] text-text-secondary">
          Enter your CIN to confirm we have your details correctly.
        </p>

        <TextField
          label="CIN · 8 digits"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          autoFocus
          monospace
          placeholder="08891234"
          maxLength={8}
          value={cin}
          onChange={(e) => handleCinChange(e.target.value)}
          disabled={busy}
          error={cinError}
          rightSlot={
            profile ? (
              <Check
                className="size-4 text-positive"
                strokeWidth={2.4}
                aria-hidden
              />
            ) : null
          }
        />

        {profile && <VerifiedProfileCard profile={profile} />}

        {profile && (
          <InfoCallout>
            If anything looks wrong, contact your bank to update your records.
          </InfoCallout>
        )}

        <div className="flex flex-col gap-3">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={!profile || busy}
            busy={busy}
            trailingIcon={
              <ArrowRight className="size-4" strokeWidth={2.2} aria-hidden />
            }
          >
            {busy ? "Checking…" : "Confirm and continue"}
          </Button>
          <Link
            to="/login"
            className="text-center font-sans text-[12px] text-text-secondary transition-colors duration-150 ease-out hover:text-text-primary"
          >
            Already have an account? Sign in
          </Link>
        </div>
      </form>
    </SignupLayout>
  );
}
