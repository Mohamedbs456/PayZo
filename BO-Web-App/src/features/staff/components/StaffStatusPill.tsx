import type { StaffStatus } from "../api";

const STYLES: Record<StaffStatus, { label: string; classes: string; dot: string }> = {
  ACTIVE:  { label: "ACTIVE",  classes: "bg-[#dff7ec] text-[#1c7a52] ring-1 ring-inset ring-[#a4dec3]", dot: "bg-[#33cc8c]" },
  BLOCKED: { label: "BLOCKED", classes: "bg-[#fbe1e1] text-[#8a2424] ring-1 ring-inset ring-[#e6a4a4]", dot: "bg-[#c93b3a]" },
  PENDING: { label: "PENDING", classes: "bg-[#fdf3df] text-[#8a6d1f] ring-1 ring-inset ring-[#e8cf85]", dot: "bg-[#d4a015]" },
};

export function StaffStatusPill({ status }: { status: StaffStatus }) {
  const s = STYLES[status];
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5",
        "font-sans text-[10px] font-bold tracking-[0.6px]",
        s.classes,
      ].join(" ")}
    >
      <span className={["size-[6px] shrink-0 rounded-full", s.dot].join(" ")} aria-hidden />
      {s.label}
    </span>
  );
}
