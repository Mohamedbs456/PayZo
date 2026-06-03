import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Check,
  Eye,
  EyeOff,
  Mail,
  RotateCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import {
  confirmPasswordChange,
  firstLoginPasswordChange,
  initiatePasswordChange,
} from "@/features/me/api";
import {
  evaluatePassword,
  isPasswordValid,
} from "@/features/me/passwordPolicy";

const RESEND_COOLDOWN_S = 60;

interface ChangePasswordModalProps {
  open: boolean;
  onClose: () => void;
  /** When true, the modal can't be dismissed — no X, no Cancel, no
   *  backdrop click, no Escape. The only way out is to complete the OTP
   *  flow (or reload the app). Used for the first-login forced rotation. */
  forced?: boolean;
}

/**
 * Two-step OTP password change (D45/D46) presented as a centered modal over
 * a blurred backdrop. Lifted from the deprecated `/profile/change-password`
 * full-page route — same OTP / policy / resend semantics, just no longer
 * navigating away from whatever page the user was on.
 */
export function ChangePasswordModal({ open, onClose, forced = false }: ChangePasswordModalProps) {
  const { showToast } = useToast();

  const [stage, setStage] = useState<"initiate" | "confirm">("initiate");

  const [current, setCurrent] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);

  const [otp, setOtp] = useState("");
  const [next, setNext] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const [busy, setBusy] = useState(false);

  // Reset on close so re-opening always starts fresh on Step 1.
  useEffect(() => {
    if (!open) {
      setStage("initiate");
      setCurrent("");
      setShowCurrent(false);
      setOtp("");
      setNext("");
      setConfirmPw("");
      setShowNext(false);
      setShowConfirm(false);
      setResendIn(0);
      setBusy(false);
    }
  }, [open]);

  // Resend countdown
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (resendIn <= 0) return;
    intervalRef.current = setInterval(() => {
      setResendIn((s) => Math.max(0, s - 1));
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [resendIn]);

  // Escape closes the modal (unless we're in the middle of a network call,
  // or this is a forced first-login rotation that the user can't dismiss).
  useEffect(() => {
    if (!open || forced) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, forced, onClose]);

  if (!open) return null;

  /* ─── Step 1 — initiate ─────────────────────────────────────────── */

  const handleInitiate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (current.length === 0 || busy) return;
    setBusy(true);
    try {
      await initiatePasswordChange({ currentPassword: current });
      showToast({ tier: "success", message: "We've emailed you a 6-digit code." });
      setStage("confirm");
      setResendIn(RESEND_COOLDOWN_S);
    } catch (cause) {
      console.error("[me] initiate password change failed", cause);
      showToast({
        tier: "danger",
        message: cause instanceof Error ? cause.message : "Couldn't send the code",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    if (resendIn > 0 || busy) return;
    setBusy(true);
    try {
      await initiatePasswordChange({ currentPassword: current });
      showToast({ tier: "success", message: "Code resent." });
      setResendIn(RESEND_COOLDOWN_S);
    } catch (cause) {
      console.error("[me] resend OTP failed", cause);
      showToast({
        tier: "danger",
        message: cause instanceof Error ? cause.message : "Couldn't resend the code",
      });
    } finally {
      setBusy(false);
    }
  };

  /* ─── Step 2 — confirm ──────────────────────────────────────────── */

  const checks = evaluatePassword(next);
  const matches = next.length > 0 && next === confirmPw;
  const otpValid = /^\d{6}$/.test(otp);
  const canSubmitConfirm =
    otpValid && isPasswordValid(next) && matches && !busy;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmitConfirm) return;
    setBusy(true);
    try {
      await confirmPasswordChange({ otp, newPassword: next });
      showToast({ tier: "success", message: "Password changed" });
      onClose();
    } catch (cause) {
      console.error("[me] confirm password change failed", cause);
      showToast({
        tier: "danger",
        message: cause instanceof Error ? cause.message : "Couldn't change password",
      });
    } finally {
      setBusy(false);
    }
  };

  /* ─── Forced first-login — single panel, no OTP, no current pw ──── */

  const canSubmitForced = isPasswordValid(next) && matches && !busy;

  const handleForcedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmitForced) return;
    setBusy(true);
    try {
      await firstLoginPasswordChange({ newPassword: next });
      showToast({ tier: "success", message: "Password set — welcome to PayZo." });
      onClose();
    } catch (cause) {
      console.error("[me] first-login password rotation failed", cause);
      showToast({
        tier: "danger",
        message: cause instanceof Error ? cause.message : "Couldn't set password",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-password-title"
      className="fixed inset-0 z-[70] flex items-center justify-center p-6"
    >
      {/* Blurred scrim. In forced mode (first-login) clicking it does
          nothing — the user must complete the rotation to dismiss. */}
      <button
        type="button"
        aria-label={forced ? undefined : "Close"}
        aria-hidden={forced}
        tabIndex={forced ? -1 : 0}
        onClick={() => !busy && !forced && onClose()}
        className="absolute inset-0 cursor-default bg-black/30 backdrop-blur-md"
      />

      {/* Card */}
      <div className="relative flex max-h-[88vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_-12px_rgba(42,31,20,0.40)]">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-brand-cream-2/70 px-6 pb-4 pt-5">
          <div className="flex flex-col gap-1">
            <h2
              id="change-password-title"
              className="font-sans text-[15px] font-bold text-text-primary"
            >
              {forced ? "Set a new password" : "Change password"}
            </h2>
            <p className="font-sans text-[12px] text-text-muted">
              {forced
                ? stage === "initiate"
                  ? "First sign-in — rotate the temp password we emailed you."
                  : "Enter the code we just emailed and pick a new password."
                : stage === "initiate"
                  ? "Step 1 of 2 · Verify identity"
                  : "Step 2 of 2 · New password"}
            </p>
          </div>
          {/* No X in forced mode — first-login rotation can't be dismissed. */}
          {!forced && (
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label="Close"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-text-faint transition-colors duration-150 hover:bg-brand-cream/50 hover:text-text-primary disabled:opacity-50"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>

        {/* Body — scrolls if content is taller than viewport */}
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
          {/* Forced (first-login) flow: single panel, no OTP, no current
              password. The JWT proves identity; backend rejects the call
              after firstLoginCompleted flips. */}
          {forced ? (
            <form onSubmit={handleForcedSubmit} className="flex flex-col gap-5">
              <div className="flex items-start gap-3 rounded-xl bg-brand-cream/50 px-4 py-3 ring-1 ring-inset ring-brand-cream-2/70">
                <ShieldCheck
                  className="mt-0.5 size-4 shrink-0 text-brand-medium"
                  aria-hidden
                />
                <p className="font-sans text-[12px] leading-relaxed text-text-primary">
                  Your account was created with a one-time temporary
                  password. Pick a new one to continue — you'll use this
                  every time you sign in.
                </p>
              </div>

              <Field label="New password">
                <PasswordInput
                  value={next}
                  onChange={setNext}
                  visible={showNext}
                  onToggleVisible={() => setShowNext((v) => !v)}
                  autoComplete="new-password"
                />
                <ul className="mt-2 flex flex-col gap-1">
                  {checks.map((c) => (
                    <li
                      key={c.id}
                      className={[
                        "flex items-center gap-1.5 font-sans text-[11px]",
                        c.passed ? "text-positive" : "text-text-muted",
                      ].join(" ")}
                    >
                      {c.passed ? (
                        <Check className="size-3" aria-hidden />
                      ) : (
                        <X className="size-3 text-text-faint" aria-hidden />
                      )}
                      {c.label}
                    </li>
                  ))}
                </ul>
              </Field>

              <Field label="Confirm new password">
                <PasswordInput
                  value={confirmPw}
                  onChange={setConfirmPw}
                  visible={showConfirm}
                  onToggleVisible={() => setShowConfirm((v) => !v)}
                  autoComplete="new-password"
                />
                {confirmPw.length > 0 && !matches && (
                  <p className="mt-1.5 font-sans text-[11px] font-semibold text-negative">
                    Passwords don't match.
                  </p>
                )}
              </Field>

              <div className="flex items-center justify-end pt-1">
                <button
                  type="submit"
                  disabled={!canSubmitForced}
                  className="flex h-9 items-center gap-1.5 rounded-full bg-brand-dark px-4 font-sans text-[12px] font-semibold text-brand-cream transition-all duration-150 ease-out enabled:hover:scale-[1.02] enabled:hover:bg-brand-dark/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Set password"}
                </button>
              </div>
            </form>
          ) : (
            <>
              <Stepper stage={stage} />

              {stage === "initiate" ? (
            <form onSubmit={handleInitiate} className="flex flex-col gap-5">
              <div className="flex items-start gap-3 rounded-xl bg-brand-cream/50 px-4 py-3 ring-1 ring-inset ring-brand-cream-2/70">
                <Mail
                  className="mt-0.5 size-4 shrink-0 text-brand-medium"
                  aria-hidden
                />
                <p className="font-sans text-[12px] leading-relaxed text-text-primary">
                  For security, we'll email a 6-digit code to your registered
                  address before letting you set a new password.
                </p>
              </div>

              <Field label="Current password">
                <PasswordInput
                  value={current}
                  onChange={setCurrent}
                  visible={showCurrent}
                  onToggleVisible={() => setShowCurrent((v) => !v)}
                  autoComplete="current-password"
                />
              </Field>

              <div className="flex items-center justify-end gap-2 pt-1">
                {/* No Cancel in forced mode — they have to finish. */}
                {!forced && (
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={busy}
                    className="flex h-9 items-center rounded-full px-3.5 font-sans text-[12px] font-semibold text-text-muted transition-colors duration-150 hover:bg-brand-cream/40 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={current.length === 0 || busy}
                  className="flex h-9 items-center gap-1.5 rounded-full bg-brand-dark px-4 font-sans text-[12px] font-semibold text-brand-cream transition-all duration-150 ease-out enabled:hover:scale-[1.02] enabled:hover:bg-brand-dark/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Mail className="size-3.5" aria-hidden />
                  {busy ? "Sending…" : "Send code"}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleConfirm} className="flex flex-col gap-5">
              <div className="flex items-center justify-between gap-3 rounded-xl bg-brand-cream/50 px-4 py-3 ring-1 ring-inset ring-brand-cream-2/70">
                <div className="flex items-start gap-3">
                  <ShieldCheck
                    className="mt-0.5 size-4 shrink-0 text-brand-medium"
                    aria-hidden
                  />
                  <p className="font-sans text-[12px] leading-relaxed text-text-primary">
                    Enter the 6-digit code we just emailed you, then set your new
                    password.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendIn > 0 || busy}
                  className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 font-sans text-[11px] font-semibold text-text-primary ring-1 ring-brand-cream-2/70 transition-colors duration-150 hover:bg-brand-cream-2/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RotateCw className="size-3" aria-hidden />
                  {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
                </button>
              </div>

              <Field label="6-digit code">
                <OtpInput value={otp} onChange={setOtp} />
              </Field>

              <Field label="New password">
                <PasswordInput
                  value={next}
                  onChange={setNext}
                  visible={showNext}
                  onToggleVisible={() => setShowNext((v) => !v)}
                  autoComplete="new-password"
                />
                <ul className="mt-2 flex flex-col gap-1">
                  {checks.map((c) => (
                    <li
                      key={c.id}
                      className={[
                        "flex items-center gap-1.5 font-sans text-[11px]",
                        c.passed ? "text-positive" : "text-text-muted",
                      ].join(" ")}
                    >
                      {c.passed ? (
                        <Check className="size-3" aria-hidden />
                      ) : (
                        <X className="size-3 text-text-faint" aria-hidden />
                      )}
                      {c.label}
                    </li>
                  ))}
                </ul>
              </Field>

              <Field label="Confirm new password">
                <PasswordInput
                  value={confirmPw}
                  onChange={setConfirmPw}
                  visible={showConfirm}
                  onToggleVisible={() => setShowConfirm((v) => !v)}
                  autoComplete="new-password"
                />
                {confirmPw.length > 0 && !matches && (
                  <p className="mt-1.5 font-sans text-[11px] font-semibold text-negative">
                    Passwords don't match.
                  </p>
                )}
              </Field>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setStage("initiate");
                    setOtp("");
                    setNext("");
                    setConfirmPw("");
                    setResendIn(0);
                  }}
                  disabled={busy}
                  className="flex h-9 items-center rounded-full px-3.5 font-sans text-[12px] font-semibold text-text-muted transition-colors duration-150 hover:bg-brand-cream/40 disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={!canSubmitConfirm}
                  className="flex h-9 items-center gap-1.5 rounded-full bg-brand-dark px-4 font-sans text-[12px] font-semibold text-brand-cream transition-all duration-150 ease-out enabled:hover:scale-[1.02] enabled:hover:bg-brand-dark/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Update password"}
                </button>
              </div>
            </form>
          )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components (lifted from ChangePasswordPage) ──────────────────── */

function Stepper({ stage }: { stage: "initiate" | "confirm" }) {
  return (
    <div className="flex items-center gap-2">
      <Step active label="1" title="Verify" complete={stage === "confirm"} />
      <div className="h-px flex-1 bg-brand-cream-2/70" aria-hidden />
      <Step active={stage === "confirm"} label="2" title="New password" />
    </div>
  );
}

function Step({
  active,
  complete,
  label,
  title,
}: {
  active: boolean;
  complete?: boolean;
  label: string;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={[
          "flex size-6 shrink-0 items-center justify-center rounded-full font-sans text-[11px] font-bold",
          complete
            ? "bg-positive text-white"
            : active
              ? "bg-brand-dark text-brand-cream"
              : "bg-brand-cream-2/60 text-text-muted",
        ].join(" ")}
      >
        {complete ? <Check className="size-3.5" aria-hidden /> : label}
      </span>
      <span
        className={[
          "font-sans text-[12px] font-semibold",
          active || complete ? "text-text-primary" : "text-text-muted",
        ].join(" ")}
      >
        {title}
      </span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-sans text-[10px] font-bold uppercase tracking-[1px] text-text-label">
        {label}
      </span>
      {children}
    </div>
  );
}

function PasswordInput({
  value,
  onChange,
  visible,
  onToggleVisible,
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  visible: boolean;
  onToggleVisible: () => void;
  autoComplete?: string;
}) {
  return (
    <div className="relative flex items-center">
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        className="w-full rounded-lg border border-brand-cream-2 bg-white px-3 py-2 pr-10 font-sans text-[13px] text-text-primary placeholder:text-text-faint focus:border-brand-dark focus:outline-none"
      />
      <button
        type="button"
        onClick={onToggleVisible}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute right-2 flex size-7 items-center justify-center rounded-md text-text-faint transition-colors duration-150 hover:bg-brand-cream/40 hover:text-text-primary"
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden />
        ) : (
          <Eye className="size-4" aria-hidden />
        )}
      </button>
    </div>
  );
}

function OtpInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      placeholder="••••••"
      className="rounded-lg border border-brand-cream-2 bg-white px-4 py-3 text-center font-mono text-[22px] font-bold tracking-[0.5em] tabular-nums text-text-primary placeholder:text-text-faint focus:border-brand-dark focus:outline-none"
    />
  );
}
