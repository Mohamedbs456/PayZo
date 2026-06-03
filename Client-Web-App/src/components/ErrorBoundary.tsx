import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * Root error boundary — wraps the whole app so an uncaught render-time error
 * shows a recovery affordance instead of a blank page. React error boundaries
 * MUST be class components (no hook equivalent yet), which is the only reason
 * we still use a class anywhere in the tree.
 *
 * Scoped explicitly to the ROOT (in `App.tsx`). Nested boundaries can be
 * added per feature later if we want to recover sub-trees without unmounting
 * the shell — for now a hard reload is the simplest correct recovery and
 * matches what the maintenance page already does (Impact 22).
 */
interface State {
  error: Error | null;
}

interface Props {
  children: ReactNode;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // No external error tracker yet — log to console so the failure surfaces
    // in DevTools. A future addition would forward to Sentry / equivalent.
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary] uncaught error:", error, info.componentStack);
  }

  reset = () => {
    // Full reload is the safest recovery — the failure could have left
    // React state, fetch promises, or the router in an inconsistent shape.
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-surface p-6">
        <div className="flex max-w-md flex-col gap-4 rounded-2xl border border-border bg-surface-raised p-6 text-center shadow-sm">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-danger-soft">
            <AlertTriangle className="size-6 text-danger" strokeWidth={2.2} aria-hidden />
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="font-sans text-[18px] font-semibold text-text-primary">
              Something went wrong
            </h1>
            <p className="font-sans text-[14px] text-text-secondary">
              The page hit an unexpected error and can't continue. Reloading
              usually fixes this — if it keeps happening, please contact
              support.
            </p>
          </div>
          <button
            type="button"
            onClick={this.reset}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-[10px] bg-accent px-5 font-sans text-[14px] font-semibold text-accent-foreground transition-colors duration-150 ease-out hover:bg-accent-hover"
          >
            <RefreshCw className="size-4" strokeWidth={2.2} aria-hidden />
            Reload
          </button>
        </div>
      </div>
    );
  }
}
