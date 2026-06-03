import { useEffect, useState } from "react";
import { UserPlus, X } from "lucide-react";
import { ApiError } from "@/lib/api/error";
import { createAdmin, createAnalyst } from "../api";

interface RegisterStaffDialogProps {
  open: boolean;
  role: "ADMIN" | "ANALYST";
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * +Add admin / +Add analyst dialog. Same form fields for both — backend
 * branches on `role` only at submission time. Generates a username for the
 * SA on the fly (`first.last`); admin can edit it before submitting.
 */
export function RegisterStaffDialog({ open, role, onClose, onSuccess }: RegisterStaffDialogProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFirstName("");
    setLastName("");
    setEmail("");
    setUsername("");
    setSubmitting(false);
    setError(null);
  }, [open, role]);

  // Auto-suggest a username from the name fields. Admin can override it
  // anytime; we stop auto-filling once they manually edit.
  const [usernameTouched, setUsernameTouched] = useState(false);
  useEffect(() => {
    if (usernameTouched) return;
    if (!firstName && !lastName) {
      setUsername("");
      return;
    }
    const slug = `${firstName}.${lastName}`
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[^a-z0-9.]/g, "");
    setUsername(slug);
  }, [firstName, lastName, usernameTouched]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const canSubmit =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    username.trim().length > 0 &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        username: username.trim(),
      };
      if (role === "ADMIN") await createAdmin(payload);
      else await createAnalyst(payload);
      onSuccess();
      onClose();
    } catch (cause) {
      console.error(`[staff] create ${role} failed`, cause);
      if (cause instanceof ApiError) {
        setError(cause.message || "Registration failed");
      } else if (cause instanceof Error) {
        setError(cause.message);
      } else {
        setError("Registration failed");
      }
      setSubmitting(false);
    }
  };

  const heading = role === "ADMIN" ? "Register new admin" : "Register new analyst";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="register-staff-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-dark/40 px-4 py-6 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-[0_24px_64px_-12px_rgba(42,31,20,0.30)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-cream-2/60 text-brand-medium">
            <UserPlus className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="register-staff-title" className="font-sans text-[15px] font-bold text-text-primary">
              {heading}
            </h2>
            <p className="mt-1 font-sans text-[12px] leading-relaxed text-text-muted">
              A Keycloak account is created and a temporary password is emailed
              on submission.
            </p>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            aria-label="Close"
            className="-m-1.5 flex size-7 shrink-0 items-center justify-center rounded-md text-text-faint transition-colors duration-150 ease-out hover:bg-brand-cream/60 hover:text-text-primary disabled:opacity-50"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <Field label="FIRST NAME">
            <input
              type="text"
              value={firstName}
              disabled={submitting}
              onChange={(e) => setFirstName(e.target.value)}
              className={inputClasses}
            />
          </Field>
          <Field label="LAST NAME">
            <input
              type="text"
              value={lastName}
              disabled={submitting}
              onChange={(e) => setLastName(e.target.value)}
              className={inputClasses}
            />
          </Field>
          <Field label="EMAIL" full>
            <input
              type="email"
              autoComplete="off"
              value={email}
              disabled={submitting}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClasses}
            />
          </Field>
          <Field label="USERNAME" full>
            <input
              type="text"
              autoComplete="off"
              value={username}
              disabled={submitting}
              onChange={(e) => {
                setUsername(e.target.value);
                setUsernameTouched(true);
              }}
              className={[inputClasses, "font-mono"].join(" ")}
            />
          </Field>
        </div>

        {error && (
          <p className="mt-4 font-sans text-[12px] font-semibold text-negative">{error}</p>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex h-9 items-center rounded-full border border-brand-cream-2 bg-white px-4 font-sans text-[12px] font-semibold text-text-primary transition-all duration-150 ease-out hover:bg-brand-cream/60 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex h-9 items-center rounded-full bg-brand-dark px-4 font-sans text-[12px] font-semibold text-brand-cream transition-all duration-150 ease-out hover:bg-brand-dark/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputClasses =
  "block h-10 w-full rounded-lg border border-brand-cream-2 bg-white px-3 font-sans text-[13px] text-text-primary outline-none transition-colors duration-150 ease-out focus:border-brand-medium disabled:opacity-50";

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={["flex flex-col gap-1.5", full ? "col-span-2" : ""].join(" ")}>
      <span className="font-sans text-[10px] font-bold uppercase tracking-[1.2px] text-text-label">
        {label}
      </span>
      {children}
    </div>
  );
}
