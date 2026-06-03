import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Loader2,
  Pencil,
  Plus,
  Search,
  Send,
  Star,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/api";
import { isDemoMode, withDemo } from "@/lib/demoMode";
import { useMe, deriveInitials } from "@/features/me/MeProvider";
import { TopBar } from "@/components/layout/TopBar";
import { ProfilePanel } from "@/components/layout/ProfilePanel";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { formatRibDisplay } from "@/lib/rib";
import {
  type BeneficiaryResponse,
  deleteBeneficiary,
  listBeneficiaries,
  toggleBeneficiaryFavorite,
  updateBeneficiaryNickname,
} from "@/features/transfers/beneficiariesApi";

const DEMO_BENEFICIARIES: BeneficiaryResponse[] = [
  {
    id: "b-1",
    accountNumber: "08001000000000000079",
    displayName: "Sis",
    nickname: "Sis",
    bankCode: "BIAT",
    favorite: true,
    transferCount: 7,
    confirmedAt: new Date(Date.now() - 30 * 86400 * 1000).toISOString(),
    lastUsedAt: new Date(Date.now() - 2 * 86400 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 30 * 86400 * 1000).toISOString(),
    initials: "SM",
    payzoUser: true,
    profilePictureUrl: null,
  },
  {
    id: "b-2",
    accountNumber: "10001000000000000017",
    displayName: "Karim Bouaziz",
    nickname: null,
    bankCode: "STB",
    favorite: false,
    transferCount: 2,
    confirmedAt: new Date(Date.now() - 14 * 86400 * 1000).toISOString(),
    lastUsedAt: new Date(Date.now() - 9 * 86400 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 14 * 86400 * 1000).toISOString(),
    initials: "KB",
    payzoUser: false,
    profilePictureUrl: null,
  },
];

type SortKey = "recent" | "alpha" | "uses";

/**
 * Standalone beneficiaries management page. Mirrors the saved-tab UX
 * inside the send-money flow but with extra affordances (search, sort,
 * inline rename) — the send-money tab is for quick reuse, this page is
 * the "manage my list" surface.
 */
export function BeneficiariesPage() {
  const { me } = useMe();
  const navigate = useNavigate();
  const toast = useToast();
  const demo = isDemoMode();
  const [profilePanelOpen, setProfilePanelOpen] = useState(false);
  const initials = deriveInitials(me);

  const [items, setItems] = useState<BeneficiaryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BeneficiaryResponse | null>(
    null,
  );
  const [renameTarget, setRenameTarget] = useState<BeneficiaryResponse | null>(
    null,
  );
  const [reloadTick, setReloadTick] = useState(0);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = demo
          ? {
              content: DEMO_BENEFICIARIES,
              totalElements: DEMO_BENEFICIARIES.length,
              totalPages: 1,
              page: 0,
              size: 50,
            }
          : await listBeneficiaries(0, 100);
        if (!cancelled) setItems(res.content);
      } catch (err) {
        if (cancelled) return;
        setItems([]);
        setError(
          err instanceof ApiError && err.message
            ? err.message
            : "Couldn't load your beneficiaries.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [demo, reloadTick]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = items;
    if (q) {
      out = out.filter(
        (b) =>
          b.displayName.toLowerCase().includes(q) ||
          (b.bankCode ?? "").toLowerCase().includes(q) ||
          b.accountNumber.includes(q),
      );
    }
    return out.slice().sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      switch (sort) {
        case "alpha":
          return a.displayName.localeCompare(b.displayName);
        case "uses":
          return b.transferCount - a.transferCount;
        case "recent":
        default: {
          const at = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
          const bt = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
          return bt - at;
        }
      }
    });
  }, [items, search, sort]);

  async function toggleFavorite(b: BeneficiaryResponse) {
    if (actionBusy) return;
    setActionBusy(true);
    const previous = items;
    setItems((prev) =>
      prev.map((x) => (x.id === b.id ? { ...x, favorite: !x.favorite } : x)),
    );
    try {
      if (!demo) {
        const updated = await toggleBeneficiaryFavorite(b.id);
        // Merge instead of replace — keeps the existing payzoUser /
        // profilePictureUrl if the server response happens to omit them,
        // so the bubble-row avatar doesn't lose its picture after toggle.
        setItems((prev) =>
          prev.map((x) =>
            x.id === b.id
              ? {
                  ...x,
                  ...updated,
                  payzoUser: updated.payzoUser ?? x.payzoUser,
                  profilePictureUrl:
                    updated.profilePictureUrl ?? x.profilePictureUrl,
                }
              : x,
          ),
        );
      }
    } catch (err) {
      setItems(previous);
      toast.showToast({
        tier: "danger",
        message:
          err instanceof ApiError && err.message
            ? err.message
            : "Couldn't update the favorite.",
      });
    } finally {
      setActionBusy(false);
    }
  }

  function handleToggleFavorite(
    e: MouseEvent<HTMLButtonElement>,
    b: BeneficiaryResponse,
  ) {
    e.stopPropagation();
    void toggleFavorite(b);
  }

  function handleSend(b: BeneficiaryResponse) {
    navigate(withDemo("/transfers"), { state: { preSelectBeneficiary: b } });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setActionBusy(true);
    const previous = items;
    setItems((prev) => prev.filter((x) => x.id !== deleteTarget.id));
    try {
      if (!demo) await deleteBeneficiary(deleteTarget.id);
      toast.showToast({ tier: "success", message: "Beneficiary removed." });
    } catch (err) {
      setItems(previous);
      toast.showToast({
        tier: "danger",
        message:
          err instanceof ApiError && err.message
            ? err.message
            : "Couldn't remove the beneficiary.",
      });
    } finally {
      setActionBusy(false);
      setDeleteTarget(null);
    }
  }

  async function saveNickname(value: string) {
    if (!renameTarget) return;
    setActionBusy(true);
    try {
      const next = value.trim();
      if (demo) {
        setItems((prev) =>
          prev.map((x) =>
            x.id === renameTarget.id
              ? {
                  ...x,
                  nickname: next || null,
                  displayName: next || x.displayName,
                }
              : x,
          ),
        );
      } else {
        const updated = await updateBeneficiaryNickname(renameTarget.id, {
          nickname: next || undefined,
        });
        setItems((prev) =>
          prev.map((x) => (x.id === renameTarget.id ? updated : x)),
        );
      }
      toast.showToast({ tier: "success", message: "Nickname updated." });
      setRenameTarget(null);
    } catch (err) {
      toast.showToast({
        tier: "danger",
        message:
          err instanceof ApiError && err.message
            ? err.message
            : "Couldn't update the nickname.",
      });
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-surface-soft">
      <TopBar
        variant="light"
        pageName="Beneficiaries"
        me={
          me
            ? {
                initials,
                trustScore: me.trustScore,
                profilePictureUrl: me.profilePictureUrl,
              }
            : null
        }
        onAvatarClick={() => setProfilePanelOpen(true)}
      />

      <ProfilePanel
        open={profilePanelOpen}
        onClose={() => setProfilePanelOpen(false)}
        me={me}
      />

      <main className="flex flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-4 px-4 pb-3 pt-3 sm:px-8 sm:pb-4 sm:pt-2">
          {/* Header strip */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h1 className="font-sans text-[24px] font-bold leading-tight text-text-primary">
                Your saved recipients
              </h1>
              <p className="font-sans text-[12px] text-text-secondary">
                Send again with one tap — no re-typing the RIB.
              </p>
            </div>
            <Link
              to={withDemo("/transfers")}
              className="flex h-11 items-center gap-1.5 rounded-[10px] bg-text-primary pl-4 pr-5 font-sans text-[13px] font-bold text-text-on-inverse transition-colors duration-150 ease-out hover:bg-text-primary/90"
            >
              <Plus className="size-4" strokeWidth={2.4} aria-hidden />
              Add via send money
            </Link>
          </div>

          {/* Filters strip */}
          <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-border-soft bg-surface-card px-3 py-2.5">
            <div className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-[8px] border border-border-soft bg-surface-soft px-3">
              <Search
                className="size-4 text-text-muted"
                strokeWidth={2}
                aria-hidden
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, bank, or RIB digits"
                className="min-w-0 flex-1 bg-transparent font-sans text-[13px] text-text-primary outline-none placeholder:text-text-muted"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="text-text-muted hover:text-text-primary"
                >
                  <X className="size-3.5" strokeWidth={2.4} aria-hidden />
                </button>
              )}
            </div>
            <div
              role="radiogroup"
              aria-label="Sort"
              className="flex items-center gap-1 rounded-[8px] bg-surface-soft p-1"
            >
              <SortChip
                active={sort === "recent"}
                onClick={() => setSort("recent")}
                label="Recent"
              />
              <SortChip
                active={sort === "alpha"}
                onClick={() => setSort("alpha")}
                label="A–Z"
              />
              <SortChip
                active={sort === "uses"}
                onClick={() => setSort("uses")}
                label="Most used"
              />
            </div>
          </div>

          {/* Body */}
          {loading && (
            <div className="flex flex-1 items-center justify-center py-16 text-text-muted">
              <Loader2
                className="size-5 animate-spin"
                strokeWidth={2.4}
                aria-hidden
              />
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
              <p className="font-sans text-[13px] text-negative">{error}</p>
              <button
                type="button"
                onClick={() => setReloadTick((t) => t + 1)}
                className="rounded-[8px] bg-surface-raised px-3 py-1.5 font-sans text-[12px] font-semibold text-text-secondary hover:bg-surface-soft"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <EmptyState />
          )}

          {!loading && !error && items.length > 0 && visible.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
              <p className="font-sans text-[14px] font-bold text-text-primary">
                No matches
              </p>
              <p className="font-sans text-[12px] text-text-secondary">
                Try a different search term.
              </p>
            </div>
          )}

          {!loading && !error && visible.length > 0 && (
            <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
              {visible.map((b) => (
                <li key={b.id} className="rounded-[14px]">
                  <BeneficiaryCard
                    b={b}
                    actionBusy={actionBusy}
                    onSend={() => handleSend(b)}
                    onToggleFavorite={(e) => handleToggleFavorite(e, b)}
                    onRename={() => setRenameTarget(b)}
                    onDelete={() => setDeleteTarget(b)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove beneficiary?"
        message={
          deleteTarget
            ? `${deleteTarget.displayName} will no longer appear in your saved list. The transfers you've already sent stay in your history.`
            : ""
        }
        confirmLabel="Remove"
        cancelLabel="Keep"
        variant="danger"
        busy={actionBusy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />

      {renameTarget && (
        <NicknameDialog
          target={renameTarget}
          busy={actionBusy}
          onCancel={() => setRenameTarget(null)}
          onSave={saveNickname}
        />
      )}
    </div>
  );
}

function SortChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "flex h-7 items-center justify-center rounded-[6px] px-3 font-sans text-[12px] transition-colors duration-150 ease-out",
        active
          ? "bg-surface-card font-semibold text-text-primary shadow-[0px_1px_3px_0px_rgba(0,0,0,0.08)]"
          : "font-medium text-text-secondary hover:text-text-primary",
      )}
    >
      {label}
    </button>
  );
}

function BeneficiaryCard({
  b,
  actionBusy,
  onSend,
  onToggleFavorite,
  onRename,
  onDelete,
}: {
  b: BeneficiaryResponse;
  actionBusy: boolean;
  onSend: () => void;
  onToggleFavorite: (e: MouseEvent<HTMLButtonElement>) => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-border-soft bg-surface-card p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent font-sans text-[15px] font-bold text-accent-foreground">
          {b.initials}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <p className="truncate font-sans text-[15px] font-bold text-text-primary">
              {b.displayName}
            </p>
            {b.favorite && (
              <Star
                className="size-3.5 fill-warning text-warning"
                strokeWidth={2}
                aria-hidden
              />
            )}
          </div>
          <p className="truncate font-mono text-[11px] text-text-secondary">
            {b.bankCode && <span className="font-sans">{b.bankCode} · </span>}
            {formatRibDisplay(b.accountNumber)}
          </p>
          <p className="font-sans text-[11px] text-text-muted">
            {b.lastUsedAt
              ? `Last used ${relativeTime(b.lastUsedAt)} · ${b.transferCount} transfer${b.transferCount === 1 ? "" : "s"}`
              : "Not used yet"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <IconAction
            ariaLabel={b.favorite ? "Unfavorite" : "Favorite"}
            onClick={onToggleFavorite}
            disabled={actionBusy}
          >
            <Star
              className={cn(
                "size-4",
                b.favorite ? "fill-warning text-warning" : "text-text-muted",
              )}
              strokeWidth={2}
              aria-hidden
            />
          </IconAction>
          <IconAction
            ariaLabel="Rename"
            onClick={onRename}
            disabled={actionBusy}
          >
            <Pencil
              className="size-4 text-text-muted"
              strokeWidth={2}
              aria-hidden
            />
          </IconAction>
          <IconAction
            ariaLabel="Remove"
            onClick={onDelete}
            disabled={actionBusy}
          >
            <Trash2
              className="size-4 text-text-muted"
              strokeWidth={2}
              aria-hidden
            />
          </IconAction>
        </div>
        <button
          type="button"
          onClick={onSend}
          disabled={actionBusy}
          className="flex h-9 items-center gap-1.5 rounded-[8px] bg-text-primary pl-3 pr-4 font-sans text-[12px] font-bold text-text-on-inverse transition-colors duration-150 ease-out hover:bg-text-primary/90 disabled:opacity-60"
        >
          <Send className="size-3.5" strokeWidth={2.4} aria-hidden />
          Send
        </button>
      </div>
    </div>
  );
}

function IconAction({
  ariaLabel,
  onClick,
  disabled,
  children,
}: {
  ariaLabel: string;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      className="flex size-8 items-center justify-center rounded-full transition-colors duration-150 ease-out hover:bg-accent-soft disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-accent-soft">
        <Users
          className="size-6 text-accent"
          strokeWidth={2}
          aria-hidden
        />
      </span>
      <p className="font-sans text-[16px] font-bold text-text-primary">
        No saved recipients yet
      </p>
      <p className="max-w-sm font-sans text-[13px] text-text-secondary">
        Save someone the next time you send. They'll show up here for one-tap
        transfers.
      </p>
      <Link
        to={withDemo("/transfers")}
        className="mt-1 flex h-10 items-center gap-1.5 rounded-[10px] bg-accent pl-3 pr-4 font-sans text-[13px] font-bold text-accent-foreground transition-colors duration-150 ease-out hover:bg-accent/90"
      >
        Send money
        <ArrowRight className="size-4" strokeWidth={2.4} aria-hidden />
      </Link>
    </div>
  );
}

function NicknameDialog({
  target,
  busy,
  onCancel,
  onSave,
}: {
  target: BeneficiaryResponse;
  busy: boolean;
  onCancel: () => void;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(target.nickname ?? "");

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    onSave(value);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/40 backdrop-blur-[2px] px-4">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-md flex-col gap-4 rounded-[14px] border border-border-soft bg-surface-card p-5 shadow-[0px_12px_32px_rgba(0,0,0,0.2)]"
      >
        <h2 className="font-sans text-[18px] font-bold text-text-primary">
          Rename {target.displayName}
        </h2>
        <p className="font-sans text-[12px] text-text-secondary">
          Give them a nickname only you can see — leave blank to use their real
          name.
        </p>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, 60))}
          autoFocus
          placeholder="Nickname"
          className="h-11 w-full rounded-[10px] border border-border-soft bg-surface-card px-3.5 font-sans text-[14px] text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex h-10 items-center rounded-[8px] bg-surface-raised px-4 font-sans text-[13px] font-semibold text-text-secondary transition-colors duration-150 ease-out hover:bg-surface-soft"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex h-10 items-center rounded-[8px] bg-accent px-4 font-sans text-[13px] font-bold text-accent-foreground transition-colors duration-150 ease-out hover:bg-accent/90 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "recently";
  const diffMs = Date.now() - then;
  const dayMs = 86400 * 1000;
  const days = Math.floor(diffMs / dayMs);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return "a week ago";
  if (weeks < 5) return `${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return "a month ago";
  if (months < 12) return `${months} months ago`;
  return "over a year ago";
}
