import shieldUrl from "@/assets/payzo-shield.svg";
import { SignupStepper, type SignupStep } from "@/features/auth/components/SignupStepper";

/**
 * Sign-up variant of the auth brand panel (Figma 77:5 / 77:67 / 94:6 / 77:127).
 *
 * Differences from the login `<AuthBrandPanel />`:
 *   - Smaller shield, anchored at the top rather than vertically centered
 *   - Headline + description sit directly under the shield (no spacer push)
 *   - 3-step indicator below the headline, driven by the `current` prop
 *   - No "EASY · INTELLIGENT · TRUSTED" tagline (the stepper replaces it)
 *
 * Same `<AuthBrandStrip />` is used below md, exported from
 * `./AuthBrandPanel.tsx` — sign-up pages render the strip + this panel
 * via the shared layout shell.
 */
interface SignupBrandPanelProps {
  current: SignupStep;
}

export function SignupBrandPanel({ current }: SignupBrandPanelProps) {
  return (
    <aside
      className="relative hidden h-full shrink-0 flex-col items-start overflow-hidden p-8 md:flex md:w-[clamp(320px,38vw,440px)] lg:w-[clamp(420px,40vw,580px)] lg:px-14 lg:py-12"
      style={{ backgroundImage: "var(--gradient-brand)" }}
      aria-hidden
    >
      {/* Shield — width-based; 46% of panel mirrors Figma's 270/580 ratio. */}
      <img
        src={shieldUrl}
        alt=""
        className="block h-auto w-[min(46%,300px)] max-h-[28vh] object-contain"
      />

      {/* Headline group */}
      <div className="mt-10 flex flex-col gap-4">
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
      </div>

      {/* Stepper — positioned below the headline; pushes the footer down. */}
      <div className="mt-10">
        <SignupStepper current={current} />
      </div>

      <div className="min-h-0 flex-1" />

      <p className="whitespace-pre font-sans text-[11px] text-text-on-inverse/45">
        © 2026 PayZo  ·  FSM  ·  Proxym
      </p>
    </aside>
  );
}
