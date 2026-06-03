import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "outline" | "ghost";
export type ButtonSize = "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Optional leading icon (left of the label). */
  leadingIcon?: ReactNode;
  /** Optional trailing icon (right of the label). */
  trailingIcon?: ReactNode;
  /** Show a spinner + disable while in flight. */
  busy?: boolean;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-foreground hover:bg-accent/90 active:bg-accent/95",
  outline:
    "bg-surface-card text-text-primary border border-border-strong hover:bg-surface-soft",
  ghost: "text-text-secondary hover:text-text-primary",
};

const SIZE: Record<ButtonSize, string> = {
  md: "h-11 px-5 text-[13px] gap-1.5",
  lg: "h-12 px-6 text-[14px] gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "lg",
    leadingIcon,
    trailingIcon,
    busy = false,
    disabled,
    className,
    children,
    type = "button",
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || busy}
      className={cn(
        "inline-flex w-full items-center justify-center rounded-xl font-sans font-semibold",
        "transition-all duration-150 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-soft",
        "disabled:cursor-not-allowed disabled:opacity-60",
        SIZE[size],
        VARIANT[variant],
        className,
      )}
      {...rest}
    >
      {leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
});
