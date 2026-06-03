import shieldUrl from "@/assets/payzo-shield.svg";
import wordmarkUrl from "@/assets/payzo-wordmark.svg";

/**
 * Brand chrome for the auth pages — split into two surfaces sharing the
 * same gradient so the visual identity is continuous across breakpoints:
 *
 *   <md  →  <BrandStrip />  : 112px horizontal header, wordmark + tagline
 *   ≥md  →  <BrandPanel />  : full-height side panel, brand mark + bottom block
 *
 * Sizing mirrors the backoffice login (Figma 76:2) so the two apps stay
 * pixel-aligned across the responsive breakpoints. Two distinct assets:
 *   - payzo-shield.svg (468x402, ~1.16:1) — stacked brand mark for the
 *     side panel.
 *   - payzo-wordmark.svg (1067x307, ~3.48:1, Figma 324:2) — horizontal
 *     shield + "PayZo" lockup for the narrow-viewport strip; reads as
 *     a wordmark at h=40 like the backoffice equivalent.
 */

const TAGLINE_INLINE = "—   EASY   •   INTELLIGENT   •   TRUSTED   —";
const TAGLINE_COMPACT = "EASY · INTELLIGENT · TRUSTED";
const FOOTER = "© 2026 PayZo  ·  FSM  ·  Proxym";

/** Compact strip shown only below md — replaces the full brand panel. */
export function AuthBrandStrip() {
  return (
    <header
      className="relative flex h-[112px] shrink-0 flex-col items-center justify-center gap-2 px-6 md:hidden"
      style={{ backgroundImage: "var(--gradient-brand)" }}
      aria-hidden
    >
      <img
        src={wordmarkUrl}
        alt=""
        className="block h-[40px] w-auto shrink-0"
      />
      <p
        className="font-sans text-[10px] font-medium tracking-[0.14em] text-text-on-inverse"
        style={{ fontVariationSettings: "'wdth' 100" }}
      >
        {TAGLINE_COMPACT}
      </p>
    </header>
  );
}

/** Full brand panel shown at md and above (split-panel layout). */
export function AuthBrandPanel() {
  return (
    <aside
      className="relative hidden h-full shrink-0 flex-col items-center overflow-hidden p-8 md:flex md:w-[clamp(320px,38vw,440px)] lg:w-[clamp(420px,40vw,580px)] lg:px-14 lg:py-12"
      style={{ backgroundImage: "var(--gradient-brand)" }}
      aria-hidden
    >
      {/* Centered brand mark + tagline, lifted slightly above true center
          (mt-[8vh] mb-auto pushes the bottom block to the bottom).
          Width nudged from the backoffice's 78%/440 → 82%/460 because
          the client shield is 1.16:1 vs the backoffice mark's 1.12:1 —
          so at the same width it'd render ~4% shorter and look squat. */}
      <div className="mt-[8vh] mb-auto flex w-full flex-col items-center gap-2 lg:gap-3">
        <img
          src={shieldUrl}
          alt=""
          className="block h-auto w-[min(82%,460px)] max-h-[46vh] object-contain"
        />
        <p
          className="whitespace-nowrap font-sans text-[clamp(13px,1.1vw,17px)] font-medium tracking-[0.12em] text-text-on-inverse"
          style={{ fontVariationSettings: "'wdth' 100" }}
        >
          {TAGLINE_INLINE}
        </p>
      </div>

      {/* Bottom block — eyebrow + headline + description + footer. */}
      <div className="flex w-full flex-col gap-4">
        <p
          className="font-sans text-[11px] font-medium uppercase tracking-[0.12em] text-brand-teal"
          style={{ fontVariationSettings: "'wdth' 100" }}
        >
          Tunisian digital banking
        </p>
        <h2 className="font-sans text-[clamp(22px,2.3vw,32px)] font-bold leading-[1.18] tracking-tight text-text-on-inverse">
          <span className="block">
            <span className="text-brand-teal">P</span>owered by intelligence.
          </span>
          <span className="block">
            <span className="text-brand-teal">Z</span>ero fraud tolerance.
          </span>
        </h2>
        <p className="hidden max-w-[420px] text-[14px] leading-[1.6] text-text-on-inverse/70 lg:block">
          Send money across Tunisian banks in seconds — ML-guarded with
          real-time fraud detection.
        </p>
        <p className="mt-6 whitespace-pre font-sans text-[11px] text-text-on-inverse/45">
          {FOOTER}
        </p>
      </div>
    </aside>
  );
}
