import { Link } from "react-router-dom";
import { ArrowRight, ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { withDemo } from "@/lib/demoMode";

export type TransferMode = "send-to-someone" | "between-accounts";

interface TransferModeToggleProps {
  mode: TransferMode;
}

/**
 * Top-of-content segmented toggle (Figma 145:25). Two pills inside an
 * accent-soft track. Selected pill = white card + accent arrow + dark
 * label; unselected = transparent + muted label.
 *
 * Each pill is a `<Link>` rather than a button — switching mode is
 * really a route change (`/transfers` ↔ `/transfers/internal`), not
 * a local toggle, so the URL stays the source of truth.
 */
export function TransferModeToggle({ mode }: TransferModeToggleProps) {
  return (
    <div
      role="tablist"
      aria-label="Transfer mode"
      className="inline-flex w-fit shrink-0 self-start items-center gap-1 rounded-xl bg-accent-soft p-1"
    >
      <Link
        to={withDemo("/transfers")}
        role="tab"
        aria-selected={mode === "send-to-someone"}
        className={cn(
          "flex items-center justify-center gap-2 rounded-[9px] px-3.5 py-2 transition-colors duration-150 ease-out",
          mode === "send-to-someone"
            ? "bg-surface-card shadow-[0px_1px_3px_0px_rgba(0,0,0,0.08)]"
            : "hover:bg-white/40",
        )}
      >
        <ArrowRight
          className={cn(
            "size-4",
            mode === "send-to-someone" ? "text-accent" : "text-text-muted",
          )}
          strokeWidth={2.4}
          aria-hidden
        />
        <span
          className={cn(
            "font-sans text-[13px] font-semibold",
            mode === "send-to-someone"
              ? "text-text-primary"
              : "text-text-muted",
          )}
        >
          To someone
        </span>
      </Link>

      <Link
        to={withDemo("/transfers/internal")}
        role="tab"
        aria-selected={mode === "between-accounts"}
        className={cn(
          "flex items-center justify-center gap-2 rounded-[9px] px-3.5 py-2 transition-colors duration-150 ease-out",
          mode === "between-accounts"
            ? "bg-surface-card shadow-[0px_1px_3px_0px_rgba(0,0,0,0.08)]"
            : "hover:bg-white/40",
        )}
      >
        <ArrowLeftRight
          className={cn(
            "size-[18px]",
            mode === "between-accounts" ? "text-accent" : "text-text-muted",
          )}
          strokeWidth={2}
          aria-hidden
        />
        <span
          className={cn(
            "font-sans text-[13px] font-semibold",
            mode === "between-accounts"
              ? "text-text-primary"
              : "text-text-muted",
          )}
        >
          Between my accounts
        </span>
      </Link>
    </div>
  );
}
