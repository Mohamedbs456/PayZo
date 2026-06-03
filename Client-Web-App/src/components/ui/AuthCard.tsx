import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * White rounded card on cream — the chrome wrapper used by every
 * forgot-password page (Figma node 277:10). 20px radius, 28px gap
 * between sections, 40px padding (24px on small viewports), subtle
 * shadow that works against the cream page bg.
 */
export function AuthCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full max-w-[560px] flex-col gap-7 rounded-[20px] border border-border-soft bg-surface-card p-6 shadow-[0px_4px_16px_0px_rgba(14,27,44,0.06)] sm:p-10",
        className,
      )}
    >
      {children}
    </div>
  );
}
