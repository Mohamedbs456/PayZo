import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { resolveBackendUrl } from "@/lib/backendUrl";
import { useToast } from "@/components/ui/Toast";
import type { BeneficiaryResponse } from "@/features/transfers/beneficiariesApi";

interface Props {
  items: BeneficiaryResponse[];
  busy: boolean;
  onTap: (b: BeneficiaryResponse) => void;
  onRemoveFavorite: (b: BeneficiaryResponse) => void;
  onOpenInList: (b: BeneficiaryResponse) => void;
}

interface MenuState {
  beneficiary: BeneficiaryResponse;
  x: number;
  y: number;
}

const EXIT_MS = 150;
const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD = 8;

/**
 * Messenger/Instagram-stories-style horizontal bubble row of favourited
 * beneficiaries. A pure projection of the parent list state — the in-card
 * star is still the single source of truth for add/remove.
 */
export function FavoritesBubbles({
  items,
  busy,
  onTap,
  onRemoveFavorite,
  onOpenInList,
}: Props) {
  const toast = useToast();
  const favorites = useMemo(() => items.filter((b) => b.favorite), [items]);

  // `displayed` lags `favorites` so exiting bubbles get 150ms to fade out
  // before they unmount; `entering` flags new bubbles for one paint frame so
  // their initial `opacity-0` transitions to `opacity-100`.
  const [displayed, setDisplayed] = useState(favorites);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [entering, setEntering] = useState<Set<string>>(new Set());
  const [imgBroken, setImgBroken] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<MenuState | null>(null);
  const prevIdsRef = useRef<Set<string>>(new Set(favorites.map((b) => b.id)));

  useEffect(() => {
    const currentIds = new Set(favorites.map((b) => b.id));
    const justEntered = favorites
      .filter((b) => !prevIdsRef.current.has(b.id))
      .map((b) => b.id);
    const justLeft = displayed
      .filter((b) => !currentIds.has(b.id))
      .map((b) => b.id);

    prevIdsRef.current = currentIds;

    let exitTimer: number | undefined;
    let enterFrame1: number | undefined;
    let enterFrame2: number | undefined;

    if (justEntered.length > 0) {
      setEntering((prev) => new Set([...prev, ...justEntered]));
      // Double rAF guarantees the browser paints the initial `opacity-0`
      // before we strip the flag, so the transition actually fires.
      enterFrame1 = window.requestAnimationFrame(() => {
        enterFrame2 = window.requestAnimationFrame(() => {
          setEntering((prev) => {
            const next = new Set(prev);
            justEntered.forEach((id) => next.delete(id));
            return next;
          });
        });
      });
    }

    if (justLeft.length > 0) {
      setLeaving((prev) => new Set([...prev, ...justLeft]));
      exitTimer = window.setTimeout(() => {
        setLeaving((prev) => {
          const next = new Set(prev);
          justLeft.forEach((id) => next.delete(id));
          return next;
        });
        setDisplayed(favorites);
      }, EXIT_MS);
    } else {
      // No exits — sync immediately so adds and reorders show up now.
      setDisplayed(favorites);
    }

    return () => {
      if (exitTimer !== undefined) window.clearTimeout(exitTimer);
      if (enterFrame1 !== undefined) window.cancelAnimationFrame(enterFrame1);
      if (enterFrame2 !== undefined) window.cancelAnimationFrame(enterFrame2);
    };
    // displayed intentionally omitted — we only react to upstream changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favorites]);

  // Empty state: there are beneficiaries but none are starred.
  if (favorites.length === 0 && displayed.length === 0) {
    return (
      <EmptyBubble
        onClick={() =>
          toast.showToast({
            tier: "info",
            message: "Tap the ★ on a recipient card below to add it here.",
          })
        }
      />
    );
  }

  return (
    <>
      <div
        role="list"
        aria-label="Favourite recipients"
        className="-mx-1 flex snap-x snap-proximity items-start gap-1.5 overflow-x-auto px-1 pb-1 pt-1 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {displayed.map((b) => (
          <Bubble
            key={b.id}
            b={b}
            leaving={leaving.has(b.id)}
            entering={entering.has(b.id)}
            busy={busy}
            imgBroken={!!imgBroken[b.id]}
            onImgError={() =>
              setImgBroken((prev) => ({ ...prev, [b.id]: true }))
            }
            onTap={onTap}
            onOpenMenu={(x, y) => setMenu({ beneficiary: b, x, y })}
          />
        ))}
      </div>

      {menu && (
        <BubbleMenu
          state={menu}
          onClose={() => setMenu(null)}
          onRemove={() => {
            onRemoveFavorite(menu.beneficiary);
            setMenu(null);
          }}
          onOpenInList={() => {
            onOpenInList(menu.beneficiary);
            setMenu(null);
          }}
        />
      )}
    </>
  );
}

/* ─── Bubble ──────────────────────────────────────────────────────────── */

function Bubble({
  b,
  leaving,
  entering,
  busy,
  imgBroken,
  onImgError,
  onTap,
  onOpenMenu,
}: {
  b: BeneficiaryResponse;
  leaving: boolean;
  entering: boolean;
  busy: boolean;
  imgBroken: boolean;
  onImgError: () => void;
  onTap: (b: BeneficiaryResponse) => void;
  onOpenMenu: (x: number, y: number) => void;
}) {
  const timer = useRef<number | null>(null);
  const start = useRef({ x: 0, y: 0 });
  const longPressFired = useRef(false);

  const label = displayLabel(b);
  const showImage = !!b.profilePictureUrl && b.payzoUser && !imgBroken;

  const clear = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    longPressFired.current = false;
    start.current = { x: e.clientX, y: e.clientY };
    timer.current = window.setTimeout(() => {
      longPressFired.current = true;
      onOpenMenu(e.clientX, e.clientY);
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (
      Math.abs(e.clientX - start.current.x) > MOVE_THRESHOLD ||
      Math.abs(e.clientY - start.current.y) > MOVE_THRESHOLD
    ) {
      clear();
    }
  };

  const handleClick = () => {
    if (longPressFired.current || busy) return;
    onTap(b);
  };

  return (
    <button
      type="button"
      role="listitem"
      aria-label={`Send money to ${b.displayName}`}
      disabled={busy}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={clear}
      onPointerCancel={clear}
      onPointerLeave={clear}
      onContextMenu={(e) => {
        e.preventDefault();
        clear();
        onOpenMenu(e.clientX, e.clientY);
      }}
      onClick={handleClick}
      className={cn(
        "flex shrink-0 snap-start flex-col items-center gap-1.5 rounded-[10px] px-1.5 py-1 outline-none transition-[opacity,transform] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60",
        leaving && "opacity-0 motion-safe:-translate-y-1",
        entering && "opacity-0 motion-safe:translate-y-1",
      )}
    >
      <span className="flex size-14 items-center justify-center overflow-hidden rounded-full ring-2 ring-accent ring-offset-2 ring-offset-surface-soft">
        {showImage ? (
          <img
            src={resolveBackendUrl(b.profilePictureUrl)}
            alt=""
            onError={onImgError}
            className="size-full rounded-full object-cover"
          />
        ) : (
          <span className="flex size-full items-center justify-center rounded-full bg-[image:var(--gradient-brand)] font-sans text-[16px] font-semibold text-text-on-inverse">
            {b.initials}
          </span>
        )}
      </span>
      <span className="block max-w-[64px] truncate font-sans text-[11px] font-semibold text-text-primary">
        {label}
      </span>
    </button>
  );
}

/* ─── Empty state bubble ──────────────────────────────────────────────── */

function EmptyBubble({ onClick }: { onClick: () => void }) {
  return (
    <div className="-mx-1 flex items-start gap-3 px-1 pb-1 pt-1">
      <button
        type="button"
        onClick={onClick}
        aria-label="How to add a favourite recipient"
        className="flex shrink-0 flex-col items-center gap-1.5 rounded-[10px] px-1.5 py-1 outline-none transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="flex size-14 items-center justify-center rounded-full border-2 border-dashed border-text-muted/50">
          <Plus
            className="size-5 text-text-muted"
            strokeWidth={2}
            aria-hidden
          />
        </span>
        <span className="block max-w-[120px] truncate font-sans text-[11px] font-medium text-text-secondary">
          Star a recipient to add
        </span>
      </button>
    </div>
  );
}

/* ─── Context menu ────────────────────────────────────────────────────── */

function BubbleMenu({
  state,
  onClose,
  onRemove,
  onOpenInList,
}: {
  state: MenuState;
  onClose: () => void;
  onRemove: () => void;
  onOpenInList: () => void;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({
    left: state.x,
    top: state.y,
  });

  // Clamp the menu inside the viewport once it's rendered (we know its size).
  useLayoutEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const padding = 8;
    let left = state.x;
    let top = state.y;
    if (left + rect.width + padding > window.innerWidth) {
      left = window.innerWidth - rect.width - padding;
    }
    if (top + rect.height + padding > window.innerHeight) {
      top = window.innerHeight - rect.height - padding;
    }
    setPos({ left: Math.max(padding, left), top: Math.max(padding, top) });
  }, [state.x, state.y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        ref={menuRef}
        role="menu"
        aria-label={`Actions for ${state.beneficiary.displayName}`}
        onClick={(e) => e.stopPropagation()}
        style={{ left: pos.left, top: pos.top }}
        className="fixed z-50 min-w-[200px] overflow-hidden rounded-[10px] border border-border-soft bg-surface-card shadow-[0px_12px_32px_rgba(0,0,0,0.18)]"
      >
        <button
          type="button"
          role="menuitem"
          onClick={onRemove}
          className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left font-sans text-[13px] font-medium text-negative transition-colors duration-150 ease-out hover:bg-negative-soft"
        >
          Remove from favourites
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={onOpenInList}
          className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left font-sans text-[13px] font-medium text-text-primary transition-colors duration-150 ease-out hover:bg-accent-soft"
        >
          Open beneficiary
        </button>
      </div>
    </div>
  );
}

/* ─── helpers ─────────────────────────────────────────────────────────── */

function displayLabel(b: BeneficiaryResponse): string {
  const source = b.nickname?.trim() || b.displayName.trim().split(/\s+/)[0] || "";
  return source.length > 10 ? source.slice(0, 10) + "…" : source;
}
