import type { ReactNode } from "react";

interface Step {
  title: string;
  body: ReactNode;
}

interface WhatHappensNextCardProps {
  steps: Step[];
}

/**
 * Numbered "what happens next" panel rendered on the sign-up
 * confirmation screen (Figma node 77:156). Three rows by default —
 * each is an accent-soft chip + a title/body pair.
 */
export function WhatHappensNextCard({ steps }: WhatHappensNextCardProps) {
  return (
    <div className="flex w-full flex-col gap-4 rounded-[14px] border border-border-soft bg-surface-card px-7 py-6 text-left">
      <p className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
        What happens next
      </p>
      {steps.map((step, idx) => (
        <div key={idx} className="flex items-start gap-3.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft font-sans text-[13px] font-bold text-accent">
            {idx + 1}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="font-sans text-[13px] font-semibold text-text-primary">
              {step.title}
            </p>
            <p className="font-sans text-[12px] leading-[1.5] text-text-secondary">
              {step.body}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
