import type { TransactionStatus } from "../api";

interface PillStyle {
  classes: string;
  dot: string;
  label: string;
}

const STYLES: Record<TransactionStatus, PillStyle> = {
  PENDING_OTP: {
    label: "PENDING OTP",
    classes: "bg-[#fdf3df] text-[#8a6d1f] ring-1 ring-inset ring-[#e8cf85]",
    dot: "bg-[#d4a015]",
  },
  PENDING_SCORING: {
    label: "SCORING",
    classes: "bg-[#fdf3df] text-[#8a6d1f] ring-1 ring-inset ring-[#e8cf85]",
    dot: "bg-[#d4a015]",
  },
  APPROVED: {
    label: "APPROVED",
    classes: "bg-[#dff7ec] text-[#1c7a52] ring-1 ring-inset ring-[#a4dec3]",
    dot: "bg-[#33cc8c]",
  },
  REJECTED: {
    label: "REJECTED",
    classes: "bg-[#fbe1e1] text-[#8a2424] ring-1 ring-inset ring-[#e6a4a4]",
    dot: "bg-[#c93b3a]",
  },
  SUSPENDED_PENDING_ANALYST: {
    label: "SUSPENDED",
    classes: "bg-[#fdebe0] text-[#8a4a1c] ring-1 ring-inset ring-[#e9c1a0]",
    dot: "bg-[#cf821a]",
  },
  CANCELLED: {
    label: "CANCELLED",
    // Neutral grey palette — money never moved, no fraud verdict. Distinct
    // from the red REJECTED to keep the row scannable at a glance.
    classes: "bg-[#eceef1] text-[#54606e] ring-1 ring-inset ring-[#c8cfd7]",
    dot: "bg-[#8d97a3]",
  },
};

/**
 * 5-state status pill aligned to the Clients-page hue family. We collapse
 * `PENDING_OTP` and `PENDING_SCORING` into the same yellow palette since
 * they're both "in flight" from the BO's perspective; only the label
 * differs to keep the row scannable.
 */
export function TransactionStatusPill({ status }: { status: TransactionStatus }) {
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
