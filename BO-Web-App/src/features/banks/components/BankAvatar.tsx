import { chartColorFor } from "@/features/dashboard/palette";

interface BankAvatarProps {
  /** Bank code — drives the unique color from the dashboard palette. */
  code: string;
  /** Optional uploaded logo URL. When present, renders as an image. */
  logoUrl?: string | null;
  /** Render size in px. Defaults to 32. */
  size?: number;
}

/**
 * Bank avatar — solid colored tile (no letters / no icon) so the bank's
 * identity reads as a single uniform color across the dashboard donut, line
 * chart, dropdown rows, and tables. The same `chartColorFor(code)` palette
 * is used everywhere, so a bank that's terracotta in the donut is
 * terracotta here too. Falls back from a real `logoUrl` when one is set.
 */
export function BankAvatar({ code, logoUrl, size = 32 }: BankAvatarProps) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={code}
        width={size}
        height={size}
        className="shrink-0 rounded-lg object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-lg font-mono font-bold text-white ring-1 ring-inset ring-black/5"
      style={{
        width: size,
        height: size,
        backgroundColor: chartColorFor(code),
        fontSize: Math.round(size * 0.32),
      }}
      aria-label={code}
      title={code}
    >
      {code}
    </div>
  );
}
