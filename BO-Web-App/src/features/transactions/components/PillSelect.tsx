import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface PillSelectOption<T extends string> {
  value: T | null;
  label: string;
}

interface PillSelectProps<T extends string> {
  /** Leading icon element (already sized e.g. `size-4`). */
  icon: ReactNode;
  /** Placeholder shown when value is null. */
  placeholder: string;
  value: T | null;
  options: PillSelectOption<T>[];
  onChange: (value: T | null) => void;
  /** Render width — defaults to a compact value that fits 5 toolbar pills. */
  panelWidthPx?: number;
}

/**
 * Generic toolbar dropdown matching the style of `BankFilterDropdown`. Used
 * for status / risk / amount-band / period filters on the Transactions page.
 *
 * The trigger is a `role="button"` div so the panel anchor stays valid HTML
 * even if a clear-X is added later — same pattern locked in for the Bank one.
 */
export function PillSelect<T extends string>({
  icon,
  placeholder,
  value,
  options,
  onChange,
  panelWidthPx = 200,
}: PillSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

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

  const current = options.find((o) => o.value === value);

  return (
    <div ref={wrapperRef} className="relative shrink-0">
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
        className="flex h-10 cursor-pointer items-center gap-2 rounded-full bg-white pl-3.5 pr-3 font-sans text-[12px] font-semibold text-text-primary shadow-[0_1px_2px_0_rgba(42,31,20,0.04),0_8px_24px_-6px_rgba(42,31,20,0.10)] transition-all duration-150 ease-out hover:bg-brand-cream/40"
      >
        <span className={value ? "text-text-primary" : "text-text-muted"}>{icon}</span>
        <span className={value ? "text-text-primary" : "text-text-muted"}>
          {current?.label ?? placeholder}
        </span>
        <ChevronDown
          className={[
            "ml-1 size-4 text-text-faint transition-transform duration-150 ease-out",
            open ? "rotate-180" : "",
          ].join(" ")}
          aria-hidden
        />
      </div>

      {open && (
        // Anchored `left-0` for the same reason as BankFilterDropdown — these
        // selects sit on the left edge of the toolbar; `right-0` would push
        // the panel into the sidebar.
        <div
          className="absolute left-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-xl bg-white shadow-[0_12px_40px_-8px_rgba(42,31,20,0.20)] ring-1 ring-brand-cream-2"
          style={{ width: panelWidthPx }}
        >
          <div className="max-h-[320px] overflow-y-auto py-1">
            {options.map((opt) => {
              const isActive = value === opt.value;
              return (
                <button
                  key={String(opt.value ?? "__all__")}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={[
                    "flex w-full items-center px-3 py-2 text-left font-sans text-[12px] transition-colors duration-150 ease-out hover:bg-brand-cream/40",
                    isActive ? "bg-brand-cream/50 font-semibold text-text-primary" : "text-text-muted",
                  ].join(" ")}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
