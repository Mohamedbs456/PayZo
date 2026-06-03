import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { session } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/demoMode";

/**
 * Gate for any route that requires a valid client session.
 * Stores the original target so the login page can bounce the user back
 * to where they wanted to go after a successful sign-in.
 *
 * Demo mode (`?demo`) bypasses the gate so internal pages are
 * walkable without a real Keycloak session — same opt-in as the
 * sign-up / forgot-pw flows.
 *
 * Side-effect: sets `data-app-section="internal"` on <html> while the
 * user is on an authenticated page. The dark-mode overrides in
 * `index.css` are gated on that attribute so public/auth pages always
 * stay in the light palette regardless of the user's theme choice.
 */
export function ProtectedRoute() {
  const location = useLocation();
  useEffect(() => {
    document.documentElement.dataset.appSection = "internal";
    return () => {
      delete document.documentElement.dataset.appSection;
    };
  }, []);
  if (isDemoMode()) return <Outlet />;
  if (!session.isAuthenticated()) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }
  return <Outlet />;
}
