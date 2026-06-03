import { useState, type MouseEvent, type ReactNode } from "react";
import { Ban, Mail, MapPin, Pencil, Phone, Trash2, Unlock } from "lucide-react";
import { ConfirmDialog, type ConfirmVariant } from "@/components/ui/ConfirmDialog";
import { StaffAvatar } from "./StaffAvatar";
import { StaffStatusPill } from "./StaffStatusPill";
import { StaffFormDialog } from "./StaffFormDialog";
import {
  blockStaff,
  deleteAdmin as apiDeleteAdmin,
  deleteAnalyst as apiDeleteAnalyst,
  unblockStaff,
  type StaffMember,
} from "../api";

interface StaffMemberExpandedProps {
  member: StaffMember;
  onCollapse: () => void;
  onDeleted: (id: string) => void;
  onUpdated: (m: StaffMember) => void;
  refetch: (id: string) => Promise<StaffMember | null>;
}

type ActionKey = "block" | "unblock" | "delete";

interface ActionConfig {
  title: string;
  message: (m: StaffMember) => ReactNode;
  confirmLabel: string;
  variant: ConfirmVariant;
}

const ACTION_CONFIG: Record<ActionKey, ActionConfig> = {
  block: {
    title: "Block this user?",
    confirmLabel: "Block",
    variant: "warning",
    message: (m) => (
      <p>
        <strong className="text-text-primary">{m.firstName} {m.lastName}</strong>{" "}
        ({m.role.toLowerCase()}) will lose access to the backoffice immediately.
        They can be unblocked at any time.
      </p>
    ),
  },
  unblock: {
    title: "Unblock this user?",
    confirmLabel: "Unblock",
    variant: "positive",
    message: (m) => (
      <p>
        <strong className="text-text-primary">{m.firstName} {m.lastName}</strong>{" "}
        will regain access to the backoffice immediately.
      </p>
    ),
  },
  delete: {
    title: "Delete this user?",
    confirmLabel: "Delete",
    variant: "danger",
    message: (m) => (
      <>
        <p>
          <strong className="text-text-primary">{m.firstName} {m.lastName}</strong>{" "}
          ({m.role.toLowerCase()}) will be permanently removed, along with their
          Keycloak account and audit history.
        </p>
        <p className="mt-2 text-text-faint">This action cannot be undone.</p>
      </>
    ),
  },
};

/**
 * Admin / Analyst expanded body — improvised layout (no rigid 3-column grid).
 *
 *   ┌ Header ─────────────────────────────────────────────────────────┐
 *   │ avatar  Name + status pill           [Edit] [Block / Unblock]   │
 *   ├ Identity strip ─────────────────────────────────────────────────┤
 *   │ ✉ email     ☎ phone    📍 governorate                           │
 *   ├ Address (full width when present)                               │
 *   ├ Mini grid: DOB · Joined · Username                              │
 *   ├ Footer: technical IDs (small, muted) + Delete                   │
 *   └─────────────────────────────────────────────────────────────────┘
 *
 * "Created by · SuperAdmin · …" is dropped because every staff member is
 * created by the SA — the field is redundant noise.
 */
export function StaffMemberExpanded({
  member,
  onCollapse,
  onDeleted,
  onUpdated,
  refetch,
}: StaffMemberExpandedProps) {
  const [pendingAction, setPendingAction] = useState<ActionKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const handleConfirm = async () => {
    if (!pendingAction || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (pendingAction === "block") {
        await blockStaff(member.id);
        const updated = await refetch(member.id);
        if (updated) onUpdated(updated);
      } else if (pendingAction === "unblock") {
        await unblockStaff(member.id);
        const updated = await refetch(member.id);
        if (updated) onUpdated(updated);
      } else {
        if (member.role === "ADMIN") await apiDeleteAdmin(member.id);
        else await apiDeleteAnalyst(member.id);
        onDeleted(member.id);
      }
      onCollapse();
    } catch (cause) {
      console.error(`[staff] ${pendingAction} failed`, cause);
      setError(cause instanceof Error ? cause.message : "Action failed");
      setBusy(false);
    }
  };

  const handleCancel = () => {
    if (busy) return;
    setPendingAction(null);
    setError(null);
  };

  const cfg = pendingAction ? ACTION_CONFIG[pendingAction] : null;

  return (
    <div className="animate-row-fade-in border-b border-brand-cream-2/60 bg-brand-cream/20 px-6 py-5">
      {/* ── Header ───────────────────────────────────────────────── */}
      <div
        role="button"
        tabIndex={0}
        onClick={onCollapse}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onCollapse();
          }
        }}
        aria-label="Collapse row"
        className="-m-1.5 flex cursor-pointer items-center gap-3 rounded-lg p-1.5 transition-colors duration-150 ease-out hover:bg-brand-cream/50"
      >
        <StaffAvatar
          firstName={member.firstName}
          lastName={member.lastName}
          profilePictureUrl={member.profilePictureUrl}
          size={36}
        />
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="font-sans text-[15px] font-bold text-text-primary">
            {member.firstName} {member.lastName}
          </span>
          <span className="font-mono text-[11px] text-text-muted">
            @{member.username ?? "—"}
          </span>
        </div>
        <span className="ml-1">
          <StaffStatusPill status={member.status} />
        </span>

        <div className="min-w-0 flex-1" />

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setEditOpen(true);
          }}
          className="flex h-9 items-center gap-1.5 rounded-full border border-brand-cream-2 bg-white px-4 font-sans text-[12px] font-semibold text-text-primary transition-all duration-150 ease-out hover:bg-brand-cream/60"
        >
          <Pencil className="size-4" aria-hidden />
          Edit
        </button>
        {member.status === "ACTIVE" && (
          <PillBtn
            kind="block"
            onClick={(e) => {
              e.stopPropagation();
              setPendingAction("block");
            }}
          />
        )}
        {member.status === "BLOCKED" && (
          <PillBtn
            kind="unblock"
            onClick={(e) => {
              e.stopPropagation();
              setPendingAction("unblock");
            }}
          />
        )}
      </div>

      {/* ── Contact strip — inline, icon + value, wraps on narrow viewports.
            Governorate and address render as a single chip ("Sousse, 7oumet
            essou9") so the row stays tight and there's no orphan address
            line + empty gap below. */}
      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2.5">
        <Inline icon={<Mail className="size-3.5" aria-hidden />} value={member.email} mono={false} />
        {member.phone && (
          <Inline icon={<Phone className="size-3.5" aria-hidden />} value={formatPhone(member.phone)} mono />
        )}
        {(member.governorate || member.address) && (
          <Inline
            icon={<MapPin className="size-3.5" aria-hidden />}
            value={[member.governorate, member.address].filter(Boolean).join(", ")}
          />
        )}
      </div>

      {/* ── Compact stat row ─────────────────────────────────────── */}
      <div className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-3">
        <Stat label="Date of birth" value={member.dateOfBirth ?? "—"} />
        <Stat label="Joined" value={formatDateTime(member.decidedAt) || formatDateTime(member.createdAt)} />
        <Stat label="First login" value={member.firstLoginCompleted ? "Yes" : "No"} />
      </div>

      {/* ── Footer: technical IDs + Delete on the right ─────────── */}
      <div className="mt-5 flex flex-col gap-3 border-t border-brand-cream-2/60 pt-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-0.5 font-mono text-[10px] leading-snug text-text-faint">
          <span className="break-all">id · {member.id}</span>
          <span className="break-all">kc · {member.keycloakId ?? "—"}</span>
        </div>
        <button
          type="button"
          onClick={() => setPendingAction("delete")}
          className="self-end flex h-9 items-center gap-1.5 rounded-full border border-negative/40 bg-white px-4 font-sans text-[12px] font-semibold text-negative transition-all duration-150 ease-out hover:bg-negative/5 hover:scale-[1.02]"
        >
          <Trash2 className="size-4" aria-hidden />
          Delete
        </button>
      </div>

      {cfg && (
        <ConfirmDialog
          open
          title={cfg.title}
          message={
            <>
              {cfg.message(member)}
              {error && <p className="mt-2 font-semibold text-negative">{error}</p>}
            </>
          }
          confirmLabel={cfg.confirmLabel}
          variant={cfg.variant}
          busy={busy}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}

      <StaffFormDialog
        open={editOpen}
        mode="edit"
        role={member.role === "ADMIN" ? "ADMIN" : "ANALYST"}
        initial={member}
        onClose={() => setEditOpen(false)}
        onSuccess={(saved) => {
          if (saved) onUpdated(saved);
        }}
      />
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────────────── */

function Inline({
  icon,
  value,
  mono,
}: {
  icon: ReactNode;
  value: string;
  mono?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5 text-text-primary">
      <span className="text-text-faint">{icon}</span>
      <span className={["text-[12px]", mono ? "font-mono" : "font-sans"].join(" ")}>
        {value}
      </span>
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-sans text-[10px] font-bold uppercase tracking-[1.2px] text-text-label">
        {label}
      </span>
      <span className="font-sans text-[12px] text-text-primary">{value}</span>
    </div>
  );
}

type BtnHandler = (e: MouseEvent<HTMLButtonElement>) => void;

function PillBtn({
  kind,
  onClick,
}: {
  kind: "block" | "unblock";
  onClick: BtnHandler;
}) {
  if (kind === "unblock") {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex h-9 items-center gap-1.5 rounded-full border border-positive/50 bg-white px-4 font-sans text-[12px] font-semibold text-positive transition-all duration-150 ease-out hover:bg-positive/10 hover:scale-[1.02]"
      >
        <Unlock className="size-4" aria-hidden />
        Unblock
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 items-center gap-1.5 rounded-full border border-negative/40 bg-white px-4 font-sans text-[12px] font-semibold text-negative transition-all duration-150 ease-out hover:bg-negative/5 hover:scale-[1.02]"
    >
      <Ban className="size-4" aria-hidden />
      Block
    </button>
  );
}

function formatPhone(raw: string | null): string {
  if (!raw) return "—";
  const stripped = raw.replace(/\s+/g, "");
  if (stripped.startsWith("+216") && stripped.length === 12) {
    const rest = stripped.slice(4);
    return `+216 ${rest.slice(0, 2)} ${rest.slice(2, 5)} ${rest.slice(5)}`;
  }
  return raw;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
