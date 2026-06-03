import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Loader2, Pencil, Power, PowerOff, RefreshCw } from "lucide-react";
import { ConfirmDialog, type ConfirmVariant } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { BankAvatar } from "@/features/banks/components/BankAvatar";
import { BankLogoDialog } from "./BankLogoDialog";
import {
  activateBank,
  deactivateBank,
  fetchBanksList,
  syncBanks,
  type BankRow,
} from "../api";

interface BanksTableProps {
  items: BankRow[];
  loadingInitial: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  onLoadMore: () => void;
  onUpdated: (b: BankRow) => void;
  onReload: () => void;
}

const COLUMN_TEMPLATE =
  "minmax(220px,2fr) minmax(120px,1fr) minmax(160px,1.2fr) minmax(120px,0.8fr) minmax(160px,0.9fr)";

/**
 * Banks table — CBS owns the catalog (D48). The SuperAdmin can only:
 *   - Trigger a manual CBS sync ("Sync from CBS" button).
 *   - Edit the logo for an existing bank.
 *   - Activate / deactivate per bank.
 * No create or delete UI — banks come and go via CBS.
 */
export function BanksTable({
  items,
  loadingInitial,
  loadingMore,
  hasMore,
  error,
  onLoadMore,
  onUpdated,
  onReload,
}: BanksTableProps) {
  const toast = useToast();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    if (!hasMore || loadingInitial) return;
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            onLoadMoreRef.current();
            break;
          }
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadingInitial]);

  const [pending, setPending] = useState<{
    bank: BankRow;
    action: "activate" | "deactivate";
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState<BankRow | null>(null);
  const [syncing, setSyncing] = useState(false);

  const cfg = pending ? actionConfig(pending.action, pending.bank) : null;

  const handleConfirm = async () => {
    if (!pending || busy) return;
    setBusy(true);
    setErrMsg(null);
    try {
      if (pending.action === "activate") {
        await activateBank(pending.bank.id);
      } else {
        await deactivateBank(pending.bank.id);
      }
      const fresh = await refetchOne(pending.bank.code);
      if (fresh) onUpdated(fresh);
      setPending(null);
      setBusy(false);
    } catch (cause) {
      setErrMsg(cause instanceof Error ? cause.message : "Action failed");
      setBusy(false);
    }
  };

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await syncBanks();
      const parts: string[] = [];
      if (res.inserted) parts.push(`${res.inserted} new`);
      if (res.refreshed) parts.push(`${res.refreshed} refreshed`);
      if (res.deactivated) parts.push(`${res.deactivated} deactivated`);
      const summary = parts.length > 0 ? parts.join(" · ") : "already up to date";
      toast.showToast({
        tier: res.firstRun || res.inserted > 0 ? "success" : "neutral",
        message: `Bank catalog synced — ${summary}.`,
      });
      onReload();
    } catch (cause) {
      toast.showToast({
        tier: "danger",
        message:
          cause instanceof Error
            ? cause.message
            : "Couldn't reach CBS — try again in a moment.",
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_0_rgba(42,31,20,0.04),0_8px_24px_-6px_rgba(42,31,20,0.10)]">
      {/* Strip — manual CBS sync trigger */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-brand-cream-2 bg-brand-cream/30 px-6 py-2.5">
        <p className="font-sans text-[11px] text-text-muted">
          Banks are managed in CBS. Use sync to pull the latest catalog and
          surface any new banks for activation.
        </p>
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-brand-dark px-3.5 font-sans text-[11px] font-semibold text-brand-cream transition-all duration-150 ease-out hover:bg-brand-dark/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {syncing ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="size-3.5" aria-hidden />
          )}
          {syncing ? "Syncing…" : "Sync from CBS"}
        </button>
      </div>

      {/* Header row */}
      <div
        className="grid shrink-0 items-center gap-4 border-b border-brand-cream-2 bg-brand-cream/40 px-6 py-3 font-sans text-[10px] font-bold uppercase tracking-[1.2px] text-text-label"
        style={{ gridTemplateColumns: COLUMN_TEMPLATE }}
      >
        <span>Bank</span>
        <span>Code</span>
        <span>Last CBS sync</span>
        <span>Status</span>
        <span className="text-right">Actions</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loadingInitial ? (
          <SkeletonRows />
        ) : error ? (
          <Center>
            <p className="font-sans text-[13px] font-semibold text-negative">
              Couldn't load
            </p>
            <p className="font-sans text-[12px] text-text-muted">{error}</p>
          </Center>
        ) : items.length === 0 ? (
          <Center>
            <p className="font-sans text-[13px] font-semibold text-text-primary">
              No banks yet
            </p>
            <p className="font-sans text-[12px] text-text-muted">
              Hit "Sync from CBS" to pull the catalog.
            </p>
          </Center>
        ) : (
          <>
            {items.map((b) => (
              <div
                key={b.id}
                className={[
                  "grid items-center gap-4 border-b border-brand-cream-2/60 px-6 py-3 transition-colors duration-150 ease-out hover:bg-brand-cream/30",
                  b.active ? "" : "opacity-70",
                ].join(" ")}
                style={{ gridTemplateColumns: COLUMN_TEMPLATE }}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <BankAvatar code={b.code} logoUrl={b.logoUrl} size={36} />
                  <span className="truncate font-sans text-[13px] font-semibold text-text-primary">
                    {b.name}
                  </span>
                </div>
                <span className="flex items-center gap-1.5">
                  <span className="truncate font-mono text-[12px] font-bold text-text-primary">
                    {b.code}
                  </span>
                  {b.numericCode && (
                    <span className="inline-flex items-center rounded-full bg-brand-cream-2/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-text-primary">
                      {b.numericCode}
                    </span>
                  )}
                </span>
                <span
                  className="truncate font-sans text-[12px] text-text-muted"
                  title={
                    b.bankNameSyncedAt
                      ? `Last synced from CBS: ${new Date(b.bankNameSyncedAt).toLocaleString()}`
                      : "Never synced from CBS"
                  }
                >
                  {b.bankNameSyncedAt ? formatDate(b.bankNameSyncedAt) : "—"}
                </span>
                <span>
                  <BankStatusPill active={b.active} />
                </span>
                <div className="flex items-center justify-end gap-1.5">
                  <IconBtn
                    title="Edit logo"
                    tone="neutral"
                    onClick={() => setEditing(b)}
                  >
                    <Pencil className="size-4" aria-hidden />
                  </IconBtn>
                  {b.active ? (
                    <IconBtn
                      title="Deactivate"
                      tone="warning"
                      onClick={() =>
                        setPending({ bank: b, action: "deactivate" })
                      }
                    >
                      <PowerOff className="size-4" aria-hidden />
                    </IconBtn>
                  ) : (
                    <IconBtn
                      title="Activate"
                      tone="positive"
                      onClick={() =>
                        setPending({ bank: b, action: "activate" })
                      }
                    >
                      <Power className="size-4" aria-hidden />
                    </IconBtn>
                  )}
                </div>
              </div>
            ))}
            {loadingMore && <SkeletonRows count={2} />}
            {hasMore && <div ref={sentinelRef} className="h-1" aria-hidden />}
            {!hasMore && items.length > 8 && (
              <div className="px-6 py-4 text-center font-sans text-[11px] text-text-faint">
                End of list · {items.length} loaded
              </div>
            )}
          </>
        )}
      </div>

      {cfg && pending && (
        <ConfirmDialog
          open
          title={cfg.title}
          message={
            <>
              {cfg.message}
              {errMsg && (
                <p className="mt-2 font-semibold text-negative">{errMsg}</p>
              )}
            </>
          }
          confirmLabel={cfg.confirmLabel}
          variant={cfg.variant}
          busy={busy}
          onConfirm={handleConfirm}
          onCancel={() => {
            if (busy) return;
            setPending(null);
            setErrMsg(null);
          }}
        />
      )}

      <BankLogoDialog
        open={!!editing}
        bank={editing}
        onClose={() => setEditing(null)}
        onSuccess={(saved) => onUpdated(saved)}
      />
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────────────── */

async function refetchOne(code: string): Promise<BankRow | null> {
  try {
    const page = await fetchBanksList({ q: code, page: 0, size: 5 });
    return page.content.find((b) => b.code === code) ?? null;
  } catch {
    return null;
  }
}

interface ActionCfg {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  variant: ConfirmVariant;
}

function actionConfig(
  action: "activate" | "deactivate",
  bank: BankRow,
): ActionCfg {
  if (action === "activate") {
    return {
      title: "Activate this bank?",
      confirmLabel: "Activate",
      variant: "positive",
      message: (
        <p>
          <strong className="text-text-primary">{bank.name}</strong> (
          {bank.code}) will be re-enabled. New transfers can route through it
          again.
        </p>
      ),
    };
  }
  return {
    title: "Deactivate this bank?",
    confirmLabel: "Deactivate",
    variant: "warning",
    message: (
      <p>
        <strong className="text-text-primary">{bank.name}</strong> ({bank.code})
        will be hidden from new transfers. Existing accounts and history are
        preserved; reactivating restores it. Clients with accounts at this bank
        will be notified.
      </p>
    ),
  };
}

function BankStatusPill({ active }: { active: boolean }) {
  if (active) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#dff7ec] px-2.5 py-0.5 font-sans text-[10px] font-bold tracking-[0.6px] text-[#1c7a52] ring-1 ring-inset ring-[#a4dec3]">
        <span
          className="size-[6px] shrink-0 rounded-full bg-[#33cc8c]"
          aria-hidden
        />
        ACTIVE
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ece9e4] px-2.5 py-0.5 font-sans text-[10px] font-bold tracking-[0.6px] text-[#5c4a3a] ring-1 ring-inset ring-[#cdc3b6]">
      <span
        className="size-[6px] shrink-0 rounded-full bg-[#8f857b]"
        aria-hidden
      />
      INACTIVE
    </span>
  );
}

function IconBtn({
  title,
  tone,
  onClick,
  children,
}: {
  title: string;
  tone: "neutral" | "positive" | "warning";
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}) {
  const toneClasses =
    tone === "neutral"
      ? "border-brand-cream-2 text-text-primary hover:bg-brand-cream/60"
      : tone === "positive"
        ? "border-positive/40 text-positive hover:bg-positive/10"
        : "border-[#e8cf85] text-[#8a6d1f] hover:bg-[#fdf3df]";
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={[
        "flex size-8 items-center justify-center rounded-full border bg-white",
        "transition-all duration-150 ease-out hover:scale-[1.05]",
        toneClasses,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function SkeletonRows({ count = 6 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="grid items-center gap-4 border-b border-brand-cream-2/60 px-6 py-3"
          style={{ gridTemplateColumns: COLUMN_TEMPLATE }}
        >
          <div className="flex items-center gap-3">
            <div className="size-9 shrink-0 rounded-lg bg-brand-cream-2/60" />
            <div className="h-3 w-40 rounded-full bg-brand-cream-2/60" />
          </div>
          <div className="h-3 w-16 rounded-full bg-brand-cream-2/60" />
          <div className="h-3 w-24 rounded-full bg-brand-cream-2/60" />
          <div className="h-5 w-20 rounded-full bg-brand-cream-2/60" />
          <div className="ml-auto flex gap-1.5">
            <div className="size-8 rounded-full bg-brand-cream-2/60" />
            <div className="size-8 rounded-full bg-brand-cream-2/60" />
          </div>
        </div>
      ))}
    </>
  );
}

function Center({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 py-16">
      {children}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
