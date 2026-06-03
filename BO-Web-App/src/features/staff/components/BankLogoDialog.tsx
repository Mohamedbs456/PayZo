import { useEffect, useState } from "react";
import { Image as ImageIcon, X } from "lucide-react";
import { ApiError } from "@/lib/api/error";
import { BankAvatar } from "@/features/banks/components/BankAvatar";
import { updateBankLogo, type BankRow } from "../api";

interface BankLogoDialogProps {
  open: boolean;
  bank: BankRow | null;
  onClose: () => void;
  onSuccess: (saved: BankRow) => void;
}

/**
 * Logo-only edit dialog. The name + code + numeric code come from the CBS
 * catalog and are read-only on the PayZo side (D48). Only `logoUrl` is
 * mutable; clearing it falls back to the palette-color avatar.
 */
export function BankLogoDialog({
  open,
  bank,
  onClose,
  onSuccess,
}: BankLogoDialogProps) {
  const [logoUrl, setLogoUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !bank) return;
    setSubmitting(false);
    setError(null);
    setLogoUrl(bank.logoUrl ?? "");
  }, [open, bank]);

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

  if (!open || !bank) return null;

  const cleanLogo = logoUrl.trim();
  const changed = cleanLogo !== (bank.logoUrl ?? "");

  const handleSubmit = async () => {
    if (submitting || !changed) return;
    setSubmitting(true);
    setError(null);
    try {
      const saved = await updateBankLogo(bank.id, {
        logoUrl: cleanLogo || undefined,
      });
      onSuccess(saved);
      onClose();
    } catch (cause) {
      if (cause instanceof ApiError) setError(cause.message || "Failed");
      else if (cause instanceof Error) setError(cause.message);
      else setError("Failed");
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bank-logo-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-dark/40 px-4 py-6 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-[0_24px_64px_-12px_rgba(42,31,20,0.30)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-cream-2/60 text-brand-medium">
            <ImageIcon className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="bank-logo-title"
              className="font-sans text-[15px] font-bold text-text-primary"
            >
              Edit logo
            </h2>
            <p className="mt-1 font-sans text-[12px] leading-relaxed text-text-muted">
              The bank's name and code are managed by CBS — only the logo is
              editable here. Leave blank to fall back to the palette avatar.
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

        <div className="mt-4 flex items-center gap-3 rounded-xl border border-brand-cream-2/80 bg-brand-cream/30 p-3">
          <BankAvatar
            code={bank.code}
            logoUrl={cleanLogo || undefined}
            size={44}
          />
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate font-sans text-[13px] font-semibold text-text-primary">
              {bank.name}
            </span>
            <span className="font-mono text-[11px] text-text-muted">
              {bank.code}
              {bank.numericCode ? ` · ${bank.numericCode}` : ""}
            </span>
          </div>
          <span className="ml-auto font-sans text-[10px] uppercase tracking-[1.2px] text-text-faint">
            Preview
          </span>
        </div>

        <div className="mt-5">
          <label className="flex flex-col gap-1.5">
            <span className="font-sans text-[10px] font-bold uppercase tracking-[1.2px] text-text-label">
              Logo URL
            </span>
            <input
              type="url"
              value={logoUrl}
              disabled={submitting}
              onChange={(e) => setLogoUrl(e.target.value.slice(0, 500))}
              placeholder="https://…/logo.png"
              className="block h-10 w-full rounded-lg border border-brand-cream-2 bg-white px-3 font-sans text-[13px] text-text-primary outline-none transition-colors duration-150 ease-out focus:border-brand-medium disabled:opacity-50"
            />
          </label>
        </div>

        {error && (
          <p className="mt-4 font-sans text-[12px] font-semibold text-negative">
            {error}
          </p>
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
            disabled={submitting || !changed}
            className="flex h-9 items-center rounded-full bg-brand-dark px-4 font-sans text-[12px] font-semibold text-brand-cream transition-all duration-150 ease-out hover:bg-brand-dark/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Save logo"}
          </button>
        </div>
      </div>
    </div>
  );
}
