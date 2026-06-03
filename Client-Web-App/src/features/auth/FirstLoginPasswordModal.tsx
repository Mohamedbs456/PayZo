import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/api";
import { PayZoWordmark } from "@/components/ui/PayZoWordmark";
import { PasswordField } from "@/components/ui/PasswordField";
import { evaluatePassword, isPasswordValid } from "@/features/me/passwordPolicy";
import { useToast } from "@/components/ui/Toast";
import { isDemoMode } from "@/lib/demoMode";
import { completeFirstLogin } from "@/features/auth/api";

interface FirstLoginPasswordModalProps {
  /** First name from /client/profile — appears in the welcome line. */
  firstName: string;
  /** Called after the BE confirms the rotation. The dashboard uses it
   *  to optimistically flip `me.firstLoginCompleted` so the modal
   *  unmounts immediately. */
  onSuccess: () => void;
}

/**
 * Forced password rotation on first login (Figma 77:179, DECISIONS.md
 * D45). Mounted by `<DashboardPage />` whenever `me.firstLoginCompleted`
 * is `false`.
 *
 * Per the spec, this is **un-dismissable**:
 *   - no X / no cancel button
 *   - clicking the scrim does nothing
 *   - Escape does nothing
 *   - tab focus is trapped inside the modal
 *
 * The dashboard underneath is rendered normally and gets a
 * `backdrop-blur` from the scrim layer, so the user sees they're
 * inside the app — they just can't use it until they rotate.
 */
export function FirstLoginPasswordModal({
  firstName,
  onSuccess,
}: FirstLoginPasswordModalProps) {
  const toast = useToast();
  const demo = isDemoMode();

  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const policyOk = isPasswordValid(pw);
  const matches = pw.length > 0 && pw === confirm;
  const canSubmit = policyOk && matches && !busy;

  // Lock body scrolling under the scrim; we never want background
  // gestures to do anything while the gate is up.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) {
      if (!matches) setConfirmError("Passwords don't match.");
      return;
    }
    setBusy(true);
    setConfirmError(null);
    setServerError(null);
    try {
      if (!demo) {
        await completeFirstLogin({ newPassword: pw });
      }
      toast.showToast({
        tier: "success",
        message: "Password set. Welcome to PayZo.",
      });
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 422) {
          setServerError(err.message ?? "That password isn't allowed.");
        } else if (err.status === 401 || err.status === 403) {
          setServerError(
            "Your session expired before we could finish. Refresh and sign back in.",
          );
        } else {
          setServerError(err.message ?? "Couldn't save your password. Try again.");
        }
      } else {
        setServerError("Couldn't reach PayZo. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-login-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/60 px-4 backdrop-blur-md"
    >
      <div
        className={cn(
          "flex w-full max-w-[480px] flex-col gap-5 overflow-hidden rounded-3xl border border-border-soft bg-surface-raised p-6 shadow-[0px_32px_80px_0px_rgba(0,0,0,0.35)] sm:p-10",
        )}
        // Capture pointer events so any hypothetical click-outside
        // wouldn't propagate through the modal card.
        onMouseDown={(e) => e.stopPropagation()}
      >
        <PayZoWordmark className="h-[46px] w-auto text-accent" />

        <h1
          id="first-login-title"
          className="font-sans text-[clamp(22px,2.4vw,26px)] font-bold leading-tight tracking-tight text-text-primary"
        >
          Set your password
        </h1>
        <p className="font-sans text-[13px] leading-[1.55] text-text-secondary">
          Welcome to PayZo, <span className="font-medium text-text-primary">{firstName}</span>.
          Set a password to secure your account before you continue.
        </p>

        <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
          <PasswordField
            label="New password"
            placeholder="Enter a strong password"
            autoComplete="new-password"
            autoFocus
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            disabled={busy}
          />

          <PasswordField
            label="Confirm password"
            placeholder="Re-enter to confirm"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              if (confirmError) setConfirmError(null);
            }}
            disabled={busy}
            error={confirmError}
          />

          <RequirementsPanel value={pw} />

          {serverError && (
            <p
              role="alert"
              className="font-sans text-[12px] text-negative"
            >
              {serverError}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 font-sans text-[14px] font-semibold text-accent-foreground transition-all duration-150 ease-out hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Setting password…" : "Confirm and continue"}
            {!busy && (
              <ArrowRight className="size-4" strokeWidth={2.4} aria-hidden />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ─── Inline requirements panel ───────────────────────────────────────── */

/**
 * Sunken-bg dot list (Figma 77:203). Different visual from the forgot-
 * password `<PasswordRequirementsList />` (which uses positive-soft
 * checks); here the rules render as solid colored dots — green when
 * satisfied, muted when pending. Inlined because it's the only place
 * that uses this variant.
 */
function RequirementsPanel({ value }: { value: string }) {
  const checks = evaluatePassword(value);
  return (
    <div className="flex flex-col gap-2 rounded-[10px] bg-accent-soft px-4 py-3.5">
      <p className="font-sans text-[10px] font-medium uppercase tracking-[0.08em] text-text-muted">
        Password must include
      </p>
      {checks.map((c) => (
        <div key={c.id} className="flex items-center gap-2.5">
          <span
            aria-hidden
            className={cn(
              "size-2.5 shrink-0 rounded-full transition-colors duration-150 ease-out",
              c.passed ? "bg-positive" : "bg-text-muted/30",
            )}
          />
          <span
            className={cn(
              "font-sans text-[12px]",
              c.passed ? "text-text-primary" : "text-text-muted",
            )}
          >
            {c.label}
          </span>
        </div>
      ))}
    </div>
  );
}
