import type { ReactNode } from "react";
import { AuthBrandStrip } from "@/features/auth/components/AuthBrandPanel";
import { ResetPasswordBrandPanel } from "@/features/auth/components/ResetPasswordBrandPanel";
import { AuthCard } from "@/components/ui/AuthCard";
import {
  ResetPasswordStepper,
  type ResetStep,
} from "@/features/auth/components/ResetPasswordStepper";

interface ResetPasswordLayoutProps {
  current: ResetStep;
  /** Card-body content. Stepper is prepended automatically. */
  children: ReactNode;
}

/**
 * Page shell for the forgot-password flow. Same `h-dvh + overflow-hidden`
 * non-scrolling chrome as login / sign-up — what's different here is the
 * form area: a centered white `<AuthCard />` on cream rather than a flat
 * form panel. The horizontal stepper lives at the top of every card.
 */
export function ResetPasswordLayout({
  current,
  children,
}: ResetPasswordLayoutProps) {
  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-surface-soft md:flex-row">
      <AuthBrandStrip />
      <ResetPasswordBrandPanel />

      <main className="flex h-full min-h-0 flex-1 items-center justify-center overflow-y-auto bg-surface-soft p-6 sm:p-10 lg:p-16">
        <AuthCard>
          <ResetPasswordStepper current={current} />
          {children}
        </AuthCard>
      </main>
    </div>
  );
}
