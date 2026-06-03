import { useNavigate } from "react-router-dom";
import { ExternalLink, RotateCw } from "lucide-react";
import logoSidebar from "@/assets/logo-sidebar.svg";

/**
 * Maintenance / service-degraded page — Impact 22.
 *
 * `useHealthCheck` upstream switches to "degraded" after two consecutive
 * health-probe failures. When health returns OK again, the layout that
 * mounts this page should auto-route the user back to where they came from.
 */
export function MaintenancePage() {
  const navigate = useNavigate();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-brand-cream px-6">
      {/* Explicit width matches the SVG's true aspect ratio (157:40 ≈
          3.925:1, lifted from the sidebar). Scaled up here so the logo
          reads as the page anchor on the empty maintenance surface.
          The parent flex column centers it horizontally. */}
      <img src={logoSidebar} alt="PayZo" className="h-14 w-[220px] opacity-90" />
      <div className="flex w-full max-w-[480px] flex-col items-start gap-6">
        <span className="rounded-full bg-[#fde6e6] px-3 py-1 font-sans text-[10px] font-bold tracking-[1.4px] text-danger">
          SERVICE DEGRADED
        </span>
        <h1 className="font-sans text-[32px] font-bold leading-tight text-text-primary">
          We can't reach PayZo right now
        </h1>
        <p className="font-sans text-[14px] leading-[22px] text-text-label">
          The backoffice is temporarily unavailable. We're checking the
          connection — once it's back, this page will reload automatically.
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(0)}
            className="group flex items-center gap-2 rounded-lg bg-brand-dark px-4 py-2.5 font-sans text-[13px] font-semibold text-brand-cream transition-all duration-150 ease-out hover:scale-[1.02] active:scale-[0.98]"
          >
            <RotateCw
              className="size-4 transition-transform duration-150 ease-out group-hover:rotate-90"
              strokeWidth={2}
            />
            Try again
          </button>
          <a
            href="https://status.payzo.tn"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 font-sans text-[13px] font-semibold text-brand-medium transition-transform duration-150 ease-out hover:translate-x-0.5"
          >
            Check status
            <ExternalLink className="size-3.5" strokeWidth={2} />
          </a>
        </div>
      </div>
    </main>
  );
}
