import {
  AuthBrandPanel,
  AuthBrandStrip,
} from "@/features/auth/components/AuthBrandPanel";
import { LoginForm } from "@/features/auth/LoginForm";

/**
 * Layout shell — mirrors the backoffice login (LoginPage.tsx in BO-Web-App).
 *
 *   • `h-dvh w-screen overflow-hidden` makes the auth screen non-scrolling
 *     at the document level. The form pane keeps an `overflow-y-auto`
 *     escape hatch for very short viewports (e.g. iOS keyboard up).
 *   • Below md the brand panel collapses into a 112px horizontal strip
 *     (same gradient, wordmark + tagline) that sits above the form.
 *   • At md+ the side panel is `clamp(320,38vw,440)` wide; at lg+
 *     `clamp(420,40vw,580)` — same scaling as the backoffice.
 */
export function LoginPage() {
  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-surface-soft md:flex-row">
      <AuthBrandStrip />
      <AuthBrandPanel />

      <main className="flex h-full min-h-0 flex-1 items-center justify-center overflow-y-auto bg-surface-soft p-6 sm:p-10 lg:p-20">
        <div className="w-full max-w-[440px]">
          <LoginForm />
        </div>
      </main>
    </div>
  );
}
