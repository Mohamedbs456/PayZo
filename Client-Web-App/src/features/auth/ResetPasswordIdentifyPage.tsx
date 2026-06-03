import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api";
import { ResetPasswordLayout } from "@/features/auth/components/ResetPasswordLayout";
import {
  forgotPasswordStart,
  resolveClientIdentifier,
} from "@/features/auth/api";
import {
  DEMO_PROFILE,
  DEMO_RESET_DESTINATION,
  isDemoMode,
  withDemo,
} from "@/lib/demoMode";

/**
 * Step 1 of forgot-password (Figma 277:2). User enters their CIN or
 * PayZo username; we resolve to the canonical CIN and call
 * `forgotPasswordStart`. Backend always responds 200 (anti-enumeration)
 * — the masked destination it returns drives the next-page caption.
 */
export function ResetPasswordIdentifyPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const demo = isDemoMode();

  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;

    const trimmed = identifier.trim();
    if (!trimmed) {
      setError("Enter your CIN or username.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      let cin = trimmed;
      let maskedDestination = DEMO_RESET_DESTINATION;

      if (!demo) {
        // If they typed a username, map it back to the CIN. resolveClientIdentifier
        // already handles plain CIN passthrough (8-digit numeric) gracefully.
        if (!/^\d{8}$/.test(trimmed)) {
          const resolved = await resolveClientIdentifier(trimmed);
          cin = resolved.keycloakUsername;
        }
        const start = await forgotPasswordStart(cin);
        maskedDestination = start.maskedDestination;
      } else {
        cin = DEMO_PROFILE.cin;
      }

      navigate(withDemo("/forgot-password/verify"), {
        state: { cin, maskedDestination },
      });
    } catch (err) {
      // The BE is supposed to always-200 on /start — but resolve can 404
      // when the username doesn't exist, and we treat that the same as
      // an unknown CIN to avoid leaking enumeration data: the user gets
      // bounced to the verify page with a generic destination, the OTP
      // never arrives, and they figure it out from there.
      if (err instanceof ApiError && err.status === 404) {
        navigate(withDemo("/forgot-password/verify"), {
          state: { cin: trimmed, maskedDestination: "your registered email" },
        });
        return;
      }
      toast.showToast({
        tier: "danger",
        message:
          err instanceof ApiError && err.message
            ? err.message
            : "Couldn't reach PayZo. Try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResetPasswordLayout current={1}>
      <form onSubmit={onSubmit} className="flex w-full flex-col gap-7" noValidate>
        <div className="flex flex-col gap-2">
          <h1 className="font-sans text-[clamp(22px,2.4vw,26px)] font-bold leading-tight tracking-tight text-text-primary">
            Reset your password
          </h1>
          <p className="font-sans text-[14px] leading-[1.5] text-text-secondary">
            Enter your CIN or username and we'll send you a one-time code to
            verify it's really you.
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          <label
            htmlFor="reset-identifier"
            className="font-sans text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted"
          >
            CIN or username
          </label>
          <input
            id="reset-identifier"
            type="text"
            inputMode="text"
            autoComplete="username"
            spellCheck={false}
            autoCapitalize="off"
            autoFocus
            value={identifier}
            onChange={(e) => {
              setIdentifier(e.target.value);
              if (error) setError(null);
            }}
            disabled={busy}
            aria-invalid={error ? "true" : undefined}
            placeholder="08891234"
            className="h-14 w-full rounded-xl border-2 border-accent bg-accent-soft px-4 font-mono text-[16px] tracking-[0.04em] text-text-primary outline-none placeholder:text-text-muted focus:border-accent disabled:opacity-60"
          />
          <p className="font-sans text-[12px] text-text-muted">
            Either your 8-digit CIN or your PayZo username works.
          </p>
        </div>

        {error && (
          <p role="alert" className="font-sans text-[13px] text-negative">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 font-sans text-[15px] font-bold text-accent-foreground transition-all duration-150 ease-out hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-card disabled:cursor-not-allowed disabled:opacity-60"
          style={{ height: 52 }}
        >
          {busy ? "Sending…" : "Send code"}
          {!busy && <ArrowRight className="size-4" strokeWidth={2.4} aria-hidden />}
        </button>

        <p className="flex items-center justify-center gap-1.5 font-sans text-[13px] text-text-secondary">
          Remember it now?
          <Link
            to={withDemo("/login")}
            className="font-semibold text-accent underline underline-offset-2 transition-colors duration-150 ease-out hover:text-text-primary"
          >
            Back to sign in
          </Link>
        </p>
      </form>
    </ResetPasswordLayout>
  );
}
