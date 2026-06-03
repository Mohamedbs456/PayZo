import { forwardRef, useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Small-caps label rendered above the input. */
  label: string;
  /** Optional inline helper / link rendered to the right of the label. */
  labelAdornment?: ReactNode;
  /** Optional right-aligned content inside the input (icon, button, …). */
  rightSlot?: ReactNode;
  /** Render the input value with a monospace face (e.g. masked passwords). */
  monospace?: boolean;
  /** Error message — when present, the input gets a danger border. */
  error?: string | null;
}

/**
 * Labeled text input matching the Figma auth-form spec:
 * 11px small-caps label (text-secondary, tracking 0.66px), optional
 * label adornment (e.g. "Forgot password?"), 12px-rounded surface-card
 * input with 14px body, 16px horizontal + 14px vertical padding.
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField(
    {
      label,
      labelAdornment,
      rightSlot,
      monospace = false,
      error,
      id,
      className,
      ...rest
    },
    ref,
  ) {
    const reactId = useId();
    const inputId = id ?? `tf-${reactId}`;

    return (
      <div className="flex w-full flex-col gap-2">
        <div className="flex items-center justify-between">
          <label
            htmlFor={inputId}
            className="font-sans text-[11px] font-medium uppercase tracking-[0.06em] text-text-secondary"
          >
            {label}
          </label>
          {labelAdornment}
        </div>
        <div
          className={cn(
            "flex items-center gap-2.5 rounded-xl border bg-surface-card px-4 py-3.5",
            "transition-colors duration-150 ease-out",
            "focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15",
            error ? "border-negative" : "border-border",
          )}
        >
          <input
            ref={ref}
            id={inputId}
            aria-invalid={error ? "true" : undefined}
            className={cn(
              "min-w-0 flex-1 bg-transparent text-[14px] text-text-primary outline-none",
              "placeholder:text-text-muted",
              monospace && "font-mono",
              className,
            )}
            {...rest}
          />
          {rightSlot}
        </div>
        {error && (
          <p className="font-sans text-[12px] text-negative" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  },
);
