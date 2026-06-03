import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useEffect, useRef } from "react";
import type { BoRole } from "@/lib/auth/types";
import { primaryRole } from "@/lib/auth/session";
import { useToast } from "@/components/ui/Toast";

interface RoleRouteProps {
  allow: BoRole[];
  /** Where to send users who fail the check. Defaults to /dashboard. */
  redirectTo?: string;
}

/**
 * Layout-route guard that gates a subtree by role. Sits *inside* the
 * authenticated portion of the router (after `<ProtectedRoute>` + `<RootLayout>`)
 * so unauthorized users land on a real page (with chrome) rather than a flash
 * of forbidden content.
 *
 * Behavior:
 *  - role allowed → renders <Outlet/>
 *  - role denied  → redirect (default /dashboard) + one-shot "Not authorized"
 *    toast (the ref guard prevents the toast firing twice on remounts).
 */
export function RoleRoute({ allow, redirectTo = "/dashboard" }: RoleRouteProps) {
  const location = useLocation();
  const role = primaryRole();
  const allowed = role !== null && allow.includes(role);
  const toast = useToast();
  const firedRef = useRef(false);

  useEffect(() => {
    if (!allowed && !firedRef.current) {
      firedRef.current = true;
      toast.showToast({ tier: "danger", message: "Not authorized" });
    }
  }, [allowed, toast]);

  if (!allowed) {
    return <Navigate to={redirectTo} replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
