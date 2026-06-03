import { useEffect, useRef, useState } from "react";
import { NotificationDropdown } from "@/features/notifications/components/NotificationDropdown";
import { useUnreadCount } from "@/features/notifications/hooks";

interface TopbarProps {
  title: string;
  subtitle?: string;
}

const MONTH_ABBR = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];
const WEEKDAY = [
  "Sunday", "Monday", "Tuesday", "Wednesday",
  "Thursday", "Friday", "Saturday",
];

export function Topbar({ title, subtitle }: TopbarProps) {
  return (
    <header className="flex h-[84px] w-full shrink-0 items-center overflow-x-clip border-b-2 border-brand-medium bg-brand-cream px-8">
      {/* Fixed-width title slot — keeps DateTimeWidget pinned at the same x
          across pages so it doesn't slide when titles change length. */}
      <div className="flex w-[260px] shrink-0 flex-col items-start overflow-hidden whitespace-nowrap leading-none">
        <p className="truncate font-sans text-[18px] font-bold text-text-primary">
          {title}
        </p>
        {subtitle && (
          <p className="mt-1 truncate font-sans text-[12px] font-normal text-brand-medium">
            {subtitle}
          </p>
        )}
      </div>

      <DateTimeWidget />

      <div className="min-w-0 flex-1" />

      <BellButton />
    </header>
  );
}

function DateTimeWidget() {
  const now = useTickingClock();
  const day = String(now.getDate()).padStart(2, "0");
  const month = MONTH_ABBR[now.getMonth()];
  const weekday = WEEKDAY[now.getDay()];
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");

  return (
    <div className="-ml-12 flex h-[62px] w-[492px] shrink-0 items-center gap-3 overflow-hidden rounded-xl border border-brand-cream-2 bg-white px-3">
      {/* Box A — day badge + weekday + location, all vertically centered */}
      <div className="flex shrink-0 items-center gap-2.5">
        <div className="flex shrink-0 flex-col items-center justify-center gap-0 overflow-hidden whitespace-nowrap rounded-lg bg-brand-cream px-2.5 py-1.5">
          <p className="font-mono text-[16px] font-bold leading-[18px] text-text-primary">
            {day}
          </p>
          <p className="font-sans text-[9px] font-bold leading-[11px] tracking-[1.44px] text-brand-medium">
            {month}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-1 overflow-hidden whitespace-nowrap leading-none">
          <p className="font-sans text-[11px] font-semibold text-brand-medium">
            {weekday}
          </p>
          <div className="flex items-center gap-1.5">
            <span className="size-[3px] shrink-0 rounded-full bg-text-muted" />
            <p className="font-sans text-[10px] font-medium tracking-[0.4px] text-text-muted">
              Monastir · Tunisia
            </p>
          </div>
        </div>
      </div>

      <div className="min-w-0 flex-1" />

      {/* Box B — time, vertically centered */}
      <div className="flex shrink-0 items-baseline overflow-hidden whitespace-nowrap leading-none">
        <p className="font-mono text-[22px] font-bold tracking-[0.22px] text-text-primary">
          {hh}:{mm}
        </p>
        <p className="font-mono text-[14px] font-medium tracking-[0.14px] text-text-faint">
          :{ss}
        </p>
      </div>

      <div className="min-w-0 flex-1" />

      {/* Box C — currency rates (faked, ticks every 10s) */}
      <CurrencyBox />
    </div>
  );
}

interface FakeRate {
  rate: number;
  deltaPct: number;
}

/**
 * Decorative live-rates box. Drift-style random walk every 10 seconds
 * so the tape feels alive without hammering any real FX endpoint.
 *
 *   - Rates wander inside realistic bands for TND (USD 3.05–3.20,
 *     EUR 3.30–3.55).
 *   - The displayed % drift is a separate slow random walk capped at
 *     ±3% so it reads like a "today's change" figure.
 *   - Sign flips colors and the ▲/▼ glyph automatically.
 */
function CurrencyBox() {
  const [usd, setUsd] = useState<FakeRate>({ rate: 3.12, deltaPct: 0.34 });
  const [eur, setEur] = useState<FakeRate>({ rate: 3.42, deltaPct: -0.18 });

  useEffect(() => {
    const tick = () => {
      setUsd((prev) => nextFakeRate(prev, { min: 3.05, max: 3.2, jitter: 0.005 }));
      setEur((prev) => nextFakeRate(prev, { min: 3.3, max: 3.55, jitter: 0.006 }));
    };
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative flex h-10 w-[170px] shrink-0 items-center gap-2.5 overflow-hidden rounded-lg bg-brand-cream pl-2.5 pr-3">
      <p className="font-sans text-[11px] font-bold text-text-primary">TND</p>
      <span className="h-6 w-px shrink-0 bg-[#664d33]" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 overflow-hidden whitespace-nowrap leading-none">
        <RateRow code="USD" rate={usd.rate} deltaPct={usd.deltaPct} />
        <RateRow code="EUR" rate={eur.rate} deltaPct={eur.deltaPct} />
      </div>
    </div>
  );
}

function RateRow({
  code,
  rate,
  deltaPct,
}: {
  code: string;
  rate: number;
  deltaPct: number;
}) {
  const up = deltaPct >= 0;
  const arrow = up ? "▲" : "▼";
  const sign = up ? "+" : "−";
  return (
    <p
      className={`font-sans text-[10px] ${up ? "text-positive" : "text-negative"}`}
    >
      {code} {rate.toFixed(2)}{" "}
      <span className="font-medium">
        {arrow} {sign}
        {Math.abs(deltaPct).toFixed(2)}%
      </span>
    </p>
  );
}

/**
 * One step of the random walk. Drifts both `rate` and `deltaPct` slightly,
 * keeping each within configured bounds. Pure (no side effects) so React's
 * `useState` updater pattern works cleanly under StrictMode double-invoke.
 */
function nextFakeRate(
  prev: FakeRate,
  bounds: { min: number; max: number; jitter: number },
): FakeRate {
  const rateStep = (Math.random() - 0.5) * 2 * bounds.jitter;
  const rate = clamp(prev.rate + rateStep, bounds.min, bounds.max);
  // Delta wanders by up to ±0.4 pp per tick, capped at ±3%. Inertia: 70%
  // of the previous delta is preserved so it doesn't snap around.
  const deltaStep = (Math.random() - 0.5) * 0.8;
  const deltaPct = clamp(prev.deltaPct * 0.7 + deltaStep, -3, 3);
  return { rate, deltaPct };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Bell button + anchored dropdown. Owns the unread-count poll (every 30s)
 * and orchestrates open/close state. Click anywhere outside (or Escape)
 * closes the dropdown; the optimistic `onMarkedRead` callback keeps the
 * red dot in sync with row clicks without waiting for the next poll.
 */
function BellButton() {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const { count, adjust } = useUnreadCount();

  // Click-outside + Escape close. Only attached while the dropdown is open
  // so we don't pay event-listener cost on every page that has the topbar.
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const node = wrapperRef.current;
      if (node && !node.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="relative flex size-[50px] shrink-0 items-center justify-center overflow-visible rounded-[10px] border border-brand-cream-2 bg-white transition-all duration-150 ease-out hover:scale-[1.04] hover:shadow-[0_4px_12px_rgba(14,27,44,0.10)]"
      >
        {/* Bell — Figma node 79:100. */}
        <svg width="27" height="29" viewBox="0 0 27 29" fill="none" aria-hidden>
          <path
            d="M6.75 9.66675C6.75 7.74393 7.46116 5.89986 8.72703 4.54022C9.9929 3.18059 11.7098 2.41675 13.5 2.41675C15.2902 2.41675 17.0071 3.18059 18.273 4.54022C19.5388 5.89986 20.25 7.74393 20.25 9.66675C20.25 18.1251 23.625 20.5417 23.625 20.5417H3.375C3.375 20.5417 6.75 18.1251 6.75 9.66675Z"
            stroke="#2A1F14"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M11.5875 25.5132C11.7758 25.881 12.0526 26.1879 12.389 26.4015C12.7254 26.6152 13.1091 26.728 13.5 26.728C13.8908 26.728 14.2745 26.6152 14.6109 26.4015C14.9473 26.1879 15.2242 25.881 15.4125 25.5132"
            stroke="#2A1F14"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {/* Red unread dot — overlays the top-right of the bell when count > 0.
            Positioned outside the SVG so it doesn't get clipped, and ringed
            with white so it pops against the bell button's cream background. */}
        {count > 0 && (
          <span
            className="absolute right-[10px] top-[10px] size-[10px] rounded-full bg-danger ring-2 ring-white"
            aria-label={`${count} unread notification${count === 1 ? "" : "s"}`}
          />
        )}
      </button>

      <NotificationDropdown
        open={open}
        unreadCount={count}
        onMarkedRead={() => adjust(-1)}
      />
    </div>
  );
}

function useTickingClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}
