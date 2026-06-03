import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/cn";
import { withDemo } from "@/lib/demoMode";
import { resolveBackendUrl } from "@/lib/backendUrl";
import { PayZoWordmark } from "@/components/ui/PayZoWordmark";
import { NotificationsBell } from "@/components/layout/NotificationsBell";

export type TopBarVariant = "dark" | "light";

export interface TopBarUser {
  /** 1–2 character avatar fallback when no profile picture is set. */
  initials: string;
  /** Trust score 0–100 (D38). Hides the chip when missing. */
  trustScore?: number;
  /**
   * Server-relative profile picture URL (e.g.
   * {@code /api/v1/uploads/profile-pictures/{id}.jpg}). When set, the
   * avatar button renders the image; otherwise it falls back to the
   * initials. Resolution against the API origin is handled here, so
   * pages just pass {@code me.profilePictureUrl} from MeProvider.
   */
  profilePictureUrl?: string | null;
}

interface TopBarProps {
  /** Bold-18 page name. On the dashboard this becomes "Welcome back, …". */
  pageName: string;
  /**
   * Optional secondary line under the page name (e.g. the dashboard's
   * formatted date). When set, the divider after the wordmark is
   * suppressed and the gap between logo and text widens to match the
   * dashboard layout (Figma 109:3).
   */
  subtitle?: string;
  /** Visual variant — dark navy on internal pages, light cream on
   *  maintenance / 404 / blocked. Defaults to dark. */
  variant?: TopBarVariant;
  /** Render the back-arrow square. Defaults to true. */
  showBack?: boolean;
  /** Called when back is clicked. Defaults to navigating to `/dashboard`
   *  — every authenticated client page sits one level under the
   *  dashboard, so back is always "go home" rather than browser
   *  history (which can leave the user nowhere if they hit the page
   *  via a direct URL). */
  onBack?: () => void;
  /**
   * Authenticated user — when provided, renders the trust chip + bell +
   * avatar on the right. When missing, the right side stays empty so
   * the same TopBar works on unauthenticated maintenance / 404 pages.
   */
  me?: TopBarUser | null;
  /** Avatar click handler. Opens the profile menu (page-managed). */
  onAvatarClick?: () => void;
}

/**
 * Top navigation bar — Figma 330:47 (dark) and 273:3 (light).
 *
 * Layout: 72px tall, 32px horizontal padding, `border-b` against the
 * page bg, `flex items-center`. Left cluster: 40px back square + 36px
 * PayZo wordmark + 1px divider + 18px page name. Right cluster: trust
 * chip + bell + 40px avatar circle. The right cluster collapses out
 * when `me` is null.
 */
export function TopBar({
  pageName,
  subtitle,
  variant = "dark",
  showBack = true,
  onBack,
  me,
  onAvatarClick,
}: TopBarProps) {
  const navigate = useNavigate();
  const handleBack = onBack ?? (() => navigate(withDemo("/dashboard")));

  const isDark = variant === "dark";
  // Dashboard layout (subtitle present) wants more space between the
  // wordmark and the welcome stack, and drops the divider entirely.
  const hasSubtitle = !!subtitle;

  return (
    <header
      className={cn(
        "flex h-[72px] w-full shrink-0 items-center border-b px-4 sm:px-8",
        isDark
          ? "bg-surface-inverse border-white/8 text-text-on-inverse"
          : "bg-surface-soft border-border-soft text-text-primary",
      )}
    >
      {/* ─── Left cluster ───────────────────────────────────────── */}
      <div
        className={cn(
          "flex min-w-0 items-center",
          hasSubtitle ? "gap-3 sm:gap-7" : "gap-3 sm:gap-5",
        )}
      >
        {showBack && (
          <button
            type="button"
            onClick={handleBack}
            aria-label="Go back"
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-[10px] border transition-colors duration-150 ease-out",
              isDark
                ? "border-white/12 text-brand-teal hover:bg-white/5"
                : "border-border text-accent hover:bg-surface-card",
            )}
          >
            <ArrowLeft className="size-4" strokeWidth={2.4} aria-hidden />
          </button>
        )}

        <PayZoWordmark
          className={cn(
            "h-9 w-auto shrink-0",
            isDark ? "text-text-on-inverse" : "text-accent",
          )}
        />

        {/* Divider only when we don't have the dashboard's welcome stack. */}
        {!hasSubtitle && (
          <div
            aria-hidden
            className={cn(
              "h-6 w-px shrink-0",
              isDark ? "bg-white/12" : "bg-border",
            )}
          />
        )}

        <div className="flex min-w-0 flex-col gap-0.5">
          <h1
            className={cn(
              "truncate font-sans text-[16px] font-bold sm:text-[18px]",
              isDark ? "text-text-on-inverse" : "text-text-primary",
            )}
          >
            {pageName}
          </h1>
          {hasSubtitle && (
            <p
              className={cn(
                "truncate font-sans text-[12px]",
                isDark ? "text-white/60" : "text-text-muted",
              )}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="flex-1" />

      {/* ─── Right cluster (only when authed) ───────────────────── */}
      {me && (
        <div className="flex items-center gap-3 sm:gap-3.5">
          {typeof me.trustScore === "number" &&
            (() => {
              // Bands per DECISIONS.md D12 / FRONTEND_COMPONENTS §1.5.
              const band = trustBandFor(me.trustScore);
              return (
                <div className="group relative hidden sm:block">
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-full border px-3.5 py-2",
                      isDark
                        ? "border-white/8 bg-accent"
                        : "border-border-soft bg-surface-card",
                    )}
                    aria-label={`Trust score ${me.trustScore} — ${band.message}`}
                    role="status"
                  >
                    <span
                      className={cn("size-2.5 rounded-full", band.dotClass)}
                      aria-hidden
                    />
                    <span
                      className={cn(
                        "font-sans text-[11px] font-medium uppercase tracking-[0.08em]",
                        isDark ? "text-white/60" : "text-text-muted",
                      )}
                    >
                      Trust
                    </span>
                    <span
                      className={cn(
                        "font-mono text-[14px]",
                        isDark ? "text-text-on-inverse" : "text-text-primary",
                      )}
                    >
                      {me.trustScore}
                    </span>
                  </div>

                  {/* Hover tooltip — message + band stamp. Tailwind
                      `group-hover` is enough; no JS state needed.
                      `pointer-events-none` is critical: the tooltip is
                      `absolute right-0` so its (invisible-by-default)
                      box extends to the LEFT of the pill, which would
                      otherwise count as hovering the group when the
                      cursor was nowhere near the pill itself. */}
                  <div
                    role="tooltip"
                    className="pointer-events-none absolute right-0 top-full z-50 mt-2 origin-top-right scale-95 rounded-md bg-surface-inverse px-3 py-2 opacity-0 shadow-[0px_8px_24px_-6px_rgba(14,27,44,0.32)] transition-all duration-150 ease-out group-hover:scale-100 group-hover:opacity-100"
                  >
                    <p
                      className={cn(
                        "mb-0.5 font-sans text-[10px] font-bold uppercase tracking-[0.08em]",
                        band.labelClass,
                      )}
                      style={{ fontVariationSettings: "'wdth' 100" }}
                    >
                      {band.label}
                    </p>
                    <p className="whitespace-nowrap font-sans text-[12px] text-text-on-inverse">
                      {band.message}
                    </p>
                  </div>
                </div>
              );
            })()}

          <NotificationsBell variant={variant} />

          <button
            type="button"
            onClick={onAvatarClick}
            aria-label="Account menu"
            className={cn(
              "flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full font-sans text-[14px] font-bold transition-transform duration-150 ease-out hover:scale-[1.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
              isDark
                ? "bg-brand-teal text-text-primary focus-visible:ring-brand-teal/60 focus-visible:ring-offset-surface-inverse"
                : "bg-accent text-accent-foreground focus-visible:ring-accent/40 focus-visible:ring-offset-surface-soft",
            )}
          >
            {me.profilePictureUrl ? (
              <img
                src={resolveBackendUrl(me.profilePictureUrl)}
                alt=""
                className="size-full object-cover"
              />
            ) : (
              me.initials
            )}
          </button>
        </div>
      )}
    </header>
  );
}

/* ─── Trust-score bands ───────────────────────────────────────────────── */

interface TrustBand {
  label: string;
  message: string;
  /** Tailwind class for the colored dot inside the trust pill. */
  dotClass: string;
  /** Tailwind class for the band label inside the tooltip. */
  labelClass: string;
}

/**
 * DECISIONS.md D12 / D38 + FRONTEND_COMPONENTS.md §1.5.
 *
 * Score 0–100 → 4 visual bands. Mechanics: every approved client
 * starts at 50; +1 per clean (LOW) incoming transfer; −1/−5 when
 * a MED/HIGH alert on a transfer-to-you is cleared by an analyst,
 * −3/−10 when one is confirmed as fraud. The score is exposed to
 * senders on the recipient-confirmation step (Impact 7), so each
 * tooltip is written from the perspective of "what other users
 * see when they're about to pay you" — not generic flattery.
 *
 * The 80 / 50 / 20 boundaries match {@code util/TrustBands.java}
 * on the BE (3 bands there, 4 here — the extra split between 80
 * and 50 is purely visual).
 */
function trustBandFor(score: number): TrustBand {
  if (score >= 80) {
    return {
      label: "Excellent",
      message:
        "Clean transfer history. Senders see you as a highly trusted recipient.",
      dotClass: "bg-positive",
      labelClass: "text-positive",
    };
  }
  if (score >= 50) {
    return {
      label: "Good",
      message:
        "Standard trust. Every new account starts at 50 — it climbs with clean incoming transfers.",
      dotClass: "bg-brand-teal",
      labelClass: "text-brand-teal",
    };
  }
  if (score >= 20) {
    return {
      label: "Caution",
      message:
        "Past fraud signals on transfers to your account. Senders see this score before paying you.",
      dotClass: "bg-warning",
      labelClass: "text-warning",
    };
  }
  return {
    label: "At risk",
    message:
      "Repeated confirmed fraud on incoming transfers. Senders are warned before paying you, and outgoing transfers face extra scrutiny.",
    dotClass: "bg-negative",
    labelClass: "text-negative",
  };
}
