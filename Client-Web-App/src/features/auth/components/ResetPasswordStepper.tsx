import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export type ResetStep = 1 | 2 | 3;

const STEP_LABELS: Record<ResetStep, string> = {
  1: "Identify",
  2: "Enter code",
  3: "New password",
};

/**
 * Horizontal stepper rendered at the top of every forgot-password card
 * (Figma 277:11 / 277:51 / 277:111). Three small chips with connecting
 * lines:
 *
 *   - done   → success-tinted chip + Check, success line to next chip
 *   - active → accent-tinted chip + digit (bold), default line to next
 *   - todo   → raised-bg chip + muted digit, default line
 *
 * Connecting line color tracks the *previous* step's status: a line is
 * success-tinted when both the step before AND the step after are
 * "done"-or-"active" — i.e. the user has already passed it.
 */
export function ResetPasswordStepper({ current }: { current: ResetStep }) {
  return (
    <ol className="flex items-center gap-3.5">
      {([1, 2, 3] as const).map((step, idx) => {
        const status =
          step < current ? "done" : step === current ? "active" : "todo";
        return (
          <li key={step} className="flex items-center gap-3.5">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-[12px] font-sans text-[11px] font-bold",
                  status === "done" && "bg-positive text-text-on-inverse",
                  status === "active" && "bg-accent text-text-on-inverse",
                  status === "todo" && "bg-surface-raised text-text-muted",
                )}
              >
                {status === "done" ? (
                  <Check className="size-3" strokeWidth={3} aria-hidden />
                ) : (
                  step
                )}
              </span>
              <span
                className={cn(
                  "whitespace-nowrap font-sans text-[13px]",
                  status === "active"
                    ? "font-bold text-text-primary"
                    : "font-semibold text-text-secondary",
                )}
              >
                {STEP_LABELS[step]}
              </span>
            </div>
            {idx < 2 && (
              <span
                aria-hidden
                className={cn(
                  "h-0.5 w-6 sm:w-8",
                  step < current ? "bg-positive" : "bg-border-soft",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
