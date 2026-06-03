import { Link } from "react-router-dom";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import payzoBrandMark from "@/assets/payzo-brand-mark.svg";
import payzoWordmark from "@/assets/payzo-wordmark.svg";

const brandGradient =
  "linear-gradient(123.72048736889431deg, #2a1f14 0%, #7a4a28 39.286%, #b07840 71.429%)";

export function ForgotPasswordPage() {
  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-brand-cream md:flex-row">
      {/* Mobile brand strip */}
      <header
        className="relative flex h-[112px] shrink-0 flex-col items-center justify-center gap-2 px-6 md:hidden"
        style={{ backgroundImage: brandGradient }}
        aria-hidden
      >
        <img src={payzoWordmark} alt="" className="block h-[40px] w-auto shrink-0" />
        <p className="font-sans text-[10px] font-medium tracking-[1.4px] text-brand-cream">
          CONTROL · REVIEW · PROTECT
        </p>
      </header>

      {/* Brand panel — md and up */}
      <aside
        className="relative hidden h-full shrink-0 flex-col items-center overflow-hidden p-8 md:flex md:w-[clamp(320px,38vw,440px)] lg:w-[clamp(420px,40vw,580px)] lg:px-14 lg:py-12"
        style={{ backgroundImage: brandGradient }}
        aria-hidden
      >
        <div className="mt-[8vh] mb-auto flex w-full flex-col items-center gap-2 lg:gap-3">
          <img
            src={payzoBrandMark}
            alt=""
            className="block h-auto w-[min(78%,440px)] max-h-[42vh] object-contain"
          />
          <p className="whitespace-nowrap font-sans text-[clamp(13px,1.1vw,17px)] font-medium tracking-[0.68px] text-brand-cream">
            {"—   CONTROL   •   REVIEW   •   PROTECT   —"}
          </p>
        </div>
        <div className="flex w-full flex-col gap-4">
          <p
            className="font-display text-[clamp(13px,1.1vw,16px)] font-bold tracking-[1.92px] text-white"
            style={{ fontVariationSettings: "'wdth' 100" }}
          >
            BACKOFFICE STAFF ACCESS
          </p>
          <p className="hidden max-w-[420px] font-sans text-[14px] leading-[22px] text-white lg:block">
            Manage clients, decide on flagged transfers, and tune fraud-detection thresholds across PayZo. Internal staff access only.
          </p>
          <p className="mt-6 whitespace-pre font-sans text-[11px] text-white">
            {"© 2026 PayZo  ·  FSM  ·  Proxym"}
          </p>
        </div>
      </aside>

      {/* Content panel */}
      <main className="flex h-full min-h-0 flex-1 items-center justify-center overflow-y-auto bg-brand-cream p-6 sm:p-10 lg:p-20">
        <div className="flex w-full max-w-[400px] flex-col gap-8">
          {/* Header */}
          <div className="flex flex-col gap-1">
            <p className="font-sans text-[13px] font-semibold uppercase tracking-[1.6px] text-brand-medium">
              Password recovery
            </p>
            <h1 className="font-sans text-[28px] font-bold leading-tight text-text-primary">
              Reset your password
            </h1>
          </div>

          {/* Info card */}
          <div className="flex flex-col gap-4 rounded-2xl border border-brand-cream-2 bg-white p-6 shadow-[0_2px_8px_rgba(42,31,20,0.06)]">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-cream">
                <ShieldAlert className="size-4 text-brand-medium" strokeWidth={1.8} />
              </span>
              <div className="flex flex-col gap-1">
                <p className="font-sans text-[13px] font-semibold text-text-primary">
                  Contact your SuperAdmin
                </p>
                <p className="font-sans text-[12px] leading-relaxed text-text-muted">
                  Password resets for backoffice staff are managed by your SuperAdmin. Ask them to issue a new temporary password from the Staff Management panel.
                </p>
              </div>
            </div>

            <div className="h-px bg-brand-cream-2" />

            <div className="flex flex-col gap-2">
              <p className="font-sans text-[11px] font-semibold uppercase tracking-[1.2px] text-text-label">
                Steps to follow
              </p>
              {[
                "Contact your SuperAdmin by phone or in person.",
                "They open Staff Management → find your account.",
                "They reset your password and share the temporary one with you.",
                "Sign in and change it immediately from your Profile.",
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-cream font-mono text-[10px] font-bold text-brand-medium">
                    {i + 1}
                  </span>
                  <p className="font-sans text-[12px] leading-relaxed text-text-muted">{step}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Back link */}
          <Link
            to="/login"
            className="flex items-center gap-2 self-start font-sans text-[13px] font-semibold text-brand-medium transition-colors hover:text-brand-dark"
          >
            <ArrowLeft className="size-4" strokeWidth={2} />
            Back to sign in
          </Link>
        </div>
      </main>
    </div>
  );
}
