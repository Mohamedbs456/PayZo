import {
  Ban,
  Bell,
  Building2,
  CheckCircle2,
  LogIn,
  ShieldAlert,
  Sliders,
  Unlink,
  Unlock,
  UserMinus,
  UserPlus,
  type LucideProps,
} from "lucide-react";
import type { ComponentType } from "react";
import type { NotificationType } from "../api";

interface IconStyle {
  Icon: ComponentType<LucideProps>;
  /** Tailwind classes for the rounded icon tile (bg + text color). */
  classes: string;
}

/**
 * Icon + tile-color per notification type. Tones are picked from the brand
 * palette so the dropdown reads like one cohesive surface — positive events
 * pick up the green from status pills, destructive ones the red, etc.
 */
const ICON_STYLES: Record<string, IconStyle> = {
  // Admin
  NEW_PENDING_REGISTRATION: { Icon: UserPlus,    classes: "bg-[#fdf3df] text-[#8a6d1f]" },
  CLIENT_FIRST_LOGIN:       { Icon: LogIn,       classes: "bg-[#dff7ec] text-[#1c7a52]" },

  // Analyst
  FRAUD_ALERT_PENDING:      { Icon: ShieldAlert, classes: "bg-[#fbe1e1] text-[#8a2424]" },
  ML_PRIMARY_DOWN:          { Icon: ShieldAlert, classes: "bg-[#fbe1e1] text-[#8a2424]" },
  ML_PRIMARY_UP:            { Icon: CheckCircle2,classes: "bg-[#dff7ec] text-[#1c7a52]" },
  ML_BACKUP_DOWN:           { Icon: ShieldAlert, classes: "bg-[#fbe1e1] text-[#8a2424]" },
  ML_THRESHOLDS_UPDATED:    { Icon: Sliders,     classes: "bg-brand-cream-2/60 text-brand-medium" },

  // SuperAdmin
  ANALYST_THRESHOLD_REPORT: { Icon: Sliders,     classes: "bg-brand-cream-2/60 text-brand-medium" },
  ML_BACKUP_UP:             { Icon: CheckCircle2,classes: "bg-[#dff7ec] text-[#1c7a52]" },
  ADMIN_CREATED:            { Icon: UserPlus,    classes: "bg-brand-cream-2/60 text-brand-medium" },
  ADMIN_DELETED:            { Icon: UserMinus,   classes: "bg-brand-cream-2/60 text-text-muted" },
  ANALYST_CREATED:          { Icon: UserPlus,    classes: "bg-brand-cream-2/60 text-brand-medium" },
  ANALYST_DELETED:          { Icon: UserMinus,   classes: "bg-brand-cream-2/60 text-text-muted" },
  // BANK_ADDED fires when CBS sync detects a new bank awaiting SA review;
  // BANK_REMOVED_FROM_CBS fires when a bank disappears from the CBS catalog
  // and is auto-deactivated. Both are SA-only.
  BANK_ADDED:               { Icon: Building2,   classes: "bg-brand-cream-2/60 text-brand-medium" },
  BANK_REMOVED_FROM_CBS:    { Icon: Unlink,      classes: "bg-[#fbe1e1] text-[#8a2424]" },
  CLIENT_BLOCKED:           { Icon: Ban,         classes: "bg-[#fbe1e1] text-[#8a2424]" },
  CLIENT_UNBLOCKED:         { Icon: Unlock,      classes: "bg-[#dff7ec] text-[#1c7a52]" },

  // Shared
  COLLEAGUE_JOINED:         { Icon: UserPlus,    classes: "bg-[#dff7ec] text-[#1c7a52]" },
  COLLEAGUE_LEFT:           { Icon: UserMinus,   classes: "bg-brand-cream-2/60 text-text-muted" },
};

const FALLBACK: IconStyle = { Icon: Bell, classes: "bg-brand-cream-2/60 text-brand-medium" };

/**
 * Square rounded tile placed at the left edge of every notification row.
 * Rendered at 36px to match the spec's compact vertical rhythm.
 */
export function NotificationIcon({ type }: { type: NotificationType }) {
  const style = ICON_STYLES[type] ?? FALLBACK;
  const Icon = style.Icon;
  return (
    <div
      className={[
        "flex size-9 shrink-0 items-center justify-center rounded-lg",
        style.classes,
      ].join(" ")}
      aria-hidden
    >
      <Icon className="size-4" />
    </div>
  );
}
