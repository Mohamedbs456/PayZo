import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { withDemo } from "@/lib/demoMode";

interface BalanceHeroCardProps {
  /** Sum of every active account's balance, in TND. */
  totalBalance: number;
  /** Distinct bank codes the user holds money in (e.g. ["BIAT","BNA","STB"]). */
  bankCodes: string[];
  /** Total active account count across those banks. */
  accountCount: number;
}

/**
 * Wide gradient hero (Figma 109:25). The teal cyan gradient is its
 * own token (`--gradient-balance`) so it can't be confused with the
 * navy auth gradient. "TODAY" date chip top-right, big 72px amount
 * with a TND suffix, account-count + bank chips, "VIEW ACCOUNTS →"
 * link at the bottom.
 */
export function BalanceHeroCard({
  totalBalance,
  bankCodes,
  accountCount,
}: BalanceHeroCardProps) {
  const { whole, fraction } = splitTndAmount(totalBalance);
  const formattedDate = formatDateChip(new Date());

  return (
    <Link
      to={withDemo("/accounts")}
      className="group relative flex h-full flex-col gap-4 overflow-hidden rounded-3xl border border-border-strong p-6 text-text-on-inverse shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] transition-transform duration-150 ease-out hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-soft sm:p-8 sm:gap-5 lg:gap-6"
      style={{ backgroundImage: "var(--gradient-balance)" }}
      aria-label="View all accounts"
    >
      <div className="flex items-center justify-between">
        <p
          className="font-sans text-[11px] font-medium uppercase tracking-[0.12em] text-[#bfdbf7]/85"
          style={{ fontVariationSettings: "'wdth' 100" }}
        >
          Total balance
        </p>
        <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/12 pl-3 pr-3.5 py-1.5">
          <span className="size-2 rounded-full bg-positive" aria-hidden />
          <span
            className="whitespace-pre font-sans text-[11px] font-medium uppercase tracking-[0.06em] text-text-on-inverse"
            style={{ fontVariationSettings: "'wdth' 100" }}
          >
            {formattedDate}
          </span>
        </span>
      </div>

      <div className="flex items-baseline gap-3">
        <p className="font-sans text-[clamp(40px,7vw,72px)] font-bold leading-none tracking-tight text-text-on-inverse">
          {whole}
          <span className="text-text-on-inverse/95">.{fraction}</span>
        </p>
        <p className="font-sans text-[clamp(20px,3vw,32px)] font-semibold text-[#bfdbf7]/60">
          TND
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <p className="font-sans text-[13px] text-text-on-inverse/70">
          {accountCount} accounts across {bankCodes.length} banks
        </p>
        <div className="flex items-center gap-2">
          {bankCodes.slice(0, 3).map((code) => (
            <span
              key={code}
              className="flex h-8 min-w-9 items-center justify-center rounded-lg border border-white/25 bg-white/16 px-1.5 font-sans text-[10px] font-bold uppercase tracking-[0.04em] text-text-on-inverse"
            >
              {code}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-auto flex items-center gap-1.5 text-[#bfdbf7] transition-transform duration-150 ease-out group-hover:translate-x-0.5">
        <span
          className="font-sans text-[12px] font-semibold uppercase tracking-[0.12em]"
          style={{ fontVariationSettings: "'wdth' 100" }}
        >
          View accounts
        </span>
        <ArrowRight className="size-3.5" strokeWidth={2.4} aria-hidden />
      </div>
    </Link>
  );
}

/** Splits a TND amount into "10,485" + "250" so the millimes can render
 *  in a slightly muted weight. Uses fr-TN locale conventions (comma as
 *  thousand separator) but with three decimals because TND has 1000
 *  millimes = 1 dinar. */
function splitTndAmount(value: number): { whole: string; fraction: string } {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const fixed = abs.toFixed(3); // 10485.250
  const [intPart, fracPart] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return { whole: sign + grouped, fraction: fracPart ?? "000" };
}

/** "2 MAY · 2026" — uppercase, en-US so the month abbrev is readable. */
function formatDateChip(d: Date): string {
  const day = d.getDate();
  const month = d
    .toLocaleString("en-US", { month: "short" })
    .toUpperCase();
  const year = d.getFullYear();
  return ` ${day} ${month}  ·  ${year}`;
}
