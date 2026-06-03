import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ApiError } from "@/lib/api";
import { session } from "@/lib/auth/session";
import { DEMO_ME, isDemoMode } from "@/lib/demoMode";
import { getProfile, type ClientProfile } from "@/features/me/api";

interface MeContextValue {
  /** The current user. `null` when no session OR an unrecoverable load error. */
  me: ClientProfile | null;
  /** True only on the very first fetch after mount (or after an explicit refresh). */
  loading: boolean;
  /** Last hard error from `/client/profile`. Soft 401s are auto-retried by the api client. */
  error: ApiError | null;
  /** Force a refetch — used after profile-picture upload, password change, etc. */
  refresh: () => Promise<void>;
  /** Optimistic local patch — pair with `refresh()` after the server confirms. */
  patch: (updates: Partial<ClientProfile>) => void;
}

const MeContext = createContext<MeContextValue | null>(null);

/**
 * Wraps `GET /client/profile` and exposes the canonical `me` object to
 * any internal page. Mounted once at the App root (above the router) so
 * children — TopBar avatar, dashboard greeting, profile page, the
 * first-login modal gate — all read from the same cached snapshot.
 *
 * Behavior:
 *   - No session → `me=null`, no fetch fired.
 *   - Session exists → fetch on mount, set `me`. 401s clear the session
 *     and bounce the user via the api client's existing logic.
 *   - Demo mode → returns `DEMO_ME` immediately, never hits the wire.
 */
export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<ClientProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const refresh = useCallback(async () => {
    if (isDemoMode()) {
      // `?firstLogin` flips the demo me into the un-rotated state so
      // the dashboard's first-login modal can be previewed without a
      // real backend.
      const forceFirstLogin =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).has("firstLogin");
      setMe({
        ...(DEMO_ME satisfies ClientProfile),
        firstLoginCompleted: !forceFirstLogin,
      });
      setError(null);
      setLoading(false);
      return;
    }
    if (!session.isAuthenticated()) {
      setMe(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const profile = await getProfile();
      setMe(profile);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError) {
        // 401 means our session was rejected — the api client already
        // cleared sessionStorage. Treat as "no me" and let routing react.
        if (err.status === 401) {
          setMe(null);
          setError(null);
        } else {
          setError(err);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // MeProvider sits ABOVE the authenticated route subtree (so it's
  // available to public auth pages too), which means it stays mounted
  // across login/logout. Without an explicit identity-change trigger
  // it would keep serving user A's cached profile after user B signs
  // in. Reading the session's userId on every render and using it as
  // the effect's dependency means we refetch exactly when the
  // identity changes (initial mount, login, logout, re-login as
  // someone else). The `session.get()` call is cheap — one
  // JSON.parse, no network.
  const sessionUserId = session.get()?.userId ?? null;
  useEffect(() => {
    void refresh();
  }, [refresh, sessionUserId]);

  const patch = useCallback((updates: Partial<ClientProfile>) => {
    setMe((current) => (current ? { ...current, ...updates } : current));
  }, []);

  const value = useMemo<MeContextValue>(
    () => ({ me, loading, error, refresh, patch }),
    [me, loading, error, refresh, patch],
  );

  return <MeContext.Provider value={value}>{children}</MeContext.Provider>;
}

/**
 * Hook for accessing the current user. Throws when used outside the
 * provider — every internal page mounts under MeProvider so this is
 * always safe; missing-provider only ever happens on a public auth page
 * by mistake (caught at dev time).
 */
export function useMe(): MeContextValue {
  const ctx = useContext(MeContext);
  if (!ctx) {
    throw new Error("useMe() must be used inside <MeProvider>");
  }
  return ctx;
}

/**
 * Lightweight initials helper used by the avatar in TopBar etc. Pulls
 * the first letter of first + last name; falls back to first 2 chars
 * of the username when names aren't set yet.
 */
export function deriveInitials(me: ClientProfile | null): string {
  if (!me) return "?";
  const f = me.firstName?.trim()[0];
  const l = me.lastName?.trim()[0];
  if (f && l) return (f + l).toUpperCase();
  if (f) return f.toUpperCase();
  return (me.username ?? "?").slice(0, 2).toUpperCase();
}
