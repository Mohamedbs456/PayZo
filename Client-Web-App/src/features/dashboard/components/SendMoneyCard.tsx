import { ArrowRight, Send } from "lucide-react";
import { Link } from "react-router-dom";
import { withDemo } from "@/lib/demoMode";

/**
 * Right-side hero card (Figma 109:42). Title + 2-line description +
 * a big primary "Start a transfer" button anchored to the bottom.
 * Card height matches the gradient hero on the left.
 */
export function SendMoneyCard() {
  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden rounded-3xl border border-border-soft bg-surface-card p-5 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] sm:gap-5 sm:p-7">
      <h2 className="font-sans text-[clamp(22px,2.4vw,28px)] font-bold leading-tight tracking-tight text-text-primary">
        Send money
      </h2>
      <p className="font-sans text-[13px] leading-[1.5] text-text-secondary">
        Send to someone or transfer between your own accounts. ML-guarded,
        OTP-secured.
      </p>

      <Link
        to={withDemo("/transfers")}
        className="group mt-auto flex h-[68px] items-center justify-center gap-3 rounded-[18px] bg-accent px-6 font-sans text-[16px] font-extrabold text-accent-foreground shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] transition-all duration-150 ease-out hover:bg-accent/90 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-soft sm:h-[84px] sm:text-[18px]"
      >
        <Send className="size-5" strokeWidth={2.2} aria-hidden />
        <span>Start a transfer</span>
        <ArrowRight
          className="size-5 transition-transform duration-150 ease-out group-hover:translate-x-0.5"
          strokeWidth={2.4}
          aria-hidden
        />
      </Link>
    </div>
  );
}
