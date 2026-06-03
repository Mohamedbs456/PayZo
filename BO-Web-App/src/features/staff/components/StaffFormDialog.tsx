import { useEffect, useState } from "react";
import { Pencil, UserPlus, X } from "lucide-react";
import { ApiError } from "@/lib/api/error";
import {
  createAdmin,
  createAnalyst,
  updateAdmin,
  updateAnalyst,
  type StaffMember,
} from "../api";
import { TUNISIAN_GOVERNORATES } from "../governorates";

type Mode = "create" | "edit";

interface StaffFormDialogProps {
  open: boolean;
  mode: Mode;
  role: "ADMIN" | "ANALYST";
  /** Required when mode === "edit" — pre-fills the form. */
  initial?: StaffMember | null;
  onClose: () => void;
  onSuccess: (saved?: StaffMember) => void;
}

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  governorate: string;
  address: string;
  dateOfBirth: string;
}

const EMPTY: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  governorate: "",
  address: "",
  dateOfBirth: "",
};

/**
 * Single dialog for both creating and editing admins/analysts. The username
 * is auto-generated server-side (so it's not a form field), and the
 * temporary password is emailed to the new user. In `edit` mode, fields
 * pre-fill from `initial` and only changed values are sent on submit.
 */
export function StaffFormDialog({
  open,
  mode,
  role,
  initial,
  onClose,
  onSuccess,
}: StaffFormDialogProps) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset / pre-fill every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setSubmitting(false);
    setError(null);
    if (mode === "edit" && initial) {
      setForm({
        firstName: initial.firstName ?? "",
        lastName: initial.lastName ?? "",
        email: initial.email ?? "",
        phone: initial.phone ?? "",
        governorate: initial.governorate ?? "",
        address: initial.address ?? "",
        dateOfBirth: initial.dateOfBirth ?? "",
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, mode, initial]);

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

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const valid =
    form.firstName.trim().length > 0 &&
    form.lastName.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());

  const canSubmit = valid && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        governorate: form.governorate.trim() || undefined,
        address: form.address.trim() || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
      };

      let saved: StaffMember;
      if (mode === "create") {
        saved = role === "ADMIN" ? await createAdmin(payload) : await createAnalyst(payload);
      } else if (initial) {
        saved = role === "ADMIN"
          ? await updateAdmin(initial.id, payload)
          : await updateAnalyst(initial.id, payload);
      } else {
        throw new Error("Edit mode requires an initial member");
      }
      onSuccess(saved);
      onClose();
    } catch (cause) {
      console.error(`[staff] ${mode} ${role} failed`, cause);
      if (cause instanceof ApiError) setError(cause.message || "Failed");
      else if (cause instanceof Error) setError(cause.message);
      else setError("Failed");
      setSubmitting(false);
    }
  };

  const Icon = mode === "create" ? UserPlus : Pencil;
  const heading =
    mode === "create"
      ? role === "ADMIN" ? "Register new admin" : "Register new analyst"
      : role === "ADMIN" ? "Edit admin" : "Edit analyst";
  const subhead =
    mode === "create"
      ? "A Keycloak account is created and credentials are emailed on submission."
      : "Edits are saved immediately. The user keeps their existing login.";
  const confirmLabel = mode === "create" ? "Create" : "Save changes";
  const busyLabel = mode === "create" ? "Creating…" : "Saving…";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="staff-form-title"
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
            <Icon className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="staff-form-title" className="font-sans text-[15px] font-bold text-text-primary">
              {heading}
            </h2>
            <p className="mt-1 font-sans text-[12px] leading-relaxed text-text-muted">
              {subhead}
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
          <Field label="FIRST NAME" required>
            <input
              type="text"
              value={form.firstName}
              disabled={submitting}
              onChange={(e) => update("firstName", e.target.value)}
              className={inputClasses}
            />
          </Field>
          <Field label="LAST NAME" required>
            <input
              type="text"
              value={form.lastName}
              disabled={submitting}
              onChange={(e) => update("lastName", e.target.value)}
              className={inputClasses}
            />
          </Field>
          <Field label="EMAIL" required full>
            <input
              type="email"
              autoComplete="off"
              value={form.email}
              disabled={submitting}
              onChange={(e) => update("email", e.target.value)}
              className={inputClasses}
            />
          </Field>
          <Field label="PHONE">
            <input
              type="tel"
              autoComplete="off"
              value={form.phone}
              disabled={submitting}
              onChange={(e) => update("phone", e.target.value)}
              placeholder="+216 …"
              className={[inputClasses, "font-mono"].join(" ")}
            />
          </Field>
          <Field label="DATE OF BIRTH">
            <input
              type="date"
              value={form.dateOfBirth}
              disabled={submitting}
              onChange={(e) => update("dateOfBirth", e.target.value)}
              className={inputClasses}
            />
          </Field>
          <Field label="GOVERNORATE" full>
            <select
              value={form.governorate}
              disabled={submitting}
              onChange={(e) => update("governorate", e.target.value)}
              className={inputClasses}
            >
              <option value="">Select a governorate…</option>
              {TUNISIAN_GOVERNORATES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </Field>
          <Field label="ADDRESS" full>
            <input
              type="text"
              value={form.address}
              disabled={submitting}
              onChange={(e) => update("address", e.target.value)}
              className={inputClasses}
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
            {submitting ? busyLabel : confirmLabel}
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
  required,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
  required?: boolean;
}) {
  return (
    <div className={["flex flex-col gap-1.5", full ? "col-span-2" : ""].join(" ")}>
      <span className="font-sans text-[10px] font-bold uppercase tracking-[1.2px] text-text-label">
        {label}
        {required && <span className="ml-0.5 text-negative">*</span>}
      </span>
      {children}
    </div>
  );
}
