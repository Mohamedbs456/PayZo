import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useHealthCheck } from "@/hooks/useHealthCheck";

/**
 * Top-level wrapper that watches backend health (Impact 22) and routes the
 * user to /maintenance after two consecutive failed probes. When health
 * recovers, it navigates back to wherever the user was originally.
 */
export function HealthGate({ children }: { children: ReactNode }) {
  const { status } = useHealthCheck();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === "degraded" && location.pathname !== "/maintenance") {
      navigate("/maintenance", {
        replace: true,
        state: { from: location.pathname + location.search },
      });
    } else if (status === "ok" && location.pathname === "/maintenance") {
      const previous =
        (location.state as { from?: string } | null)?.from ?? "/";
      navigate(previous, { replace: true });
    }
  }, [status, location.pathname, location.search, location.state, navigate]);

  return <>{children}</>;
}
