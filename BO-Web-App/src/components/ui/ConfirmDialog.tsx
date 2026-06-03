import { useEffect, type ComponentType } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  X,
  type LucideProps,
} from "lucide-react";

export type ConfirmVariant = "danger" | "warning" | "positive" | "primary";

interface VariantStyle {
  /** Icon shown next to the title (none for `primary`). */
  Icon: ComponentType<LucideProps> | null;
  /** Tailwind classes for the round icon container (bg + text color). */
  iconWrapper: string;
  /** Tailwind classes for the confirm button (bg, text, hover, shadow). */
  confirmBtn: string;
}

const VARIANT_STYLES: Record<ConfirmVariant, VariantStyle> = {
  danger: {
    Icon: AlertTriangle,
    iconWrapper: "bg-negative/10 text-negative",
    confirmBtn:
      "bg-negative text-white hover:bg-negative/90 shadow-[0_4px_12px_rgba(240,97,97,0.30)]",
  },
  warning: {
    Icon: AlertCircle,
    iconWrapper: "bg-[#fdf3df] text-[#8a6d1f]",
    confirmBtn:
      "bg-[#c89a1f] text-white hover:bg-[#b48819] shadow-[0_4px_12px_rgba(212,160,21,0.30)]",
  },
  positive: {
    Icon: CheckCircle2,
    iconWrapper: "bg-positive/15 text-[#1c7a52]",
    confirmBtn:
      "bg-positive text-white hover:bg-positive/90 shadow-[0_4px_12px_rgba(51,204,140,0.30)]",
  },
  primary: {
    Icon: null,
    iconWrapper: "",
    confirmBtn: "bg-brand-dark text-brand-cream hover:bg-brand-dark/90",
  },
};

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Body text — kept short. Use a ReactNode if you need formatting. */
  message: React.ReactNode;
  /** Confirm-button label (default "Confirm"). */
  confirmLabel?: string;
  /** Cancel-button label (default "Cancel"). */
  cancelLabel?: string;
  /** Visual variant — drives icon + confirm-button color. Default "primary". */
  variant?: ConfirmVariant;
  /** Disable the confirm button while an async action is in flight. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Standalone confirmation modal — backdrop click + Escape both cancel,
 * Enter confirms (when not busy). Used by every Clients-page action button
 * (Delete / Block / Unblock / Accept / Reject); shared visual frame, with
 * the variant prop tinting the icon + confirm button.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "primary",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Keyboard shortcuts only matter while the dialog is open. Escape always
  // cancels; Enter confirms unless the action is in flight.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === "Enter" && !busy) {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, busy, onCancel, onConfirm]);

  if (!open) return null;

  const style = VARIANT_STYLES[variant];
  const Icon = style.Icon;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-dark/40 px-4 py-6 backdrop-blur-sm"
      // Backdrop click cancels — but only if the click started on the backdrop
      // itself (avoids closing when a click drag began inside the card).
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-[0_24px_64px_-12px_rgba(42,31,20,0.30)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          {Icon ? (
            <div
              className={[
                "flex size-9 shrink-0 items-center justify-center rounded-full",
                style.iconWrapper,
              ].join(" ")}
            >
              <Icon className="size-5" aria-hidden />
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2
              id="confirm-dialog-title"
              className="font-sans text-[15px] font-bold text-text-primary"
            >
              {title}
            </h2>
            <div className="mt-1.5 font-sans text-[13px] leading-relaxed text-text-muted">
              {message}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="-m-1.5 flex size-7 shrink-0 items-center justify-center rounded-md text-text-faint transition-colors duration-150 ease-out hover:bg-brand-cream/60 hover:text-text-primary"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex h-9 items-center rounded-full border border-brand-cream-2 bg-white px-4 font-sans text-[12px] font-semibold text-text-primary transition-all duration-150 ease-out hover:bg-brand-cream/60 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={[
              "flex h-9 items-center rounded-full px-4 font-sans text-[12px] font-semibold transition-all duration-150 ease-out disabled:opacity-60",
              style.confirmBtn,
            ].join(" ")}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
