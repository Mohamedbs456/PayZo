import { useCallback, useState, type KeyboardEvent } from "react";

/**
 * Search-input pattern for every BO list page (Clients, Transactions,
 * Fraud Alerts, Audit Log, Staff Management, Accounts). The list does
 * NOT refetch on every keystroke — that fires noisy backend traffic and
 * can flicker partial-match results as the user types. Instead the input
 * holds two distinct values:
 *
 *   - {@code draft}     — what the user is currently typing (controlled).
 *   - {@code committed} — the last value the user explicitly submitted by
 *                         pressing Enter or clicking the search/clear
 *                         button. This is what's passed to the BE.
 *
 * Pages call the hook once and bind the input via {@code bind}:
 *
 * ```tsx
 * const search = useEnterSearch();
 * const items = useInfiniteClients({ q: search.committed });
 * <input {...search.bind} placeholder="Press Enter to search" />
 * ```
 *
 * The same hook works for any column-set on the BE — each page tells the
 * BE which fields to search via the existing query string. The BE side
 * already handles full-row search via {@code SearchSpecification}.
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
  /** Reset both draft and committed to empty. */
  clear: () => void;
  /** Convenience spread for the underlying input — handles Enter for you. */
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
