import type { AlertStatus } from "../api";

const STYLES: Record<AlertStatus, { classes: string; dot: string; label: string }> = {
  PENDING:   { label: "PENDING",   classes: "bg-[#fdebe0] text-[#8a4a1c] ring-1 ring-inset ring-[#e9c1a0]", dot: "bg-[#cf821a]" },
  VALIDATED: { label: "APPROVED",  classes: "bg-[#dff7ec] text-[#1c7a52] ring-1 ring-inset ring-[#a4dec3]", dot: "bg-[#33cc8c]" },
  REJECTED:  { label: "FRAUD",     classes: "bg-[#fbe1e1] text-[#8a2424] ring-1 ring-inset ring-[#e6a4a4]", dot: "bg-[#c93b3a]" },
};

/**
 * Three-state status pill for fraud alerts. The wire enum uses VALIDATED /
 * REJECTED but the analyst-facing labels read as "APPROVED" (= not fraud,
 * transfer executed) and "FRAUD" (= confirmed fraud, transfer cancelled) —
 * less semantic friction at a glance.
 */
export function AlertStatusPill({ status }: { status: AlertStatus }) {
  const style = STYLES[status];
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5",
        "font-sans text-[10px] font-bold tracking-[0.6px]",
        style.classes,
      ].join(" ")}
    >
      <span className={["size-[6px] shrink-0 rounded-full", style.dot].join(" ")} aria-hidden />
      {style.label}
    </span>
  );
}
