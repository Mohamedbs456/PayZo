import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";
import { fetchBoMe, type BoMe } from "@/features/me/api";
import { session } from "@/lib/auth/session";

interface BoMeContextValue {
  me: BoMe | null;
  loading: boolean;
  error: Error | null;
  /** Re-fetches /me. Call after any mutation that changes my profile
   *  (picture upload, password rotation that flips firstLoginCompleted, …). */
  refresh: () => Promise<void>;
  /** Replace the cached value without a network round-trip. Useful when an
   *  upload endpoint already returned the new picture URL — avoids a
   *  flicker between local optimistic state and a redundant fetch. */
  patch: (partial: Partial<BoMe>) => void;
}

const BoMeContext = createContext<BoMeContextValue | null>(null);

/**
 * Mounted once at the layout root. Holds the current backoffice user's
 * `/me` payload so every consumer (sidebar avatar, profile page, dashboard
 * first-login check) renders from the same cached snapshot. A picture
 * upload calls {@link patch} or {@link refresh} and the sidebar updates
 * instantly with no second fetch.
 */
export function BoMeProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<BoMe | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!session.isAuthenticated()) return;
    setLoading(true);
    setError(null);
    try {
      const fresh = await fetchBoMe();
      setMe(fresh);
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error("Failed to load /me"));
    } finally {
      setLoading(false);
    }
  }, []);

  const patch = useCallback((partial: Partial<BoMe>) => {
    setMe((prev) => (prev ? { ...prev, ...partial } : prev));
  }, []);

  // Initial fetch + retrigger after sign-in (session changes) or a hard
  // route remount.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <BoMeContext.Provider value={{ me, loading, error, refresh, patch }}>
      {children}
    </BoMeContext.Provider>
  );
}

export function useBoMe(): BoMeContextValue {
  const ctx = useContext(BoMeContext);
  if (!ctx) {
    throw new Error("useBoMe() must be used inside <BoMeProvider>");
  }
  return ctx;
}
