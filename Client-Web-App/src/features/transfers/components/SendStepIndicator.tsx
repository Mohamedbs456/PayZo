import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

interface SendStepIndicatorProps {
  current: 1 | 2 | 3 | 4;
}

/**
 * Compact 4-chip stepper for the send-to-someone flow.
 * 1: Pick recipient · 2: Amount · 3: OTP · 4: Outcome.
 */
export function SendStepIndicator({ current }: SendStepIndicatorProps) {
  return (
    <ol className="flex items-center gap-2">
      {([1, 2, 3, 4] as const).map((step, idx) => {
        const status =
          step < current ? "done" : step === current ? "active" : "todo";
        return (
          <li key={step} className="flex items-center gap-2">
            <span
              aria-current={status === "active" ? "step" : undefined}
              className={cn(
                "relative flex size-6 shrink-0 items-center justify-center rounded-[12px] font-sans text-[11px] font-bold transition-[background-color,color,transform] duration-300 ease-out",
                status === "done" && "bg-positive text-white",
                status === "active" && "scale-110 bg-accent text-accent-foreground shadow-[0_0_0_4px_var(--color-accent-soft)]",
                status === "todo" && "bg-surface-raised text-text-muted",
              )}
            >
              <Check
                aria-hidden
                strokeWidth={3}
                className={cn(
                  "absolute size-3 transition-opacity duration-200 ease-out",
                  status === "done" ? "opacity-100" : "opacity-0",
                )}
              />
              <span
                aria-hidden
                className={cn(
                  "absolute transition-opacity duration-200 ease-out",
                  status === "done" ? "opacity-0" : "opacity-100",
                )}
              >
                {step}
              </span>
              {status === "active" && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 animate-step-ping rounded-[12px] bg-accent/30"
                />
              )}
            </span>
            {idx < 3 && (
              <span
                aria-hidden
                className="relative block h-0.5 w-6 overflow-hidden rounded-full bg-border-soft"
              >
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-0 origin-left bg-positive transition-transform duration-500 ease-out",
                    step < current ? "scale-x-100" : "scale-x-0",
                  )}
                />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
