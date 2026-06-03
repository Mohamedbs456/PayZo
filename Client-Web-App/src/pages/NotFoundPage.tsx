import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Search } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";

/**
 * Router catch-all (Figma 273:2). Light TopBar + centered hero with
 * accent-soft icon disc, big "404", h2 + description, and a Go-back /
 * Back-to-dashboard button row.
 */
export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-surface-soft">
      <TopBar pageName="Page not found" variant="light" />

      <main className="flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-6 py-12 text-center">
        <div
          className="flex size-[120px] items-center justify-center rounded-[60px] bg-accent-soft"
          aria-hidden
        >
          <Search className="size-14 text-accent" strokeWidth={1.6} />
        </div>

        <p className="font-sans text-[clamp(48px,7vw,64px)] font-bold leading-none tracking-tight text-text-primary">
          404
        </p>

        <h2 className="font-sans text-[clamp(22px,3vw,32px)] font-bold leading-tight text-text-primary">
          We couldn't find that page
        </h2>

        <p className="max-w-[560px] font-sans text-[14px] leading-[1.5] text-text-secondary sm:text-[16px] sm:leading-[1.5]">
          The link might be old, broken, or the page has moved. Let's get you
          back somewhere safe.
        </p>

        <div className="flex items-center gap-3 pt-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-12 items-center rounded-xl border border-border-soft bg-surface-card px-6 font-sans text-[14px] font-semibold text-text-secondary transition-colors duration-150 ease-out hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-soft"
          >
            Go back
          </button>
          <Link
            to="/dashboard"
            className="flex h-12 items-center gap-2 rounded-xl bg-accent pl-7 pr-6 font-sans text-[14px] font-bold text-accent-foreground transition-all duration-150 ease-out hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-soft"
          >
            Back to dashboard
            <ArrowRight className="size-4" strokeWidth={2.4} aria-hidden />
          </Link>
        </div>
      </main>
    </div>
  );
}
