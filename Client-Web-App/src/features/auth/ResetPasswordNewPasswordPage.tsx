import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, Lock } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api";
import { PasswordRequirementsList } from "@/components/ui/PasswordRequirementsList";
import { ResetPasswordLayout } from "@/features/auth/components/ResetPasswordLayout";
import { forgotPasswordReset } from "@/features/auth/api";
import { isPasswordValid } from "@/features/me/passwordPolicy";
import { DEMO_RESET_TOKEN, isDemoMode, withDemo } from "@/lib/demoMode";

interface ResetState {
  resetToken: string;
}

/**
 * Step 3 of forgot-password (Figma 277:102). Two password fields with
 * eye-toggles, the live `PasswordRequirementsList` between them, and a
 * Back / "Reset password" footer. Submit is gated on (a) the new
 * password matching the policy and (b) confirm matching new.
 */
export function ResetPasswordNewPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const demo = isDemoMode();

  const state =
    (location.state as ResetState | null) ??
    (demo ? { resetToken: DEMO_RESET_TOKEN } : null);

  if (!state?.resetToken) {
    return <Navigate to={withDemo("/forgot-password")} replace />;
  }

  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const policyOk = isPasswordValid(pw);
  const matches = pw.length > 0 && pw === confirm;
  const canSubmit = policyOk && matches && !busy;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) {
      if (!policyOk) {
        // The policy list itself is the error surface — no top-level message.
        return;
      }
      if (!matches) {
        setConfirmError("Passwords don't match.");
        return;
      }
    }
    setBusy(true);
    setConfirmError(null);
    setServerError(null);
    try {
      if (!demo) {
        await forgotPasswordReset(state!.resetToken, pw);
      }
      toast.showToast({
        tier: "success",
        message: "Password reset. Sign in with your new password.",
      });
      navigate("/login", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 410 || err.status === 401) {
          setServerError(
            "Your reset link expired. Start over from forgot password.",
          );
        } else if (err.status === 422) {
          setServerError(err.message ?? "That password isn't allowed.");
        } else {
          setServerError(err.message ?? "Couldn't reset your password. Try again.");
        }
      } else {
        setServerError("Couldn't reach PayZo. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResetPasswordLayout current={3}>
      <form onSubmit={onSubmit} className="flex w-full flex-col gap-6" noValidate>
        <div className="flex flex-col gap-2">
          <h1 className="font-sans text-[clamp(22px,2.4vw,26px)] font-bold leading-tight tracking-tight text-text-primary">
            Set a new password
          </h1>
          <p className="font-sans text-[14px] leading-[1.5] text-text-secondary">
            Choose a new password to sign back in. We'll sign you out of all
            other devices for safety.
          </p>
        </div>

        {/* New password */}
        <div className="flex flex-col gap-2">
          <label
            htmlFor="reset-new-pw"
            className="font-sans text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted"
          >
            New password
          </label>
          <div className="flex h-13 items-center gap-2 rounded-[10px] border-2 border-accent bg-accent-soft px-4 focus-within:ring-2 focus-within:ring-accent/15">
            <input
              id="reset-new-pw"
              type={showPw ? "text" : "password"}
              autoComplete="new-password"
              autoFocus
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="At least 12 characters"
              className="flex-1 bg-transparent font-sans text-[14px] text-text-primary outline-none placeholder:text-text-muted"
              disabled={busy}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? "Hide password" : "Show password"}
              aria-pressed={showPw}
              className="flex shrink-0 items-center justify-center text-text-muted transition-colors duration-150 ease-out hover:text-text-primary"
            >
              {showPw ? (
                <EyeOff className="size-[18px]" strokeWidth={1.8} aria-hidden />
              ) : (
                <Eye className="size-[18px]" strokeWidth={1.8} aria-hidden />
              )}
            </button>
          </div>
        </div>

        <PasswordRequirementsList value={pw} />

        {/* Confirm */}
        <div className="flex flex-col gap-2">
          <label
            htmlFor="reset-confirm-pw"
            className="font-sans text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted"
          >
            Confirm new password
          </label>
          <div
            className={
              "flex h-13 items-center gap-2 rounded-[10px] bg-accent-soft px-4 focus-within:border-accent focus-within:border-2 focus-within:ring-2 focus-within:ring-accent/15 " +
              (confirmError ? "border-2 border-negative" : "border border-border-soft")
            }
          >
            <input
              id="reset-confirm-pw"
              type={showConfirm ? "text" : "password"}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                if (confirmError) setConfirmError(null);
              }}
              placeholder="Re-enter your new password"
              className="flex-1 bg-transparent font-sans text-[14px] text-text-primary outline-none placeholder:text-text-muted"
              disabled={busy}
              aria-invalid={confirmError ? "true" : undefined}
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              aria-label={showConfirm ? "Hide password" : "Show password"}
              aria-pressed={showConfirm}
              className="flex shrink-0 items-center justify-center text-text-muted transition-colors duration-150 ease-out hover:text-text-primary"
            >
              {showConfirm ? (
                <EyeOff className="size-[18px]" strokeWidth={1.8} aria-hidden />
              ) : (
                <Eye className="size-[18px]" strokeWidth={1.8} aria-hidden />
              )}
            </button>
          </div>
          {confirmError && (
            <p role="alert" className="font-sans text-[12px] text-negative">
              {confirmError}
            </p>
          )}
        </div>

        {serverError && (
          <p role="alert" className="font-sans text-[13px] text-negative">
            {serverError}
          </p>
        )}

        <div className="flex items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-12 items-center gap-2 rounded-[10px] bg-surface-raised pl-4 pr-5 font-sans text-[14px] font-semibold text-text-secondary transition-all duration-150 ease-out hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-card"
          >
            <ArrowLeft className="size-4" strokeWidth={2.2} aria-hidden />
            Back
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex h-12 items-center gap-2 rounded-[10px] bg-accent pl-5 pr-5 font-sans text-[14px] font-bold text-accent-foreground transition-all duration-150 ease-out hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-card disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Lock className="size-4" strokeWidth={2.2} aria-hidden />
            {busy ? "Resetting…" : "Reset password"}
          </button>
        </div>
      </form>
    </ResetPasswordLayout>
  );
}
