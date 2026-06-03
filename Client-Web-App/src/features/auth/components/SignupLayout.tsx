import type { ReactNode } from "react";
import { AuthBrandStrip } from "@/features/auth/components/AuthBrandPanel";
import { SignupBrandPanel } from "@/features/auth/components/SignupBrandPanel";
import type { SignupStep } from "@/features/auth/components/SignupStepper";

interface SignupLayoutProps {
  current: SignupStep;
  /** Form-panel content. Constrained to 480px max width. */
  children: ReactNode;
}

/**
 * Shared shell for every sign-up page — same h-dvh + overflow-hidden
 * non-scrolling layout as `<LoginPage />`. Body never scrolls; the form
 * panel keeps an `overflow-y-auto` escape hatch for very short viewports.
 *
 * Below md the brand panel collapses out and the horizontal wordmark
 * strip takes over — identical breakpoint behavior to login.
 */
export function SignupLayout({ current, children }: SignupLayoutProps) {
  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-surface-soft md:flex-row">
      <AuthBrandStrip />
      <SignupBrandPanel current={current} />

      <main className="flex h-full min-h-0 flex-1 items-center justify-center overflow-y-auto bg-surface-soft p-6 sm:p-10 lg:p-20">
        <div className="w-full max-w-[480px]">{children}</div>
      </main>
    </div>
  );
}
