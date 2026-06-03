import shieldUrl from "@/assets/payzo-shield.svg";

/**
 * Brand panel for the forgot-password flow (Figma 278:50 / 278:74 /
 * 278:92). Same gradient + footer as the login panel; the body
 * differs:
 *
 *   - Smaller shield top-left (270×240 in Figma — 46% of panel width
 *     here, capped at 300px / 28vh).
 *   - Centered "RESET YOUR PASSWORD" eyebrow + a 2-line description
 *     ("We'll guide you through three quick steps. Have your CIN ready
 *     and access to your email or phone.").
 *   - No headline, no stepper — the per-step stepper lives inside the
 *     form card on the right.
 *
 * `<AuthBrandStrip />` (the horizontal wordmark) handles <md viewports;
 * exported from `./AuthBrandPanel.tsx`.
 */
export function ResetPasswordBrandPanel() {
  return (
    <aside
      className="relative hidden h-full shrink-0 flex-col items-start overflow-hidden p-8 md:flex md:w-[clamp(320px,38vw,440px)] lg:w-[clamp(420px,40vw,580px)] lg:px-14 lg:py-12"
      style={{ backgroundImage: "var(--gradient-brand)" }}
      aria-hidden
    >
      <img
        src={shieldUrl}
        alt=""
        className="block h-auto w-[min(46%,300px)] max-h-[28vh] object-contain"
      />

      {/* Centered eyebrow + description — `mt-[15vh]` keeps them
          roughly mid-panel vertically while the footer pins the
          bottom. Self-aligned to override the parent `items-start`. */}
      <div className="mt-[15vh] flex w-full flex-col items-center gap-3 self-stretch text-center">
        <p
          className="font-sans text-[13px] font-bold uppercase tracking-[0.18em] text-brand-teal"
          style={{ fontVariationSettings: "'wdth' 100" }}
        >
          Reset your password
        </p>
        <p className="max-w-[380px] text-[14px] leading-[1.6] text-accent-soft">
          We'll guide you through three quick steps. Have your CIN ready and
          access to your email or phone.
        </p>
      </div>

      <div className="min-h-0 flex-1" />

      <p className="whitespace-pre font-sans text-[11px] text-text-on-inverse/45">
        © 2026 PayZo  ·  FSM  ·  Proxym
      </p>
    </aside>
  );
}
