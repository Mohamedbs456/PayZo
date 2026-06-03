import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useEffect, useRef } from "react";
import { isClient, session } from "@/lib/auth/session";
import { useToast } from "@/components/ui/Toast";
import { isDemoMode } from "@/lib/demoMode";

/**
 * Layout-route guard — only allows users with the CLIENT realm role through.
 *
 * Today the client app has a single role, so this is mostly a sanity check
 * that the JWT contains the role we expected (i.e. that
 * `fullScopeAllowed=true` is set on `payzo-client-app` and KC actually
 * minted `realm_access.roles: ["CLIENT"]` in the access token). Lives
 * inside the authenticated portion of the router so unauthorized users
 * land on a real page (with chrome) rather than a flash of forbidden
 * content.
 *
 * If we ever introduce additional realm roles (e.g. merchant), accept an
 * `allow` prop here and mirror the backoffice's `BoRole[]` shape.
 */
export function ClientOnlyRoute() {
  const location = useLocation();
  const demo = isDemoMode();
  const currentSession = session.get();
  const allowed = demo || isClient(currentSession);
  const toast = useToast();
  const firedRef = useRef(false);

  useEffect(() => {
    if (allowed || firedRef.current) return;
    // Only surface "Not authorized" when the user actually has a session
    // that lacks the CLIENT role (the real wrong-role case). When there's
    // no session at all — typically because the user just hit Sign out
    // (ProfilePanel cleared the session before navigating to /login) or
    // an expired session — we're just bouncing them to login, which
    // already shows its own page. Toasting "Not authorized" on top of the
    // sign-out's own "Signed out." toast was the duplicate.
    if (!session.isAuthenticated()) return;
    firedRef.current = true;
    toast.showToast({ tier: "danger", message: "Not authorized" });
  }, [allowed, toast]);

  if (!allowed) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // Key the authenticated subtree on the current Keycloak {@code sub}.
  // When user A signs out and user B signs in, the key changes →
  // React unmounts everything inside Outlet (every page's local
  // useState, every cached fetch result, every favorite-strip in-memory
  // list) and remounts a fresh tree against user B's data. This is the
  // "minor refresh" — far cheaper than {@code window.location.reload()}
  // (no JS reparse, no CSS re-fetch, no Vite HMR thrash) and scoped to
  // exactly the boundary where stale state leaks: a user-identity
  // change. Same-user navigation (Dashboard ↔ Transactions ↔ etc.)
  // keeps the key stable so the existing in-page state survives, and
  // the transfer-wizard step transitions live inside a single route
  // so the user-id key doesn't churn there either.
  const sessionKey = currentSession?.userId ?? "anonymous";
  return <Outlet key={sessionKey} />;
}
