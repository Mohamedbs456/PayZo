import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight, Loader2, Star } from "lucide-react";
import { ClientAvatar } from "@/features/clients/components/ClientAvatar";
import { ClientStatusPill } from "@/features/clients/components/ClientStatusPill";
import { BankAvatar } from "@/features/banks/components/BankAvatar";
import { formatAccountNumber } from "@/features/transactions/format";
import { fetchBanks } from "@/features/dashboard/api";
import { fetchCbsAccounts, type CbsAccountRow } from "../api";
import type { ClientListItem } from "@/features/clients/api";

interface AccountsTableProps {
  items: ClientListItem[];
  loadingInitial: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  onLoadMore: () => void;
}

const COLUMN_TEMPLATE =
  "minmax(220px,2fr) minmax(110px,1fr) minmax(160px,1.2fr) minmax(140px,1fr) minmax(120px,0.8fr)";

// Inner account-list grid. The account-number column is sized to fit a fully
// formatted 20-digit Tunisian RIB ("BB AAA NNNNNNNNNNNNN CC") on one line so it
// never clips. Shared by the account-list header and its rows to keep them
// aligned.
const ACCOUNT_COLUMN_TEMPLATE =
  "minmax(160px,1.3fr) minmax(220px,1.8fr) minmax(95px,0.7fr) minmax(130px,1fr)";

/**
 * Accounts page table — minimal client rows, click-to-expand revealing the
 * client's full CBS account list (lazy-fetched per row). Reuses
 * ClientAvatar / ClientStatusPill from the Clients feature.
 */
export function AccountsTable({
  items,
  loadingInitial,
  loadingMore,
  hasMore,
  error,
  onLoadMore,
}: AccountsTableProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [bankNames, setBankNames] = useState<Record<string, string>>({});

  // Bank code → full name, so the expanded account rows can show the bank's
  // proper name (e.g. "Société Tunisienne de Banque") next to the colored code
  // tile instead of repeating the bare code. Fetched once per mount; banks
  // rarely change. Failure is non-fatal — rows fall back to the code.
  useEffect(() => {
    const controller = new AbortController();
    fetchBanks(controller.signal)
      .then((page) => {
        const map: Record<string, string> = {};
        for (const b of page.content) map[b.code] = b.name;
        setBankNames(map);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        console.error("[accounts] bank names fetch failed", cause);
      });
    return () => controller.abort();
  }, []);

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

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_0_rgba(42,31,20,0.04),0_8px_24px_-6px_rgba(42,31,20,0.10)]">
      {/* Sticky header */}
      <div
        className="grid shrink-0 items-center gap-4 border-b border-brand-cream-2 bg-brand-cream/40 px-6 py-3 font-sans text-[10px] font-bold uppercase tracking-[1.2px] text-text-label"
        style={{ gridTemplateColumns: COLUMN_TEMPLATE }}
      >
        <span>Client</span>
        <span>CIN</span>
        <span>Phone</span>
        <span>Governorate</span>
        <span>Status</span>
      </div>

      {/* Body — single scroll surface */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loadingInitial ? (
          <SkeletonRows />
        ) : error ? (
          <Center>
            <p className="font-sans text-[13px] font-semibold text-negative">
              Couldn't load clients
            </p>
            <p className="font-sans text-[12px] text-text-muted">{error}</p>
          </Center>
        ) : items.length === 0 ? (
          <Center>
            <p className="font-sans text-[13px] font-semibold text-text-primary">
              No clients found
            </p>
            <p className="font-sans text-[12px] text-text-muted">
              Try a different bank or search term.
            </p>
          </Center>
        ) : (
          <>
            {items.map((c) => {
              const isExpanded = expandedId === c.userId;
              if (isExpanded) {
                return (
                  <ExpandedAccountsRow
                    key={c.userId}
                    client={c}
                    bankNames={bankNames}
                    onCollapse={() => setExpandedId(null)}
                  />
                );
              }
              return (
                <AccountsRow
                  key={c.userId}
                  client={c}
                  onToggle={() => setExpandedId(c.userId)}
                />
              );
            })}
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
    </div>
  );
}

/* ─── Minimal row ─────────────────────────────────────────────────────── */

function AccountsRow({
  client,
  onToggle,
}: {
  client: ClientListItem;
  onToggle: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      className="grid cursor-pointer items-center gap-4 border-b border-brand-cream-2/60 px-6 py-3 transition-colors duration-150 ease-out hover:bg-brand-cream/30"
      style={{ gridTemplateColumns: COLUMN_TEMPLATE }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <ClientAvatar
          firstName={client.firstName}
          lastName={client.lastName}
          profilePictureUrl={client.profilePictureUrl}
        />
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate font-sans text-[13px] font-semibold text-text-primary">
            {client.firstName} {client.lastName}
          </span>
          <span className="truncate font-mono text-[11px] text-text-muted">
            @{client.username ?? "—"}
          </span>
        </div>
        <ChevronRight className="ml-auto size-4 shrink-0 text-text-faint" aria-hidden />
      </div>
      <span className="truncate font-sans text-[12px] text-text-primary">{client.cin}</span>
      <span className="truncate font-sans text-[12px] text-text-primary">
        {formatPhone(client.phone)}
      </span>
      <span className="truncate font-sans text-[12px] text-text-primary">
        {client.governorate ?? "—"}
      </span>
      <span>
        <ClientStatusPill status={client.status} />
      </span>
    </div>
  );
}

/* ─── Expanded panel — lists CBS accounts for the client ──────────────── */

function ExpandedAccountsRow({
  client,
  bankNames,
  onCollapse,
}: {
  client: ClientListItem;
  bankNames: Record<string, string>;
  onCollapse: () => void;
}) {
  const [accounts, setAccounts] = useState<CbsAccountRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchCbsAccounts(client.userId, controller.signal)
      .then((rows) => setAccounts(rows))
      .catch((cause) => {
        if (controller.signal.aborted) return;
        console.error("[accounts] cbs accounts fetch failed", cause);
        setError(cause instanceof Error ? cause.message : "Failed to load");
      });
    return () => controller.abort();
  }, [client.userId]);

  return (
    <div className="animate-row-fade-in border-b border-brand-cream-2/60 bg-brand-cream/20 px-6 py-5">
      {/* Click-to-collapse header — same gesture symmetry as the Clients page. */}
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
        <ClientStatusPill status={client.status} />
        <span className="ml-2 font-mono text-[12px] text-text-muted">CIN {client.cin}</span>
        <div className="min-w-0 flex-1" />
        {accounts && (
          <span className="font-sans text-[12px] text-text-muted">
            {accounts.length} account{accounts.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="mt-4">
        <SectionTitle>Bank accounts</SectionTitle>

        {accounts === null && !error && (
          <div className="mt-3 flex items-center gap-2 px-1 font-sans text-[12px] text-text-muted">
            <Loader2 className="size-3 animate-spin" aria-hidden />
            Loading from CBS…
          </div>
        )}

        {error && (
          <p className="mt-3 px-1 font-sans text-[12px] font-semibold text-negative">
            {error}
          </p>
        )}

        {accounts && accounts.length === 0 && (
          <p className="mt-3 px-1 font-sans text-[12px] text-text-muted">
            This client has no CBS accounts.
          </p>
        )}

        {accounts && accounts.length > 0 && (
          <div className="mt-3 overflow-hidden rounded-xl border border-brand-cream-2/80 bg-white">
            {/* Account-list header */}
            <div
              className="grid items-center gap-4 border-b border-brand-cream-2/60 bg-brand-cream/40 px-4 py-2.5 font-sans text-[10px] font-bold uppercase tracking-[1.2px] text-text-label"
              style={{ gridTemplateColumns: ACCOUNT_COLUMN_TEMPLATE }}
            >
              <span>Bank</span>
              <span>Account number</span>
              <span>Type</span>
              <span className="text-right pr-2">Balance</span>
            </div>
            {accounts.map((a) => {
              const isDefault =
                client.defaultAccountId != null &&
                a.accountNumber === client.defaultAccountId;
              return (
                <div
                  key={a.accountNumber}
                  className="grid items-center gap-4 border-b border-brand-cream-2/60 px-4 py-3 last:border-b-0"
                  style={{ gridTemplateColumns: ACCOUNT_COLUMN_TEMPLATE }}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <BankAvatar code={a.bankCode} size={28} />
                    <div className="flex min-w-0 flex-col leading-tight">
                      <span className="truncate font-sans text-[12px] font-semibold text-text-primary">
                        {a.bankCode}
                      </span>
                      <span
                        className="truncate font-sans text-[10px] text-text-muted"
                        title={bankNames[a.bankCode] ?? undefined}
                      >
                        {bankNames[a.bankCode] ?? "—"}
                      </span>
                    </div>
                  </div>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="whitespace-nowrap font-mono text-[12px] text-text-primary">
                      {formatAccountNumber(a.accountNumber)}
                    </span>
                    {isDefault && (
                      <span className="inline-flex shrink-0" title="Client's default account">
                        <Star
                          className="size-3.5 fill-amber-400 text-amber-500"
                          aria-label="Client's default account"
                        />
                      </span>
                    )}
                  </div>
                  <span className="font-sans text-[11px] font-bold uppercase tracking-[0.6px] text-text-muted">
                    {a.type}
                  </span>
                  <span className="text-right pr-2 font-sans text-[12px] font-semibold tabular-nums text-text-primary">
                    {formatBalance(a.balance)} <span className="text-text-faint">TND</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────────────── */

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-sans text-[10px] font-bold uppercase tracking-[1.4px] text-brand-medium">
        {children}
      </span>
      <div className="h-px flex-1 bg-brand-cream-2" />
    </div>
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
            <div className="size-9 shrink-0 rounded-full bg-brand-cream-2/60" />
            <div className="flex flex-col gap-1.5">
              <div className="h-3 w-32 rounded-full bg-brand-cream-2/60" />
              <div className="h-2.5 w-20 rounded-full bg-brand-cream-2/40" />
            </div>
          </div>
          <div className="h-3 w-20 rounded-full bg-brand-cream-2/60" />
          <div className="h-3 w-28 rounded-full bg-brand-cream-2/60" />
          <div className="h-3 w-20 rounded-full bg-brand-cream-2/60" />
          <div className="h-5 w-20 rounded-full bg-brand-cream-2/60" />
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

function formatPhone(raw: string | null): string {
  if (!raw) return "—";
  const stripped = raw.replace(/\s+/g, "");
  if (stripped.startsWith("+216") && stripped.length === 12) {
    const rest = stripped.slice(4);
    return `+216 ${rest.slice(0, 2)} ${rest.slice(2, 5)} ${rest.slice(5)}`;
  }
  return raw;
}

function formatBalance(raw: string): string {
  const n = Number(raw);
  if (Number.isNaN(n)) return raw;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
