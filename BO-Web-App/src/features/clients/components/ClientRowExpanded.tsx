import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { Ban, Check, Trash2, Unlock, X } from "lucide-react";
import { ClientAvatar } from "./ClientAvatar";
import { ClientStatusPill } from "./ClientStatusPill";
import { ConfirmDialog, type ConfirmVariant } from "@/components/ui/ConfirmDialog";
import { pillStatusFor } from "../statusDisplay";
import {
  approveClient,
  blockClient as apiBlockClient,
  deleteClient,
  fetchClient,
  fetchClientCbsSummary,
  rejectClient,
  unblockClient as apiUnblockClient,
  type ClientListItem,
  type ClientStatusFilter,
} from "../api";
import { isSuperAdmin } from "@/lib/auth/session";

interface ClientRowExpandedProps {
  client: ClientListItem;
  /** Active filter tab — drives whether the header pill shows the derived
   *  ACCEPTED label (in All) or the raw status (every other tab). */
  tab: ClientStatusFilter;
  onCollapse: () => void;
  /** Called after a successful Delete so the parent can drop the row. */
  onDeleted: (userId: string) => void;
  /** Called after Approve / Reject / Block / Unblock with the refreshed row.
   *  The parent decides whether to keep it (update in place) or remove it
   *  (no longer matches the active tab filter). */
  onUpdated: (client: ClientListItem) => void;
}

/**
 * Lifecycle action keys handled by this card. Each maps to one config entry
 * in `ACTION_CONFIG` (title, message, variant, API call, success mode).
 */
type ActionKey = "delete" | "approve" | "reject" | "block" | "unblock";

interface ActionConfig {
  title: string;
  message: (c: ClientListItem) => ReactNode;
  confirmLabel: string;
  variant: ConfirmVariant;
  apiCall: (userId: string) => Promise<void>;
  /** "delete" → drop the row from the list; "refetch" → reload + let parent decide. */
  successMode: "delete" | "refetch";
}

/**
 * Per-action dialog config. Kept at module scope so the per-render render
 * doesn't allocate fresh objects, and so the dialog text is reviewable in
 * one place. `message` is a function so it can interpolate the client.
 */
const ACTION_CONFIG: Record<ActionKey, ActionConfig> = {
  delete: {
    title: "Delete client?",
    confirmLabel: "Delete client",
    variant: "danger",
    apiCall: deleteClient,
    successMode: "delete",
    message: (c) => (
      <>
        <p>
          <strong className="text-text-primary">
            {c.firstName} {c.lastName}
          </strong>
          {c.cin ? ` (CIN ${c.cin})` : ""} will be permanently removed, along
          with their transactions, fraud alerts, favorites, in-app notifications,
          audit history, and Keycloak account.
        </p>
        <p className="mt-2 text-text-faint">This action cannot be undone.</p>
      </>
    ),
  },
  approve: {
    title: "Accept this client?",
    confirmLabel: "Accept",
    variant: "positive",
    apiCall: approveClient,
    successMode: "refetch",
    message: (c) => (
      <p>
        <strong className="text-text-primary">
          {c.firstName} {c.lastName}
        </strong>
        {c.cin ? ` (CIN ${c.cin})` : ""} will be approved as a PayZo client.
        Their Keycloak account will be created and login credentials emailed to
        them. The row moves out of the Pending tab.
      </p>
    ),
  },
  reject: {
    title: "Reject this registration?",
    confirmLabel: "Reject",
    variant: "warning",
    apiCall: (userId) => rejectClient(userId),
    successMode: "refetch",
    message: (c) => (
      <>
        <p>
          <strong className="text-text-primary">
            {c.firstName} {c.lastName}
          </strong>
          {c.cin ? ` (CIN ${c.cin})` : ""} will be notified that their
          registration was denied. The row moves to the Rejected tab and no
          Keycloak account is created.
        </p>
        <p className="mt-2 text-text-faint">
          To revisit this decision later, delete the row and let them re-register.
        </p>
      </>
    ),
  },
  block: {
    title: "Block this client?",
    confirmLabel: "Block",
    variant: "warning",
    apiCall: apiBlockClient,
    successMode: "refetch",
    message: (c) => (
      <p>
        <strong className="text-text-primary">
          {c.firstName} {c.lastName}
        </strong>{" "}
        will lose access to PayZo immediately. They can be unblocked at any
        time from the Blocked tab.
      </p>
    ),
  },
  unblock: {
    title: "Unblock this client?",
    confirmLabel: "Unblock",
    variant: "positive",
    apiCall: apiUnblockClient,
    successMode: "refetch",
    message: (c) => (
      <p>
        <strong className="text-text-primary">
          {c.firstName} {c.lastName}
        </strong>{" "}
        will regain access to PayZo immediately.
      </p>
    ),
  },
};

/**
 * Expanded row body for a client (D30). Replaces the minimal row when open
 * (the page never shows both at once — the minimal row carries the same
 * identity, so duplicating it would be redundant). Clicking the header band
 * collapses the row back to its minimal form.
 *
 * The card has 5 status-specific layouts; this component picks the right
 * sections + actions per `client.status`. PENDING and ACTIVE are wired
 * today; the other three fall through to the ACTIVE layout as a placeholder
 * until the user specs them (see CLAUDE.md / DECISIONS.md).
 *
 * Bank-account count is fetched lazily from CBS via
 * `/admin/clients/{userId}/cbs-summary` only when this component mounts —
 * so collapsed rows never pay that cost.
 */
export function ClientRowExpanded({
  client,
  tab,
  onCollapse,
  onDeleted,
  onUpdated,
}: ClientRowExpandedProps) {
  const [pendingAction, setPendingAction] = useState<ActionKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!pendingAction || busy) return;
    const cfg = ACTION_CONFIG[pendingAction];
    setBusy(true);
    setError(null);
    try {
      await cfg.apiCall(client.userId);
      if (cfg.successMode === "delete") {
        onDeleted(client.userId);
      } else {
        // Refetch the row so the parent has accurate status / decidedBy / decidedAt.
        // If this fails (rare), we still collapse — the user will see the
        // stale row until the next list refresh.
        try {
          const updated = await fetchClient(client.userId);
          onUpdated(updated);
        } catch (refetchErr) {
          console.warn("[clients] post-action refetch failed", refetchErr);
        }
      }
      // Collapse after the parent has already updated/removed the row, so
      // the unmount is a clean tear-down with no stale state to flush.
      onCollapse();
    } catch (cause) {
      console.error(`[clients] ${pendingAction} failed`, cause);
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
  const requestAction = (a: ActionKey) => {
    setPendingAction(a);
    setError(null);
  };

  return (
    <div className="animate-row-fade-in border-b border-brand-cream-2/60 bg-brand-cream/55 px-6 py-5">
      <ExpandedHeader client={client} tab={tab} onCollapse={onCollapse}>
        <HeaderActions client={client} onAction={requestAction} />
      </ExpandedHeader>

      <ExpandedBody client={client} />

      {/* Delete is SuperAdmin-only — admins see view + lifecycle actions in the
          header band but can't hard-delete (D31 — destructive scope). */}
      {isSuperAdmin() && (
        <FooterActions onDelete={() => requestAction("delete")} />
      )}

      {cfg && (
        <ConfirmDialog
          open
          title={cfg.title}
          message={
            <>
              {cfg.message(client)}
              {error && (
                <p className="mt-2 font-semibold text-negative">{error}</p>
              )}
            </>
          }
          confirmLabel={cfg.confirmLabel}
          variant={cfg.variant}
          busy={busy}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}

/* ─── Per-status dispatch ─────────────────────────────────────────────── */

function ExpandedBody({ client }: { client: ClientListItem }) {
  switch (client.status) {
    case "PENDING":
      return <PendingBody client={client} />;
    case "BLOCKED":
      return <BlockedBody client={client} />;
    case "REJECTED":
      return <RejectedBody client={client} />;
    // ACTIVE covers both "logged in" and "ACCEPTED-derived" (firstLogin=false) —
    // FIRST LOGIN value (YES/NO) is the only visible difference.
    case "ACTIVE":
    default:
      return <ActiveBody client={client} />;
  }
}

interface HeaderActionsProps {
  client: ClientListItem;
  onAction: (key: ActionKey) => void;
}

function HeaderActions({ client, onAction }: HeaderActionsProps) {
  // Each handler stops propagation so a click on the button doesn't bubble
  // up to the header band (which would collapse the row).
  const fire = (key: ActionKey) => (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onAction(key);
  };

  switch (client.status) {
    case "PENDING":
      return (
        <div className="flex items-center gap-2">
          <AcceptButton onClick={fire("approve")} />
          <RejectButton onClick={fire("reject")} />
        </div>
      );
    case "BLOCKED":
      return <UnblockButton onClick={fire("unblock")} />;
    case "REJECTED":
      // No header actions for REJECTED — the only path forward is Delete,
      // which lives in the footer alongside every other status.
      return null;
    // ACCEPTED-derived clients (ACTIVE + firstLogin=false) and full ACTIVE
    // both reach this branch — same Block action.
    case "ACTIVE":
    default:
      return <BlockButton onClick={fire("block")} />;
  }
}

function FooterActions({ onDelete }: { onDelete: () => void }) {
  // Every status currently lands on a Delete-only footer. We keep this in a
  // dedicated function so future status layouts (e.g. REJECTED → Delete-only,
  // BLOCKED → Unblock-and-Delete) can override without touching the body.
  return (
    <div className="mt-5 flex items-center justify-end">
      <DeleteButton onClick={onDelete} />
    </div>
  );
}

/* ─── ACTIVE body ─────────────────────────────────────────────────────── */

function ActiveBody({ client }: { client: ClientListItem }) {
  return (
    <div className="mt-5 grid gap-6 lg:grid-cols-[1.4fr_1.1fr_1fr] lg:gap-0 lg:[&>*+*]:border-l lg:[&>*+*]:border-brand-cream-2/70 lg:[&>*+*]:pl-6 lg:[&>*:not(:last-child)]:pr-6">
      <IdentitySection client={client} />
      <Section title="PAYZO ACCOUNT">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3.5">
          <Field label="USERNAME" value={client.username ? `@${client.username}` : "—"} mono />
          <TrustScoreField score={client.trustScore} />
          <BankAccountsField userId={client.userId} />
          <Field label="FIRST LOGIN" value={client.firstLoginCompleted ? "YES" : "NO"} />
          <Field label="ACCEPTED BY" value={client.decidedByName ?? "—"} />
          <Field label="ACCEPTED AT" value={formatDateTime(client.decidedAt)} />
        </div>
      </Section>
      <TechnicalSection client={client} />
    </div>
  );
}

/* ─── REJECTED body ───────────────────────────────────────────────────── */

function RejectedBody({ client }: { client: ClientListItem }) {
  // REJECTED has no Keycloak account (rejection short-circuits before user
  // creation) and no trust score / first-login fields to show. The technical
  // section gets bumped to include CREATED AT + UPDATED AT so admins can see
  // the precise audit window of the rejected record.
  return (
    <div className="mt-5 grid gap-6 lg:grid-cols-[1.4fr_1.1fr_1fr] lg:gap-0 lg:[&>*+*]:border-l lg:[&>*+*]:border-brand-cream-2/70 lg:[&>*+*]:pl-6 lg:[&>*:not(:last-child)]:pr-6">
      <IdentitySection client={client} />
      <Section title="PAYZO ACCOUNT">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3.5">
          <Field label="USERNAME" value={client.username ? `@${client.username}` : "—"} mono />
          <BankAccountsField userId={client.userId} />
          <Field label="REJECTED BY" value={client.decidedByName ?? "—"} />
          <Field label="REJECTED AT" value={formatDateTime(client.decidedAt)} />
          {client.decisionReason && (
            <Field label="REASON" value={client.decisionReason} fullWidth />
          )}
        </div>
      </Section>
      {isSuperAdmin() && (
        <Section title="TECHNICAL">
          <div className="flex flex-col gap-3.5">
            <Field label="INTERNAL ID" value={client.userId} />
            <Field label="KEYCLOAK ID" value={client.keycloakId ?? "—"} />
            <div className="grid grid-cols-2 gap-x-6 gap-y-3.5">
              <Field label="CREATED AT" value={formatDateTime(client.createdAt)} />
              <Field label="UPDATED AT" value={formatDateTime(client.updatedAt)} />
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}

/* ─── BLOCKED body ────────────────────────────────────────────────────── */

function BlockedBody({ client }: { client: ClientListItem }) {
  return (
    <div className="mt-5 grid gap-6 lg:grid-cols-[1.4fr_1.1fr_1fr] lg:gap-0 lg:[&>*+*]:border-l lg:[&>*+*]:border-brand-cream-2/70 lg:[&>*+*]:pl-6 lg:[&>*:not(:last-child)]:pr-6">
      <IdentitySection client={client} />
      <Section title="PAYZO ACCOUNT">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3.5">
          <Field label="USERNAME" value={client.username ? `@${client.username}` : "—"} mono />
          <TrustScoreField score={client.trustScore} />
          <BankAccountsField userId={client.userId} />
          <Field label="FIRST LOGIN" value={client.firstLoginCompleted ? "YES" : "NO"} />
          {/* `decidedBy/At` carries the most-recent lifecycle action, which for
              a BLOCKED row is the block itself — so we relabel the same field
              instead of adding new columns. Same for the reason. */}
          <Field label="BLOCKED BY" value={client.decidedByName ?? "—"} />
          <Field label="BLOCKED AT" value={formatDateTime(client.decidedAt)} />
          <Field label="BLOCK REASON" value={client.decisionReason ?? "—"} fullWidth />
        </div>
      </Section>
      <TechnicalSection client={client} />
    </div>
  );
}

/* ─── PENDING body ────────────────────────────────────────────────────── */

function PendingBody({ client }: { client: ClientListItem }) {
  return (
    <div className="mt-5 grid gap-6 lg:grid-cols-[1.4fr_1.1fr_1fr] lg:gap-0 lg:[&>*+*]:border-l lg:[&>*+*]:border-brand-cream-2/70 lg:[&>*+*]:pl-6 lg:[&>*:not(:last-child)]:pr-6">
      <IdentitySection client={client} />
      <Section title="PAYZO ACCOUNT">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3.5">
          {/* PENDING users have no Keycloak account → no username yet (it's
              auto-generated on approval). Trust score / first login are
              also irrelevant pre-approval, so they're hidden. */}
          <Field label="USERNAME" value={client.username ? `@${client.username}` : "—"} mono />
          <BankAccountsField userId={client.userId} />
          <Field label="CREATED BY" value={client.createdByName ?? "—"} />
          <Field label="ACCEPTED BY" value={client.decidedByName ?? "—"} />
          <Field label="CREATED AT" value={formatDateTime(client.createdAt)} fullWidth />
        </div>
      </Section>
      <TechnicalSection client={client} />
    </div>
  );
}

/* ─── Shared sections ─────────────────────────────────────────────────── */

function IdentitySection({ client }: { client: ClientListItem }) {
  return (
    <Section title="IDENTITY">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3.5">
        <Field label="FULL NAME" value={`${client.firstName} ${client.lastName}`} />
        <Field label="CIN" value={client.cin} />
        <Field label="EMAIL" value={client.email} />
        <Field label="PHONE" value={formatPhone(client.phone)} />
        <Field label="DATE OF BIRTH" value={client.dateOfBirth ?? "—"} />
        <Field label="GOVERNORATE" value={client.governorate ?? "—"} />
      </div>
      <div className="mt-3.5">
        <Field label="ADDRESS" value={client.address ?? "—"} fullWidth />
      </div>
    </Section>
  );
}

function TechnicalSection({ client }: { client: ClientListItem }) {
  // SA-only — non-SA users don't see opaque internal/keycloak IDs.
  if (!isSuperAdmin()) return null;
  return (
    <Section title="TECHNICAL">
      <div className="flex flex-col gap-3.5">
        <Field label="INTERNAL ID" value={client.userId} />
        <Field label="KEYCLOAK ID" value={client.keycloakId ?? "—"} />
      </div>
    </Section>
  );
}

/* ─── Header band ─────────────────────────────────────────────────────── */

function ExpandedHeader({
  client,
  tab,
  onCollapse,
  children,
}: {
  client: ClientListItem;
  tab: ClientStatusFilter;
  onCollapse: () => void;
  children: ReactNode;
}) {
  // The whole header band is the collapse target — clicking anywhere except
  // the action button(s) collapses the row. We use a div (not a button) so
  // the action buttons can live inside; an explicit role/tabIndex/keyboard
  // handler keeps it accessible. Each action handler must call
  // e.stopPropagation() to avoid double-firing as a collapse.
  return (
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
      <ClientAvatar
        firstName={client.firstName}
        lastName={client.lastName}
        profilePictureUrl={client.profilePictureUrl}
        size={32}
      />
      <span className="font-sans text-[15px] font-bold text-text-primary">
        {client.firstName} {client.lastName}
      </span>
      <ClientStatusPill status={pillStatusFor(client, tab)} />

      <div className="min-w-0 flex-1" />

      {children}
    </div>
  );
}

/* ─── Section wrapper ─────────────────────────────────────────────────── */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-3 flex items-center gap-3">
        <span className="font-sans text-[10px] font-bold uppercase tracking-[1.4px] text-brand-medium">
          {title}
        </span>
        <div className="h-px flex-1 bg-brand-cream-2" />
      </div>
      {children}
    </div>
  );
}

/* ─── Field primitives ────────────────────────────────────────────────── */

interface FieldProps {
  label: string;
  value: string;
  mono?: boolean;
  fullWidth?: boolean;
}

function Field({ label, value, mono, fullWidth }: FieldProps) {
  return (
    <div className={["min-w-0 flex flex-col gap-1", fullWidth ? "col-span-2" : ""].join(" ")}>
      <span className="font-sans text-[9px] font-bold uppercase tracking-[1.2px] text-text-label">
        {label}
      </span>
      {/* Values wrap rather than truncate so longer strings (admin full names,
          long addresses, decision reasons) stay fully visible. */}
      <span
        className={[
          "text-[12px] text-text-primary leading-snug break-words",
          mono ? "font-mono" : "font-sans",
        ].join(" ")}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

/* ─── Trust score ─────────────────────────────────────────────────────── */

interface TrustBucket {
  label: "LOW" | "MED" | "HIGH";
  classes: string;
}

function bucketTrust(score: number): TrustBucket {
  if (score >= 70) return { label: "HIGH", classes: "bg-[#dff7ec] text-[#1c7a52] ring-1 ring-inset ring-[#a4dec3]" };
  if (score >= 40) return { label: "MED",  classes: "bg-[#fdf3df] text-[#8a6d1f] ring-1 ring-inset ring-[#e8cf85]" };
  return { label: "LOW", classes: "bg-[#fbe1e1] text-[#8a2424] ring-1 ring-inset ring-[#e6a4a4]" };
}

function TrustScoreField({ score }: { score: number | null }) {
  if (score === null || score === undefined) {
    return <Field label="TRUST SCORE" value="—" />;
  }
  const bucket = bucketTrust(score);
  return (
    <div className="min-w-0 flex flex-col gap-1">
      <span className="font-sans text-[9px] font-bold uppercase tracking-[1.2px] text-text-label">
        TRUST SCORE
      </span>
      <div className="flex items-center gap-2">
        <span className="font-sans text-[12px] text-text-primary">{score}</span>
        <span
          className={[
            "inline-flex items-center rounded-full px-1.5 py-0.5",
            "font-sans text-[9px] font-bold tracking-[0.5px]",
            bucket.classes,
          ].join(" ")}
        >
          {bucket.label}
        </span>
      </div>
    </div>
  );
}

/* ─── Bank accounts (lazy CBS fetch) ──────────────────────────────────── */

function BankAccountsField({ userId }: { userId: string }) {
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchClientCbsSummary(userId, controller.signal)
      .then((summary) => setCount(summary.accountCount))
      .catch((cause) => {
        if (controller.signal.aborted) return;
        console.error("[clients] CBS summary failed", cause);
        setError(true);
      });
    return () => controller.abort();
  }, [userId]);

  let value: string;
  if (error) value = "—";
  else if (count === null) value = "…";
  else value = String(count);

  return (
    <div className="min-w-0 flex flex-col gap-1">
      <span className="font-sans text-[9px] font-bold uppercase tracking-[1.2px] text-text-label">
        BANK ACCOUNTS
      </span>
      <span className="font-sans text-[12px] font-bold text-text-primary underline decoration-text-faint underline-offset-2">
        {value}
      </span>
    </div>
  );
}

/* ─── Action buttons ──────────────────────────────────────────────────── */

type BtnHandler = (e: MouseEvent<HTMLButtonElement>) => void;

function BlockButton({ onClick }: { onClick: BtnHandler }) {
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

function UnblockButton({ onClick }: { onClick: BtnHandler }) {
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

function AcceptButton({ onClick }: { onClick: BtnHandler }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 items-center gap-1.5 rounded-full border border-positive/50 bg-white px-4 font-sans text-[12px] font-semibold text-positive transition-all duration-150 ease-out hover:bg-positive/10 hover:scale-[1.02]"
    >
      <Check className="size-4" aria-hidden />
      Accept
    </button>
  );
}

function RejectButton({ onClick }: { onClick: BtnHandler }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 items-center gap-1.5 rounded-full border border-negative/40 bg-white px-4 font-sans text-[12px] font-semibold text-negative transition-all duration-150 ease-out hover:bg-negative/5 hover:scale-[1.02]"
    >
      <X className="size-4" aria-hidden />
      Reject
    </button>
  );
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 items-center gap-1.5 rounded-full border border-negative/40 bg-white px-4 font-sans text-[12px] font-semibold text-negative transition-all duration-150 ease-out hover:bg-negative/5 hover:scale-[1.02]"
    >
      <Trash2 className="size-4" aria-hidden />
      Delete
    </button>
  );
}

/* ─── Formatters ──────────────────────────────────────────────────────── */

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
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mn = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mn}`;
}
