import { useNavigate } from "react-router-dom";
import { ArrowRight, Wrench } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { useHealthCheck } from "@/hooks/useHealthCheck";

/**
 * Shown by `<HealthGate />` after two consecutive failed `/actuator/health`
 * polls (BACKEND_IMPACTS Impact 22 / Figma 273:38). Same chrome as 404 —
 * light TopBar + centered hero, just with the warning-soft wrench disc
 * and different copy. HealthGate auto-navigates the user back when the
 * backend recovers.
 */
export function MaintenancePage() {
  const navigate = useNavigate();
  const { lastCheckedAt } = useHealthCheck();

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-surface-soft">
      <TopBar pageName="Service unavailable" variant="light" showBack={false} />

      <main className="flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-6 py-12 text-center">
        <div
          className="flex size-[120px] items-center justify-center rounded-[60px] bg-warning-soft"
          aria-hidden
        >
          <Wrench className="size-14 text-warning" strokeWidth={1.6} />
        </div>

        <h2 className="font-sans text-[clamp(22px,3vw,32px)] font-bold leading-tight text-text-primary">
          We're working on it
        </h2>

        <p className="max-w-[560px] font-sans text-[14px] leading-[1.5] text-text-secondary sm:text-[16px] sm:leading-[1.5]">
          PayZo is temporarily unavailable while we run a quick maintenance
          pass. Your money is safe. We'll be back shortly.
        </p>

        <div className="flex items-center gap-3 pt-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex h-12 items-center rounded-xl border border-border-soft bg-surface-card px-6 font-sans text-[14px] font-semibold text-text-secondary transition-colors duration-150 ease-out hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-soft"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => navigate("/dashboard", { replace: true })}
            className="flex h-12 items-center gap-2 rounded-xl bg-accent pl-7 pr-6 font-sans text-[14px] font-bold text-accent-foreground transition-all duration-150 ease-out hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-soft"
          >
            Back to dashboard
            <ArrowRight className="size-4" strokeWidth={2.4} aria-hidden />
          </button>
        </div>

        {lastCheckedAt && (
          <p className="pt-2 font-mono text-[11px] text-text-faint">
            Last checked: {new Date(lastCheckedAt).toLocaleTimeString()}
          </p>
        )}
      </main>
    </div>
  );
}
