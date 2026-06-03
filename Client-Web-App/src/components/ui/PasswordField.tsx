import { forwardRef, useState } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { TextField } from "@/components/ui/TextField";

interface PasswordFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  labelAdornment?: ReactNode;
  error?: string | null;
}

/**
 * Password input — TextField with a built-in eye-toggle that flips
 * between masked (•••) and revealed text. Lucide icons only (Impact 18).
 * Visual matches the Figma frame: monospaced masked value, 20px right-side
 * eye affordance.
 */
export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField({ label, labelAdornment, error, ...rest }, ref) {
    const [revealed, setRevealed] = useState(false);
    const Icon = revealed ? EyeOff : Eye;

    return (
      <TextField
        ref={ref}
        label={label}
        labelAdornment={labelAdornment}
        error={error}
        type={revealed ? "text" : "password"}
        monospace={!revealed}
        rightSlot={
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? "Hide password" : "Show password"}
            aria-pressed={revealed}
            className="flex shrink-0 items-center justify-center text-text-muted transition-colors duration-150 ease-out hover:text-text-primary focus-visible:outline-none focus-visible:text-text-primary"
          >
            <Icon className="size-5" strokeWidth={1.6} aria-hidden />
          </button>
        }
        {...rest}
      />
    );
  },
);
