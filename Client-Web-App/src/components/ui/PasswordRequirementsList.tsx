import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { evaluatePassword } from "@/features/me/passwordPolicy";

interface PasswordRequirementsListProps {
  /** The current password value to evaluate against the policy. */
  value: string;
  /** When true, untouched (ungreened) rules render a danger dot rather than a neutral one — used after a submit attempt. */
  showInvalidAsDanger?: boolean;
}

/**
 * Live checklist of the canonical password rules
 * (`features/me/passwordPolicy.ts`). Pending = light raised dot with a
 * subtle border; passed = positive-soft fill with a Lucide Check.
 * Matches Figma node 277:138 — `PASSWORD MUST HAVE` eyebrow + 4 rows.
 */
export function PasswordRequirementsList({
  value,
  showInvalidAsDanger = false,
}: PasswordRequirementsListProps) {
  const checks = evaluatePassword(value);
  return (
    <div className="flex w-full flex-col gap-1.5 pt-1">
      <p className="font-sans text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">
        Password must have
      </p>
      {checks.map((c) => (
        <div key={c.id} className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn(
              "flex size-3.5 items-center justify-center rounded-[7px] border transition-colors duration-150 ease-out",
              c.passed && "border-positive bg-positive-soft text-positive",
              !c.passed && !showInvalidAsDanger && "border-border-soft bg-surface-raised text-transparent",
              !c.passed && showInvalidAsDanger && "border-negative/30 bg-negative/5 text-transparent",
            )}
          >
            {c.passed && <Check className="size-2.5" strokeWidth={3} />}
          </span>
          <span
            className={cn(
              "font-sans text-[12px]",
              c.passed ? "text-text-secondary" : "text-text-secondary",
            )}
          >
            {c.label}
          </span>
        </div>
      ))}
    </div>
  );
}
