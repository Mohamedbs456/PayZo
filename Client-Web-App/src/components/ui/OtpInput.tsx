import { useEffect, useId, useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";

/**
 * 6-digit OTP entry, shared across login / sign-up / forgot-pw / transfer
 * confirm (BACKEND_IMPACTS Impact 24 — full 8-state machine). The visual
 * matches Figma node 94:5 (sign-up step 2b): six equal-width rounded-14
 * cells, JetBrains Mono 32px, focused cell shows a teal placeholder dot
 * and a 2px accent border.
 *
 * State semantics:
 *   idle          — accepting input
 *   submitting    — locked, awaiting backend response (disable + dim)
 *   error         — backend rejected the code; cells flash red, helper
 *                   text shows attempts left
 *   invalidated   — too many wrong attempts; cells locked, parent should
 *                   render a "send a new code" affordance
 *   expired       — TTL hit; same as invalidated visually
 *   verified      — backend accepted; cells turn positive briefly
 *
 * Auto-submit fires when the 6th digit is typed (or pasted). Parent owns
 * the value + state; the component is purely controlled.
 */

export type OtpState =
  | "idle"
  | "submitting"
  | "error"
  | "invalidated"
  | "expired"
  | "verified";

interface OtpInputProps {
  /** 6-character string. Anything past index 5 is ignored. */
  value: string;
  onChange: (next: string) => void;
  /** Fired when the value reaches length 6 (typed or pasted). */
  onSubmit?: (value: string) => void;
  state?: OtpState;
  /** Auto-focus the first empty cell on mount. Defaults to true. */
  autoFocus?: boolean;
  /** Optional aria-labelledby pointing to the field's visible label. */
  ariaLabelledBy?: string;
  /**
   * Visual variant.
   *  - `default` (sign-up step 2b) — flex-1 cells, JetBrains Mono digits,
   *    white empty cells with default border.
   *  - `card` (forgot-pw step 2 / Figma 277:42) — fixed 64px-wide cells
   *    inside a card, Inter Bold digits, accent-soft empty bg with subtle
   *    border that pops to a 2px accent on focus or fill.
   */
  variant?: "default" | "card";
}

const CELL_BASE_DEFAULT =
  "flex flex-1 min-w-px h-[64px] sm:h-[76px] items-center justify-center rounded-[14px] border bg-surface-card font-mono text-[28px] sm:text-[32px] text-text-primary outline-none transition-colors duration-150 ease-out";

const CELL_BASE_CARD =
  "flex w-[clamp(48px,14vw,64px)] h-[68px] sm:h-[78px] items-center justify-center rounded-[12px] border font-sans text-[26px] sm:text-[30px] font-bold text-text-primary outline-none transition-colors duration-150 ease-out";

export function OtpInput({
  value,
  onChange,
  onSubmit,
  state = "idle",
  autoFocus = true,
  ariaLabelledBy,
  variant = "default",
}: OtpInputProps) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const groupId = useId();
  const locked =
    state === "submitting" || state === "invalidated" || state === "expired" || state === "verified";
  const hasError = state === "error";

  // Focus the first empty cell on mount when requested.
  useEffect(() => {
    if (!autoFocus || locked) return;
    const idx = Math.min(value.length, 5);
    inputRefs.current[idx]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the parent transitions back to idle (e.g. after an error) and the
  // value still has content, refocus the next empty slot so the user can
  // correct their input without manually clicking.
  useEffect(() => {
    if (state === "idle" && value.length < 6) {
      inputRefs.current[value.length]?.focus();
    }
  }, [state, value.length]);

  function commit(next: string) {
    const sanitized = next.replace(/\D/g, "").slice(0, 6);
    onChange(sanitized);
    if (sanitized.length === 6) onSubmit?.(sanitized);
  }

  function handleCellChange(index: number, raw: string) {
    if (locked) return;
    const digits = raw.replace(/\D/g, "");
    if (!digits) return;
    // If they pasted multiple digits into one cell, fan them out.
    if (digits.length > 1) {
      const merged = (value.slice(0, index) + digits).slice(0, 6);
      commit(merged.padEnd(6, "").slice(0, 6).trimEnd());
      const nextFocus = Math.min(index + digits.length, 5);
      inputRefs.current[nextFocus]?.focus();
      return;
    }
    const chars = value.split("");
    chars[index] = digits;
    const merged = chars.join("").slice(0, 6);
    commit(merged);
    if (index < 5) inputRefs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (locked) return;
    if (e.key === "Backspace") {
      if (value[index]) {
        // Clear current cell, stay focused.
        const chars = value.split("");
        chars[index] = "";
        commit(chars.join("").trimEnd());
        return;
      }
      // Empty cell → step back and clear the previous one.
      if (index > 0) {
        const prev = index - 1;
        const chars = value.split("");
        chars[prev] = "";
        commit(chars.join("").trimEnd());
        inputRefs.current[prev]?.focus();
      }
      e.preventDefault();
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
      e.preventDefault();
    } else if (e.key === "ArrowRight" && index < 5) {
      inputRefs.current[index + 1]?.focus();
      e.preventDefault();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    if (locked) return;
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    commit(pasted);
    inputRefs.current[Math.min(pasted.length, 5)]?.focus();
  }

  return (
    <div
      role="group"
      aria-labelledby={ariaLabelledBy}
      aria-invalid={hasError || undefined}
      className={cn(
        "flex w-full gap-2 sm:gap-2.5",
        variant === "default" && "sm:gap-3",
        variant === "card" && "justify-center",
        locked && state === "submitting" && "opacity-60",
        locked && (state === "invalidated" || state === "expired") && "opacity-50",
      )}
    >
      {Array.from({ length: 6 }).map((_, i) => {
        const ch = value[i] ?? "";
        const focused = !locked && value.length === i;
        const baseClass =
          variant === "card" ? CELL_BASE_CARD : CELL_BASE_DEFAULT;

        // Empty + filled background palettes per variant.
        const emptyBg =
          variant === "card" ? "bg-accent-soft" : "bg-surface-card";
        const filledBg =
          variant === "card" ? "bg-surface-card" : "bg-surface-card";

        return (
          <input
            key={`${groupId}-${i}`}
            ref={(el) => {
              inputRefs.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={1}
            disabled={locked}
            value={ch}
            onChange={(e) => handleCellChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            aria-label={`Digit ${i + 1}`}
            className={cn(
              baseClass,
              "text-center caret-accent",
              ch && filledBg,
              !ch && emptyBg,
              !ch && !focused && !hasError && "border-border-soft placeholder:text-text-muted",
              ch && !hasError && "border-2 border-accent",
              focused && !hasError && "border-2 border-accent",
              hasError && "border-2 border-negative text-negative",
              state === "verified" && "border-2 border-positive text-positive",
              !locked && "focus:border-accent focus:border-2",
            )}
            placeholder="·"
          />
        );
      })}
    </div>
  );
}
