import { ShieldCheck } from "lucide-react";

interface AlertsHeroProps {
  /** Total alerts created in the current month — drives the big numeric. */
  monthlyCount: number;
}

/**
 * Educational hero strip pinned above the filter bar (Figma 208:25).
 * Accent-soft background + white shield-check tile on the left + a tall
 * bold count on the right. Copy mirrors the Figma exactly.
 */
export function AlertsHero({ monthlyCount }: AlertsHeroProps) {
  return (
    <section className="flex flex-col items-start gap-4 rounded-[16px] bg-accent-soft px-7 py-6 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex min-w-0 flex-1 items-center gap-[18px]">
        <span
          aria-hidden
          className="flex size-[54px] shrink-0 items-center justify-center rounded-[14px] bg-surface-card"
        >
          <ShieldCheck
            className="size-[30px] text-accent"
            strokeWidth={1.8}
          />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-sans text-[18px] font-bold leading-tight text-text-primary">
            Your transfers protected by ML fraud detection
          </p>
          <p className="font-sans text-[13px] leading-[1.55] text-text-secondary">
            Every outgoing transfer is scored in real time. Suspicious ones
            are paused for analyst review before any money moves. You'll see
            them all here.
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end whitespace-nowrap">
        <p className="font-sans text-[36px] font-bold leading-none text-text-primary">
          {monthlyCount}
        </p>
        <p
          className="font-sans text-[10px] font-bold uppercase tracking-[0.08em] text-text-secondary"
          style={{ fontVariationSettings: "'wdth' 100" }}
        >
          Alerts this month
        </p>
      </div>
    </section>
  );
}
