import { cn } from "@/lib/cn";
import { resolveBackendUrl } from "@/lib/backendUrl";

/* ─── Trust band ──────────────────────────────────────────────────────────
 * Mirrors `util/TrustBands.java` on the backend (50–100 HIGH, 20–49 MEDIUM,
 * 0–19 LOW). Local helper because the trust pill in `TopBar` uses a
 * different 4-color visual scheme.
 */
type Band = "HIGH" | "MED" | "LOW";

function bandOf(score: number): Band {
  if (score >= 50) return "HIGH";
  if (score >= 20) return "MED";
  return "LOW";
}

const BAND_CLASS: Record<Band, string> = {
  HIGH: "bg-positive-soft text-positive",
  MED: "bg-warning-soft text-warning",
  LOW: "bg-negative-soft text-negative",
};

export interface RecipientConfirmationCardProps {
  firstName: string;
  lastName: string;
  profilePictureUrl: string | null;
  trustScore: number;
  busy: boolean;
  onConfirm: () => void;
  onReject: () => void;
}

/**
 * Confirmation card shown after `resolve-username` returns. Exactly:
 * avatar + full name + trust score (number + band chip) + two buttons.
 * No bank info, no masked account, no descriptive copy.
 *
 * "Yes, that's them" advances to Step 2 (amount entry).
 * "Wrong person, go back" clears the resolve state and returns to the input.
 */
export function RecipientConfirmationCard({
  firstName,
  lastName,
  profilePictureUrl,
  trustScore,
  busy,
  onConfirm,
  onReject,
}: RecipientConfirmationCardProps) {
  const band = bandOf(trustScore);
  const initials =
    (firstName.trim().charAt(0) + lastName.trim().charAt(0)).toUpperCase() ||
    "··";

  return (
    <div className="flex flex-col items-center gap-5 rounded-2xl border border-border-soft bg-surface-card px-6 py-7 text-center">
      <span
        className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent font-sans text-[24px] font-bold text-accent-foreground"
        aria-hidden
      >
        {profilePictureUrl ? (
          <img
            src={resolveBackendUrl(profilePictureUrl)}
            alt=""
            className="size-full object-cover"
          />
        ) : (
          initials
        )}
      </span>

      <p className="font-sans text-[20px] font-bold leading-tight text-text-primary">
        {firstName} {lastName}
      </p>

      <div className="flex items-center gap-2">
        <span className="font-sans text-[13px] text-text-secondary">
          Trust score:
        </span>
        <span className="font-mono text-[15px] font-bold text-text-primary">
          {trustScore}
        </span>
        <span
          className={cn(
            "inline-flex h-[20px] items-center rounded-full px-2 font-sans text-[10px] font-bold uppercase tracking-[0.08em]",
            BAND_CLASS[band],
          )}
        >
          {band}
        </span>
      </div>

      <div className="flex w-full flex-col gap-2 pt-1 sm:max-w-[320px]">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="h-12 rounded-xl bg-text-primary px-5 font-sans text-[14px] font-semibold text-text-on-inverse transition-all duration-150 ease-out hover:bg-text-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-card disabled:cursor-not-allowed disabled:opacity-60"
        >
          Yes, that's them
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={busy}
          className="h-11 rounded-xl bg-surface-raised px-5 font-sans text-[13px] font-semibold text-text-secondary transition-colors duration-150 ease-out hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-60"
        >
          Wrong person, go back
        </button>
      </div>
    </div>
  );
}
