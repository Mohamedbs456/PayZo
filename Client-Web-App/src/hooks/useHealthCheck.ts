import { useEffect, useRef, useState } from "react";
import { env } from "@/lib/env";

const POLL_INTERVAL_MS = 30_000;
const REQUEST_TIMEOUT_MS = 5_000;
const FAIL_STREAK_BEFORE_DEGRADED = 2;

export type HealthStatus = "ok" | "degraded";

interface HealthState {
  status: HealthStatus;
  lastCheckedAt: number | null;
}

/**
 * Polls the backend `/actuator/health` every 30s. Two consecutive failures
 * (non-200 OR no response within 5s) flip status to "degraded" — caller
 * routes to the maintenance page (Impact 22). When health returns OK the
 * status flips back automatically.
 */
export function useHealthCheck(): HealthState {
  const [state, setState] = useState<HealthState>({
    status: "ok",
    lastCheckedAt: null,
  });
  const failStreak = useRef(0);

  useEffect(() => {
    let cancelled = false;

    const ping = async () => {
      let ok = false;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(env.healthUrl, {
          method: "GET",
          signal: controller.signal,
          // /actuator/health is a public endpoint; no credentials.
          cache: "no-store",
        });
        ok = res.ok;
      } catch {
        ok = false;
      } finally {
        clearTimeout(timeout);
      }

      if (cancelled) return;

      failStreak.current = ok ? 0 : failStreak.current + 1;
      setState({
        status:
          failStreak.current >= FAIL_STREAK_BEFORE_DEGRADED ? "degraded" : "ok",
        lastCheckedAt: Date.now(),
      });
    };

    void ping();
    const interval = setInterval(ping, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return state;
}
