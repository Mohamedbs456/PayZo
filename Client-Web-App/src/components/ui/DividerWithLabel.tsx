import type { ReactNode } from "react";

interface DividerWithLabelProps {
  children: ReactNode;
}

/**
 * "—— LABEL ——" divider used between primary and secondary CTAs on the
 * auth pages. Matches Figma: 1px subtle rule, 11px medium label with
 * 0.88px tracking + uppercase.
 */
export function DividerWithLabel({ children }: DividerWithLabelProps) {
  return (
    <div className="flex w-full items-center gap-4">
      <div className="h-px flex-1 bg-border-soft" />
      <span className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
        {children}
      </span>
      <div className="h-px flex-1 bg-border-soft" />
    </div>
  );
}
