import { cn } from "@/lib/cn";
import type { ClientTransaction } from "@/features/dashboard/api";

type Status = NonNullable<ClientTransaction["status"]>;

interface StatusPillProps {
  status: Status;
  className?: string;
}

const VARIANTS: Record<
  Status,
  { label: string; bg: string; dot: string; text: string }
> = {
  APPROVED: {
    label: "Approved",
    bg: "bg-positive-soft",
    dot: "bg-positive",
    text: "text-text-primary",
  },
  PENDING_OTP: {
    label: "Pending review",
    bg: "bg-warning-soft",
    dot: "bg-warning",
    text: "text-text-primary",
  },
  PENDING_SCORING: {
    label: "Pending review",
    bg: "bg-warning-soft",
    dot: "bg-warning",
    text: "text-text-primary",
  },
  SUSPENDED_PENDING_ANALYST: {
    label: "Under review",
    bg: "bg-warning-soft",
    dot: "bg-warning",
    text: "text-text-primary",
  },
  REJECTED: {
    label: "Rejected",
    bg: "bg-negative-soft",
    dot: "bg-negative",
    text: "text-text-primary",
  },
  CANCELLED: {
    label: "Cancelled",
    bg: "bg-surface-raised",
    dot: "bg-text-muted",
    text: "text-text-secondary",
  },
};

/** Small status pill (Figma 207:87/169/189/231 ...). Keeps colors and
 *  copy consistent across the list and any future detail page. */
export function StatusPill({ status, className }: StatusPillProps) {
  const variant = VARIANTS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full pl-2 pr-2.5 py-[3px]",
        variant.bg,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", variant.dot)} aria-hidden />
      <span
        className={cn(
          "font-sans text-[11px] font-semibold whitespace-nowrap",
          variant.text,
        )}
      >
        {variant.label}
      </span>
    </span>
  );
}
