import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Compass } from "lucide-react";
import logoSidebar from "@/assets/logo-sidebar.svg";

/**
 * 404 page (D47). Standalone layout — no sidebar, no chrome — so it works
 * for unauthenticated routes too. Visual frame matches the Maintenance
 * page so the two read as a coherent set.
 */
export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-brand-cream px-6">
      <img src={logoSidebar} alt="PayZo" className="h-9 w-auto opacity-90" />

      <div className="flex w-full max-w-[480px] flex-col items-start gap-5">
        <span className="rounded-full bg-brand-cream-2/80 px-3 py-1 font-sans text-[10px] font-bold tracking-[1.4px] text-text-primary">
          404 · NOT FOUND
        </span>
        <h1 className="font-sans text-[32px] font-bold leading-tight text-text-primary">
          That page wandered off
        </h1>
        <p className="font-sans text-[14px] leading-[22px] text-text-label">
          The URL doesn't match any backoffice route. Double-check the link,
          or head back to the dashboard.
        </p>
        <div className="flex items-center gap-3">
          <Link
            to="/dashboard"
            className="group flex items-center gap-2 rounded-lg bg-brand-dark px-4 py-2.5 font-sans text-[13px] font-semibold text-brand-cream transition-all duration-150 ease-out hover:scale-[1.02] active:scale-[0.98]"
          >
            <Compass
              className="size-4 transition-transform duration-150 ease-out group-hover:rotate-12"
              strokeWidth={2}
            />
            Back to dashboard
          </Link>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 font-sans text-[13px] font-semibold text-brand-medium transition-transform duration-150 ease-out hover:-translate-x-0.5"
          >
            <ArrowLeft className="size-3.5" strokeWidth={2} />
            Go back
          </button>
        </div>
      </div>
    </main>
  );
}
