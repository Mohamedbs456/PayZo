import { useCallback, useState, type KeyboardEvent } from "react";

/**
 * Search-input pattern for the client-app list pages (Transactions,
 * Alerts, Notifications, Accounts). Mirror of the BO hook at
 * {@code BO-Web-App/src/lib/hooks/useEnterSearch.ts} so both apps
 * share the same UX: typing doesn't refetch; pressing Enter commits.
 *
 * Two distinct values:
 *
 *   - {@code draft}     — what the user is currently typing (controlled).
 *   - {@code committed} — the last value the user explicitly submitted by
 *                         pressing Enter (or clicking the X to clear).
 *                         This is what feeds the data hook.
 *
 * Usage:
 *
 * ```tsx
 * const search = useEnterSearch();
 * const txs = useTransactions({ q: search.committed });
 *
 * <input
 *   {...search.bind}
 *   placeholder="Search — press Enter"
 * />
 * {search.draft && (
 *   <button onClick={search.clear} aria-label="Clear search">×</button>
 * )}
 * ```
 *
 * The BE-side wide search ({@code SearchSpecification} + per-feature spec
 * builders) handles the actual matching across multiple columns, so the
 * single {@code q} value is enough.
 */
export interface EnterSearchControls {
  /** Current input value (controlled). */
  draft: string;
  /** Last submitted value — feed this to your data hook. */
  committed: string;
  /** Update the draft as the user types. */
  setDraft: (next: string) => void;
  /** Commit the current draft as the search query. Called on Enter. */
  commit: () => void;
  /** Reset both draft and committed to empty (and triggers a refetch). */
  clear: () => void;
  /** Convenience spread for the underlying input — handles Enter / Esc. */
  bind: {
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  };
}

export function useEnterSearch(initial = ""): EnterSearchControls {
  const [draft, setDraft] = useState(initial);
  const [committed, setCommitted] = useState(initial);

  const commit = useCallback(() => {
    setCommitted(draft.trim());
  }, [draft]);

  const clear = useCallback(() => {
    setDraft("");
    setCommitted("");
  }, []);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        setCommitted(draft.trim());
      } else if (e.key === "Escape") {
        // Discard the in-flight draft, restore the committed value.
        e.preventDefault();
        setDraft(committed);
      }
    },
    [draft, committed],
  );

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setDraft(e.target.value);
    },
    [],
  );

  return {
    draft,
    committed,
    setDraft,
    commit,
    clear,
    bind: { value: draft, onChange, onKeyDown },
  };
}
