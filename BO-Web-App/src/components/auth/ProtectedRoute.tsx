import { Navigate, Outlet, useLocation } from "react-router-dom";
import { session } from "@/lib/auth/session";

/**
 * Gate for any route that requires a valid backoffice session.
 * Stores the original target so the login page can bounce the user back
 * to where they wanted to go after a successful sign-in.
 */
export function ProtectedRoute() {
  const location = useLocation();
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
