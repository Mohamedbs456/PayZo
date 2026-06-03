import type { ClientStatus } from "../api";

interface PillStyle {
  /** Pill bg + ring (translucent fill, solid border same hue). */
  classes: string;
  /** Bullet dot color (the small filled circle on the left). */
  dot: string;
  label: string;
}

const STYLES: Record<ClientStatus, PillStyle> = {
  PENDING:  { label: "PENDING",  classes: "bg-[#fdf3df] text-[#8a6d1f] ring-1 ring-inset ring-[#e8cf85]", dot: "bg-[#d4a015]" },
  ACCEPTED: { label: "ACCEPTED", classes: "bg-[#dff0fb] text-[#1f5d8a] ring-1 ring-inset ring-[#9bc8e6]", dot: "bg-[#1f7fc0]" },
  ACTIVE:   { label: "ACTIVE",   classes: "bg-[#dff7ec] text-[#1c7a52] ring-1 ring-inset ring-[#a4dec3]", dot: "bg-[#33cc8c]" },
  BLOCKED:  { label: "BLOCKED",  classes: "bg-[#fbe1e1] text-[#8a2424] ring-1 ring-inset ring-[#e6a4a4]", dot: "bg-[#c93b3a]" },
  REJECTED: { label: "REJECTED", classes: "bg-[#ece9e4] text-[#5c4a3a] ring-1 ring-inset ring-[#cdc3b6]", dot: "bg-[#8f857b]" },
};

/**
 * Status pill matching the Clients page screenshot — bullet dot + label,
 * tinted by status. Five hues, tuned to the brand cream palette.
 */
export function ClientStatusPill({ status }: { status: ClientStatus }) {
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
