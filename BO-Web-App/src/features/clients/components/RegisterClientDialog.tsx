import { useEffect, useRef, useState } from "react";
import { IdCard, Loader2, X } from "lucide-react";
import {
  directRegisterClient,
  previewCbsClient,
  type CbsClientPreview,
} from "../api";
import { ApiError } from "@/lib/api/error";

interface RegisterClientDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called after a successful direct subscription so the parent can refresh the list. */
  onSuccess: (cin: string) => void;
}

/**
 * Register-client modal — driven by the toolbar's "+ Register client" button.
 *
 * Flow:
 *   1. Admin enters the client's CIN. When 8 digits land, we debounce 300ms
 *      and look up CBS via GET /admin/cbs/clients/{cin}.
 *   2. The CBS profile (name / email / phone / DOB / governorate / address)
 *      renders in a read-only preview pane.
 *   3. Admin clicks "Create account" → POST /admin/subscriptions/direct.
 *      Backend skips PENDING and creates an ACTIVE+firstLogin=false client.
 *
 * The Create button is disabled unless the preview loaded successfully AND
 * the CIN isn't already registered. Errors (404 from CBS, 409 already
 * registered, network) surface inline and stay visible until input changes.
 */
export function RegisterClientDialog({ open, onClose, onSuccess }: RegisterClientDialogProps) {
  const [cin, setCin] = useState("");
  const [preview, setPreview] = useState<CbsClientPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Reset everything every time the dialog opens — stale state from a prior
  // open session would otherwise show through (e.g. a previous successful
  // creation's CIN still in the input).
  useEffect(() => {
    if (!open) return;
    setCin("");
    setPreview(null);
    setPreviewLoading(false);
    setPreviewError(null);
    setSubmitting(false);
    setSubmitError(null);
  }, [open]);

  // Debounced CBS lookup. Only fires for exactly-8-digit CINs (Tunisian
  // national-ID length). Each new input wave aborts the previous fetch.
  const cleanCin = cin.replace(/\D/g, "").slice(0, 8);
  const cinIsLookupReady = cleanCin.length === 8;
  const lookupAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    lookupAbortRef.current?.abort();
    setPreview(null);
    setPreviewError(null);
    setSubmitError(null);
    if (!cinIsLookupReady) {
      setPreviewLoading(false);
      return;
    }
    setPreviewLoading(true);
    const controller = new AbortController();
    lookupAbortRef.current = controller;
    const id = setTimeout(() => {
      previewCbsClient(cleanCin, controller.signal)
        .then((data) => {
          if (controller.signal.aborted) return;
          setPreview(data);
          setPreviewLoading(false);
        })
        .catch((cause) => {
          if (controller.signal.aborted) return;
          setPreviewLoading(false);
          if (cause instanceof ApiError && cause.status === 404) {
            setPreviewError("No client with this CIN exists in CBS.");
          } else if (cause instanceof Error) {
            setPreviewError(cause.message);
          } else {
            setPreviewError("Lookup failed");
          }
        });
    }, 300);
    return () => {
      clearTimeout(id);
      controller.abort();
    };
  }, [cleanCin, cinIsLookupReady]);

  // Escape closes (when not mid-submit). Submit happens via the Create button.
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

  const canCreate =
    !!preview && !preview.alreadyRegistered && !submitting && !previewLoading;

  const handleCreate = async () => {
    if (!canCreate || !preview) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await directRegisterClient(preview.cin);
      onSuccess(preview.cin);
      onClose();
    } catch (cause) {
      console.error("[clients] direct subscribe failed", cause);
      if (cause instanceof ApiError && cause.errorCode === "CIN_ALREADY_REGISTERED") {
        setSubmitError("This CIN is already a PayZo client.");
      } else if (cause instanceof Error) {
        setSubmitError(cause.message);
      } else {
        setSubmitError("Registration failed");
      }
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="register-client-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-dark/40 px-4 py-6 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-[0_24px_64px_-12px_rgba(42,31,20,0.30)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* ── Header ────────────────────────────────────────────────── */}
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-cream-2/60 text-brand-medium">
            <IdCard className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="register-client-title"
              className="font-sans text-[15px] font-bold text-text-primary"
            >
              Register new client
            </h2>
            <p className="mt-1 font-sans text-[12px] leading-relaxed text-text-muted">
              Enter the client's national ID. Their CBS profile loads below for
              review — the PayZo account is created on confirmation.
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

        {/* ── CIN input ─────────────────────────────────────────────── */}
        <div className="mt-5">
          <label
            htmlFor="register-client-cin"
            className="block font-sans text-[10px] font-bold uppercase tracking-[1.2px] text-text-label"
          >
            CIN
          </label>
          <input
            id="register-client-cin"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="8-digit national ID"
            value={cin}
            disabled={submitting}
            onChange={(e) => setCin(e.target.value)}
            // Allow Enter to confirm if everything's ready
            onKeyDown={(e) => {
              if (e.key === "Enter" && canCreate) {
                e.preventDefault();
                handleCreate();
              }
            }}
            className="mt-1.5 block h-10 w-full rounded-lg border border-brand-cream-2 bg-white px-3 font-mono text-[13px] text-text-primary outline-none transition-colors duration-150 ease-out focus:border-brand-medium disabled:opacity-50"
          />
          {/* Status line — chooses between counter / loader / error / banner. */}
          <div className="mt-2 min-h-[16px] font-sans text-[11px]">
            {!cinIsLookupReady ? (
              <span className="text-text-faint">
                {cleanCin.length}/8 digits
              </span>
            ) : previewLoading ? (
              <span className="inline-flex items-center gap-1.5 text-text-muted">
                <Loader2 className="size-3 animate-spin" aria-hidden />
                Looking up CBS profile…
              </span>
            ) : previewError ? (
              <span className="text-negative">{previewError}</span>
            ) : preview?.alreadyRegistered ? (
              <span className="text-[#8a6d1f]">
                This CIN is already a PayZo client — open the Clients list to view it.
              </span>
            ) : preview ? (
              <span className="text-positive">CBS profile loaded — review below.</span>
            ) : null}
          </div>
        </div>

        {/* ── Preview pane (only when preview is loaded) ───────────── */}
        {preview && <PreviewPane preview={preview} />}

        {/* ── Submit error (after Create attempt) ──────────────────── */}
        {submitError && (
          <p className="mt-4 font-sans text-[12px] font-semibold text-negative">
            {submitError}
          </p>
        )}

        {/* ── Footer buttons ───────────────────────────────────────── */}
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
            onClick={handleCreate}
            disabled={!canCreate}
            className="flex h-9 items-center rounded-full bg-brand-dark px-4 font-sans text-[12px] font-semibold text-brand-cream transition-all duration-150 ease-out hover:bg-brand-dark/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create account"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Preview pane ──────────────────────────────────────────────────── */

function PreviewPane({ preview }: { preview: CbsClientPreview }) {
  return (
    <div className="mt-4 rounded-xl border border-brand-cream-2/80 bg-brand-cream/30 p-4">
      <div className="grid grid-cols-2 gap-x-5 gap-y-3">
        <PreviewField label="FULL NAME" value={`${preview.firstName} ${preview.lastName}`} />
        <PreviewField label="DATE OF BIRTH" value={preview.dateOfBirth ?? "—"} />
        <PreviewField label="EMAIL" value={preview.email} />
        <PreviewField label="PHONE" value={formatPhone(preview.phone)} />
        <PreviewField label="GOVERNORATE" value={preview.governorate} />
        <PreviewField label="CIN" value={preview.cin} />
      </div>
      <div className="mt-3.5">
        <PreviewField label="ADDRESS" value={preview.address} />
      </div>
    </div>
  );
}

function PreviewField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 flex flex-col gap-1">
      <span className="font-sans text-[9px] font-bold uppercase tracking-[1.2px] text-text-label">
        {label}
      </span>
      <span className="break-words font-sans text-[12px] leading-snug text-text-primary">
        {value}
      </span>
    </div>
  );
}

function formatPhone(raw: string): string {
  const stripped = raw.replace(/\s+/g, "");
  if (stripped.startsWith("+216") && stripped.length === 12) {
    const rest = stripped.slice(4);
    return `+216 ${rest.slice(0, 2)} ${rest.slice(2, 5)} ${rest.slice(5)}`;
  }
  return raw;
}
