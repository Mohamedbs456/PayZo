import { useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastProvider } from "@/components/ui/Toast";
import { MeProvider } from "@/features/me/MeProvider";
import { applyDarkMode, getDarkMode, getLocale } from "@/lib/clientPrefs";
import { useCrossTabLogout } from "@/lib/auth/useCrossTabLogout";
import { router } from "@/app/router";

/** Root provider chain: ErrorBoundary > ToastProvider > MeProvider > RouterProvider, with theme + locale applied on first mount. */
export function App() {
  // Apply the persisted theme + locale before any page mounts so they
  // don't flash light/EN before reverting to the user's choice.
  useEffect(() => {
    applyDarkMode(getDarkMode());
    document.documentElement.lang = getLocale();
  }, []);

  // Cross-tab logout — if the user signs out in tab A, tab B sees the
  // session-storage key wipe and reloads itself onto /login so it doesn't
  // keep hitting the API with a token that's now revoked server-side.
  useCrossTabLogout();

  return (
    <ErrorBoundary>
      <ToastProvider>
        <MeProvider>
          <RouterProvider router={router} />
        </MeProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
