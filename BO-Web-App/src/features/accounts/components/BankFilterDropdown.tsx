import { useEffect, useRef, useState } from "react";
import { Building2, ChevronDown, X } from "lucide-react";
import { fetchBanks, type BankSummary } from "@/features/dashboard/api";
import { BankAvatar } from "@/features/banks/components/BankAvatar";

interface BankFilterDropdownProps {
  value: string | null;
  onChange: (bank: string | null) => void;
}

/**
 * Toolbar dropdown that picks one bank to filter the Accounts list by, or
 * clears the filter ("All banks"). Mounts/aborts the bank fetch lazily —
 * banks rarely change so we cache for the page's lifetime.
 */
export function BankFilterDropdown({ value, onChange }: BankFilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [banks, setBanks] = useState<BankSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchBanks(controller.signal)
      .then((page) => {
        // Active first, then alphabetical — matches the dashboard donut order.
        const sorted = [...page.content].sort((a, b) => {
          if (a.active !== b.active) return a.active ? -1 : 1;
          return a.code.localeCompare(b.code);
        });
        setBanks(sorted);
        setLoading(false);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        console.error("[accounts] bank list fetch failed", cause);
        setLoading(false);
      });
    return () => controller.abort();
  }, []);

  // Click outside + Escape close the menu.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const node = wrapperRef.current;
      if (node && !node.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = value ? banks.find((b) => b.code === value) : null;

  return (
    <div ref={wrapperRef} className="relative shrink-0">
      {/* The trigger is a div (not a button) so the optional clear-X can
          stay a real <button> without violating the "no nested buttons" HTML
          rule. The clear-X used to live inside another <button>, which made
          clicks ambiguous: some browsers fired both handlers, others ate
          one — that was the "glitchy" behavior. */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className="flex h-10 cursor-pointer items-center gap-2 rounded-full bg-white pl-3.5 pr-2 font-sans text-[12px] font-semibold text-text-primary shadow-[0_1px_2px_0_rgba(42,31,20,0.04),0_8px_24px_-6px_rgba(42,31,20,0.10)] transition-all duration-150 ease-out hover:bg-brand-cream/40"
      >
        {selected ? (
          <>
            <BankAvatar code={selected.code} size={22} />
            <span>{selected.code}</span>
          </>
        ) : (
          <>
            <Building2 className="size-4 text-text-muted" aria-hidden />
            <span className="text-text-muted">All banks</span>
          </>
        )}
        <ChevronDown
          className={[
            "ml-1 size-4 text-text-faint transition-transform duration-150 ease-out",
            open ? "rotate-180" : "",
          ].join(" ")}
          aria-hidden
        />
        {selected && (
          <button
            type="button"
            aria-label="Clear bank filter"
            onClick={(e) => {
              // Stop the click from bubbling to the role=button div above
              // (which would toggle the menu instead of just clearing).
              e.stopPropagation();
              onChange(null);
              setOpen(false);
            }}
            className="ml-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-text-faint transition-colors duration-150 ease-out hover:bg-brand-cream/60 hover:text-text-primary"
          >
            <X className="size-3" aria-hidden />
          </button>
        )}
      </div>

      {open && (
        // Anchored `left-0` (not right-0) — the trigger sits on the LEFT side
        // of the toolbar, so the panel needs to extend rightward into the page
        // content area; right-0 would push it leftward into the sidebar.
        <div className="absolute left-0 top-[calc(100%+6px)] z-30 w-[260px] overflow-hidden rounded-xl bg-white shadow-[0_12px_40px_-8px_rgba(42,31,20,0.20)] ring-1 ring-brand-cream-2">
          <div className="max-h-[320px] overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className={[
                "flex w-full items-center gap-2.5 px-3 py-2 font-sans text-[12px] transition-colors duration-150 ease-out hover:bg-brand-cream/40",
                value === null ? "font-semibold text-text-primary" : "text-text-muted",
              ].join(" ")}
            >
              <Building2 className="size-4 text-text-muted" aria-hidden />
              All banks
            </button>
            <div className="mx-3 my-1 h-px bg-brand-cream-2/60" />
            {loading && (
              <p className="px-3 py-2 font-sans text-[11px] text-text-faint">Loading banks…</p>
            )}
            {!loading &&
              banks.map((b) => {
                const isActive = value === b.code;
                return (
                  <button
                    key={b.code}
                    type="button"
                    onClick={() => {
                      onChange(b.code);
                      setOpen(false);
                    }}
                    disabled={!b.active}
                    className={[
                      "flex w-full items-center gap-2.5 px-3 py-2 text-left font-sans text-[12px] transition-colors duration-150 ease-out",
                      "hover:bg-brand-cream/40",
                      isActive ? "bg-brand-cream/50" : "",
                      !b.active ? "opacity-50 cursor-not-allowed" : "",
                    ].join(" ")}
                  >
                    <BankAvatar code={b.code} size={22} />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-mono text-text-primary">{b.code}</span>
                      <span className="ml-2 text-text-muted">{b.name}</span>
                    </span>
                    {!b.active && (
                      <span className="font-sans text-[9px] font-bold uppercase tracking-[0.6px] text-text-faint">
                        OFF
                      </span>
                    )}
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
