import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export type SignupStep = 1 | 2 | 3;

const STEP_LABELS: Record<SignupStep, string> = {
  1: "Verify identity",
  2: "OTP verification",
  3: "Submitted",
};

interface SignupStepperProps {
  /** The currently active step (1, 2, or 3). Earlier steps render as done. */
  current: SignupStep;
}

/**
 * 3-row vertical stepper rendered inside the sign-up brand panel
 * (Figma node 77:13). Past steps show a positive-tinted check; the
 * current step is filled cream with a navy digit; future steps are
 * outlined with low-opacity text.
 */
export function SignupStepper({ current }: SignupStepperProps) {
  return (
    <ol className="flex flex-col gap-5">
      {([1, 2, 3] as const).map((step) => {
        const status =
          step < current ? "done" : step === current ? "active" : "todo";
        return (
          <li key={step} className="flex items-center gap-3.5">
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full font-sans text-[13px] font-bold",
                status === "done" && "bg-positive text-text-primary",
                status === "active" && "bg-text-on-inverse text-text-primary",
                status === "todo" &&
                  "border-[1.5px] border-white/30 text-white/40",
              )}
            >
              {status === "done" ? (
                <Check className="size-3.5" strokeWidth={2.4} aria-hidden />
              ) : (
                step
              )}
            </span>
            <span
              className={cn(
                "font-sans text-[13px]",
                status === "done" && "font-medium text-white/85",
                status === "active" && "font-semibold text-text-on-inverse",
                status === "todo" && "font-medium text-white/40",
              )}
            >
              {STEP_LABELS[step]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
