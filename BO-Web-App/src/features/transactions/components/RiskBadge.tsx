import type { RiskLevel } from "../api";

const STYLES: Record<RiskLevel, { classes: string; dot: string }> = {
  LOW:    { classes: "bg-[#dff7ec] text-[#1c7a52] ring-1 ring-inset ring-[#a4dec3]", dot: "bg-[#33cc8c]" },
  MEDIUM: { classes: "bg-[#fdebe0] text-[#8a4a1c] ring-1 ring-inset ring-[#e9c1a0]", dot: "bg-[#cf821a]" },
  HIGH:   { classes: "bg-[#fbe1e1] text-[#8a2424] ring-1 ring-inset ring-[#e6a4a4]", dot: "bg-[#c93b3a]" },
};

/**
 * Small risk badge for transaction rows / fraud alerts. Renders a dash
 * placeholder when the level is null (transfers that never reached scoring).
 */
export function RiskBadge({ level }: { level: RiskLevel | null }) {
  if (!level) {
    return <span className="font-sans text-[11px] text-text-faint">—</span>;
  }
  const style = STYLES[level];
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5",
        "font-sans text-[10px] font-bold tracking-[0.6px]",
        style.classes,
      ].join(" ")}
    >
      <span className={["size-[6px] shrink-0 rounded-full", style.dot].join(" ")} aria-hidden />
      {level}
    </span>
  );
}
