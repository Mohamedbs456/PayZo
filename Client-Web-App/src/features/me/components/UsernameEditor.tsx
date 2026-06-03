import { useId, useMemo, useRef, useState } from "react";
import { AtSign, Loader2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import { isDemoMode } from "@/lib/demoMode";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useMe } from "@/features/me/MeProvider";
import { updateUsername } from "@/features/me/api";
import { normalizeUsername, validateUsername } from "@/features/me/usernameRules";
import { cn } from "@/lib/cn";

/**
 * Edit the client's `@username` (D54 / Impact 34).
 *
 * Layout: a small-caps "Username" label, a row holding the `@`-prefixed
 * input + a primary "Save" button, and an optional error/help line
 * underneath. Mirrors {@code DefaultAccountRow} below it in the Personal
 * info view so the two read as a single "PayZo" cluster.
 *
 * Behaviour:
 *  - Tracks {@code value} (draft) + {@code error} (validation/server)
 *    + {@code saving} (in-flight spinner).
 *  - Save button stays disabled while the draft equals the persisted
 *    value (no-op) and while a validation error is shown.
 *  - Validates client-side on every keystroke against the shared rules
 *    in {@code usernameRules.ts} — same regex + reserved list the
 *    backend enforces — so the inline error appears without a round-trip.
 *  - On 200 → toast "Username updated" + {@code refresh()} so every
 *    place that reads {@code me.username} (TopBar, ProfilePanel header
 *    cache, transaction rows) re-renders with the new value.
 *  - On 409 `USERNAME_TAKEN`/`USERNAME_RESERVED` and 422
 *    `USERNAME_INVALID` → inline red message under the input.
 *  - In demo mode → optimistic patch + toast, no PATCH fired.
 */
export function UsernameEditor() {
  const toast = useToast();
  const { me, refresh, patch } = useMe();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const initial = me?.username ?? "";
  const [value, setValue] = useState(initial);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // No effect-based hydration: the parent keys this component on
  // `me.id` so identity changes re-mount the component and `useState`
  // re-initialises with the fresh `initial`. Mid-edit, the local draft
  // is the source of truth — we never want to yank typed characters out
  // from under the user just because a sibling tab refetched the profile.

  const normalized = normalizeUsername(value);
  const unchanged = normalized === initial.toLowerCase();
  const clientValidation = useMemo(() => validateUsername(value), [value]);
  const clientError = clientValidation.ok ? null : clientValidation.reason;

  // Server error wins (it survives keystrokes only until the next change).
  const error = serverError ?? (value.length > 0 && !unchanged ? clientError : null);
  const canSave = !unchanged && clientValidation.ok && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setServerError(null);
    try {
      if (isDemoMode()) {
        await new Promise((r) => setTimeout(r, 350));
        patch({ username: normalized });
        toast.showToast({ tier: "success", message: "Username updated." });
        return;
      }
      const updated = await updateUsername(normalized);
      // Server-side normalisation may differ (defensive); reflect what the
      // backend actually persisted rather than what we sent.
      patch({ username: updated.username });
      toast.showToast({ tier: "success", message: "Username updated." });
      // Belt and braces — a full refetch so any field the server might
      // have touched (updated_at-derived state, etc.) catches up.
      void refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        switch (err.errorCode) {
          case "USERNAME_TAKEN":
            setServerError("This username is already taken.");
            break;
          case "USERNAME_RESERVED":
            setServerError("This username is reserved.");
            break;
          case "USERNAME_INVALID":
            setServerError(
              err.message ||
                "Only lowercase letters, digits, dots, and underscores are allowed.",
            );
            break;
          default:
            setServerError(err.message || "Couldn't update your username. Try again.");
        }
      } else {
        setServerError("Couldn't update your username. Try again.");
      }
    } finally {
      setSaving(false);
      // Keep focus in the field so the user can correct + retry without
      // re-clicking the input.
      inputRef.current?.focus();
    }
  }

  const showError = !!error;

  return (
    <div className="flex flex-col gap-1.5 bg-surface-card px-4 py-3">
      <span className="font-sans text-[11px] font-medium text-text-muted">
        Username
      </span>

      <div className="flex items-center gap-2">
        <div
          className={cn(
            "flex h-11 min-w-0 flex-1 items-center gap-1.5 rounded-lg border bg-surface-card pl-3 pr-2",
            "transition-colors duration-150 ease-out",
            "focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15",
            showError ? "border-negative" : "border-border-soft",
          )}
        >
          <AtSign
            className="size-4 shrink-0 text-text-muted"
            strokeWidth={2}
            aria-hidden
          />
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setServerError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleSave();
              }
            }}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            inputMode="text"
            maxLength={64}
            aria-label="Username"
            aria-invalid={showError ? "true" : undefined}
            aria-describedby={showError ? errorId : undefined}
            disabled={saving}
            className={cn(
              "min-w-0 flex-1 bg-transparent font-mono text-[13px] text-text-primary outline-none",
              "placeholder:text-text-muted",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
            placeholder="coffee.forever"
          />
        </div>

        <Button
          type="button"
          size="md"
          variant="primary"
          onClick={handleSave}
          disabled={!canSave}
          busy={saving}
          className="w-auto px-4"
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" strokeWidth={2} aria-hidden />
          ) : (
            "Save"
          )}
        </Button>
      </div>

      {showError && (
        <span
          id={errorId}
          role="alert"
          className="font-sans text-[11px] text-negative"
        >
          {error}
        </span>
      )}

      {!showError && (
        <span className="font-sans text-[11px] text-text-muted">
          Lowercase letters, digits, dots, and underscores. 3–30 characters.
        </span>
      )}
    </div>
  );
}
