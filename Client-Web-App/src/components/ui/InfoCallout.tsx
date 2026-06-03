import { Info } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Light-cyan informational alert (Figma node 77:60). Used inline in forms
 * to provide context that isn't a hard validation error — e.g. "If anything
 * looks wrong, contact your bank to update your records."
 */
export function InfoCallout({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full items-start gap-2.5 rounded-[10px] bg-accent-soft px-3.5 py-3">
      <Info
        className="mt-0.5 size-4 shrink-0 text-accent"
        strokeWidth={1.8}
        aria-hidden
      />
      <p className="min-w-0 flex-1 font-sans text-[12px] leading-[1.5] text-text-secondary">
        {children}
      </p>
    </div>
  );
}
