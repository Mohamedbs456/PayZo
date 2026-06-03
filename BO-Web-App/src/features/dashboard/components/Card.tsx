import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/cn";

/**
 * Shared dashboard card primitive — rounded-3xl white surface with the
 * brand shadow. When `to` is set, the whole card becomes a clickable
 * navigator: clicking anywhere on it routes to that path, with a subtle
 * hover-lift to advertise the affordance. Inner widgets (donut slices,
 * period tabs, etc.) need to call `e.stopPropagation()` if they don't
 * want to trigger the card-level navigation.
 */
export function Card({
  children,
  className,
  to,
}: {
  children: ReactNode;
  className?: string;
  /** When set, the card becomes a clickable navigator. */
  to?: string;
}) {
  const navigate = useNavigate();
  const linked = !!to;

  const base =
    "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-3xl bg-white shadow-[0_2px_4px_0_rgba(42,31,20,0.06),0_12px_32px_-6px_rgba(42,31,20,0.16)]";

  if (!linked) {
    return <div className={cn(base, className)}>{children}</div>;
  }

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => navigate(to!)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(to!);
        }
      }}
      className={cn(
        base,
        "cursor-pointer transition-all duration-150 ease-out",
        "hover:-translate-y-0.5 hover:shadow-[0_6px_10px_0_rgba(42,31,20,0.08),0_20px_44px_-8px_rgba(42,31,20,0.22)]",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-dark/30",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  rightSlot,
}: {
  title: string;
  subtitle?: string;
  rightSlot?: ReactNode;
}) {
  return (
    <div className="flex w-full shrink-0 items-center gap-2 overflow-hidden">
      <div className="flex min-w-0 shrink flex-col gap-0.5 overflow-hidden whitespace-nowrap leading-none">
        <p className="truncate font-sans text-[11px] font-bold tracking-[1.76px] text-brand-medium">
          {title}
        </p>
        {subtitle && (
          <p className="truncate font-sans text-[11px] text-text-muted">
            {subtitle}
          </p>
        )}
      </div>
      {rightSlot && <div className="ml-auto shrink-0">{rightSlot}</div>}
    </div>
  );
}
