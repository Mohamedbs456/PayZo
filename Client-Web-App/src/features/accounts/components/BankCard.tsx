import { useEffect, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Star,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { withDemo } from "@/lib/demoMode";
import { formatRibDisplay } from "@/lib/rib";
import type { ClientAccount } from "@/features/dashboard/api";

interface BankCardProps {
  bankCode: string;
  bankName: string;
  total: number;
  accounts: ClientAccount[];
  /** True when this bank's slice is shown in the donut. Drives the
   *  accent-soft header tint + "SHOWN IN PIE" pill. */
  isInPie: boolean;
  /** Account number that should render in the selected/expanded state
   *  (driven by the donut's selectedAccount). */
  selectedAccount: string | null;
  onSelectAccount: (accountNumber: string | null) => void;
  /** From `me.defaultAccountId` — the matching row gets a ★ marker. */
  defaultAccountId: string | null;
}

/**
 * Single bank card in the "Your banks" list (Figma 183:11). Click the
 * header to toggle the bank open/closed; when open, the rows for each
 * account in the bank render below. Clicking an account row toggles a
 * detail strip showing full account number (with copy), type, agency,
 * opened-on date, last-activity stamp, and a link to filtered
 * transactions.
 *
 * Selection styling:
 *   - The header gets `bg-accent-soft` whenever this bank is the one
 *     driving the donut chart.
 *   - The currently-selected account row gets a 4px accent vertical
 *     bar on its left + accent-soft body bg + the detail strip auto-
 *     expands.
 */
export function BankCard({
  bankCode,
  bankName,
  total,
  accounts,
  isInPie,
  selectedAccount,
  onSelectAccount,
  defaultAccountId,
}: BankCardProps) {
  // Auto-open the bank when one of its accounts is selected so the
  // donut→list link feels immediate.
  const containsSelected = accounts.some(
    (a) => a.accountNumber === selectedAccount,
  );
  const [open, setOpen] = useState<boolean>(isInPie || containsSelected);

  // React only when the selection actually CHANGES — without this the
  // effect would fire every render and force the bank back open the
  // moment the user clicked the header to collapse it.
  useEffect(() => {
    if (containsSelected) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccount]);

  return (
    <div className="overflow-hidden rounded-2xl border border-border-soft bg-surface-card">
      <BankHeader
        bankCode={bankCode}
        bankName={bankName}
        accountCount={accounts.length}
        total={total}
        isInPie={isInPie}
        open={open}
        onToggle={() => setOpen((v) => !v)}
      />

      {open && (
        <ul className="flex flex-col">
          {accounts.map((a, i) => (
            <AccountRow
              key={a.accountNumber}
              account={a}
              selected={selectedAccount === a.accountNumber}
              isLast={i === accounts.length - 1}
              isDefault={defaultAccountId === a.accountNumber}
              onClick={() => {
                if (selectedAccount === a.accountNumber) {
                  onSelectAccount(null);
                } else {
                  onSelectAccount(a.accountNumber);
                }
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/* ─── Header ──────────────────────────────────────────────────────────── */

function BankHeader({
  bankCode,
  bankName,
  accountCount,
  total,
  isInPie,
  open,
  onToggle,
}: {
  bankCode: string;
  bankName: string;
  accountCount: number;
  total: number;
  isInPie: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cn(
        "flex h-[76px] w-full items-center justify-between gap-3 px-6 text-left transition-colors duration-150 ease-out",
        isInPie ? "bg-accent-soft" : "bg-surface-card hover:bg-surface-soft",
      )}
    >
      <div className="flex min-w-0 items-center gap-3.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-accent">
          <span className="font-sans text-[11px] font-bold text-text-on-inverse">
            {bankCode}
          </span>
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-2.5">
            <span className="truncate font-sans text-[15px] font-bold text-text-primary">
              {bankCode}
            </span>
            {isInPie && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-2 py-0.5">
                <span
                  className="size-1.5 rounded-full bg-positive"
                  aria-hidden
                />
                <span
                  className="font-sans text-[9px] font-semibold uppercase tracking-[0.08em] text-accent-foreground"
                  style={{ fontVariationSettings: "'wdth' 100" }}
                >
                  Shown in pie
                </span>
              </span>
            )}
          </div>
          <p className="truncate font-sans text-[12px] text-text-secondary">
            {bankName} · {accountCount} accounts
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-4">
        <div className="flex flex-col items-end">
          <p className="font-sans text-[18px] font-bold text-text-primary">
            {formatTnd(total)} TND
          </p>
          <p className="font-sans text-[11px] text-text-secondary">
            Total balance
          </p>
        </div>
        <ChevronDown
          className={cn(
            "size-4 text-text-secondary transition-transform duration-200 ease-out",
            open && "rotate-180",
          )}
          strokeWidth={2.4}
          aria-hidden
        />
      </div>
    </button>
  );
}

/* ─── Row + detail ────────────────────────────────────────────────────── */

function AccountRow({
  account,
  selected,
  isLast,
  isDefault,
  onClick,
}: {
  account: ClientAccount;
  selected: boolean;
  isLast: boolean;
  isDefault: boolean;
  onClick: () => void;
}) {
  return (
    <li
      className={cn(
        "flex flex-col border-t border-border-soft",
        !isLast && !selected && "",
      )}
    >
      <div className="flex">
        {/* 4px accent bar — only on the selected row */}
        {selected && (
          <span
            aria-hidden
            className="w-1 shrink-0 self-stretch bg-accent"
          />
        )}
        <RowSummary
          account={account}
          selected={selected}
          isDefault={isDefault}
          onClick={onClick}
        />
      </div>

      {/* Detail strip — animated slide-down when selected */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          selected ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          {selected && <RowDetail account={account} />}
        </div>
      </div>
    </li>
  );
}

function RowSummary({
  account,
  selected,
  isDefault,
  onClick,
}: {
  account: ClientAccount;
  selected: boolean;
  isDefault: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      aria-expanded={selected}
      className={cn(
        "flex h-[60px] flex-1 items-center justify-between gap-3 px-6 text-left transition-colors duration-150 ease-out",
        selected ? "bg-accent-soft" : "bg-surface-card hover:bg-surface-soft",
      )}
    >
      <div className="flex min-w-0 items-center gap-3.5">
        {/* Indent rule (left of the type pill) — visual only. */}
        <span
          aria-hidden
          className="h-8 w-0.5 shrink-0 rounded-sm bg-border-soft"
        />
        <TypePill type={account.type} />
        <span className="font-mono text-[14px] tracking-[0.04em] text-text-primary">
          •••• {account.accountNumber.slice(-4)}
        </span>
        {isDefault && (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning-soft pl-1 pr-2 py-0.5"
            title="Default account"
            aria-label="Default account"
          >
            <Star
              className="size-3 text-warning"
              fill="currentColor"
              strokeWidth={1.6}
              aria-hidden
            />
            <span
              className="font-sans text-[9px] font-semibold uppercase tracking-[0.08em] text-warning"
              style={{ fontVariationSettings: "'wdth' 100" }}
            >
              Default
            </span>
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-4">
        <div className="flex flex-col items-end">
          <p className="font-sans text-[14px] font-bold text-text-primary">
            {formatTnd(account.balance)} TND
          </p>
          <p className="font-sans text-[11px] text-text-secondary">
            Available · {formatTnd(account.balance)} TND
          </p>
        </div>
        <ChevronDown
          className={cn(
            "size-3.5 text-text-secondary transition-transform duration-200 ease-out",
            selected && "rotate-180",
          )}
          strokeWidth={2.4}
          aria-hidden
        />
      </div>
    </button>
  );
}

function RowDetail({ account }: { account: ClientAccount }) {
  const [copied, setCopied] = useState(false);

  function copyAccountNumber() {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(account.accountNumber).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 bg-accent-soft px-6 pb-5 pl-9 pr-6 pt-5">
      <div className="flex flex-1 flex-wrap gap-x-8 gap-y-4">
        <DetailField label="Full account number">
          <span className="flex items-center gap-1.5">
            <span className="font-sans text-[13px] font-semibold text-text-primary">
              {formatGroupedAccount(account.accountNumber)}
            </span>
            <button
              type="button"
              onClick={copyAccountNumber}
              aria-label={copied ? "Copied" : "Copy account number"}
              className="flex size-[18px] items-center justify-center rounded text-text-secondary transition-colors duration-150 ease-out hover:text-text-primary"
            >
              {copied ? (
                <Check className="size-3" strokeWidth={2.6} aria-hidden />
              ) : (
                <Copy className="size-3" strokeWidth={2} aria-hidden />
              )}
            </button>
          </span>
        </DetailField>

        <DetailField label="Account type">
          {account.type === "CHECKING" ? "Checking" : "Savings"}
        </DetailField>

        {account.branch && (
          <DetailField label="Agency">{account.branch}</DetailField>
        )}

        {account.openedAt && (
          <DetailField label="Opened">{formatLongDate(account.openedAt)}</DetailField>
        )}

        {account.lastActivityAt && (
          <DetailField label="Last activity">
            {formatRelativeStamp(account.lastActivityAt)}
          </DetailField>
        )}
      </div>

      <Link
        to={withDemo(`/transactions?account=${account.accountNumber}`)}
        className="flex shrink-0 items-center gap-1.5 self-end font-sans text-[13px] font-bold italic text-[#328cc4] underline underline-offset-2 transition-colors duration-150 ease-out hover:text-accent"
      >
        View transactions
        <ChevronRight className="size-3.5" strokeWidth={2.4} aria-hidden />
      </Link>
    </div>
  );
}

function DetailField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-[140px] flex-col gap-1">
      <span
        className="font-sans text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted"
        style={{ fontVariationSettings: "'wdth' 100" }}
      >
        {label}
      </span>
      <span className="font-sans text-[13px] font-semibold text-text-primary">
        {children}
      </span>
    </div>
  );
}

function TypePill({ type }: { type: ClientAccount["type"] }) {
  const isSavings = type === "SAVINGS";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-lg px-2 py-0.5",
        isSavings ? "bg-positive-soft" : "bg-accent-soft",
      )}
    >
      <span
        className="font-sans text-[9px] font-bold uppercase tracking-[0.08em] text-text-primary"
        style={{ fontVariationSettings: "'wdth' 100" }}
      >
        {type}
      </span>
    </span>
  );
}

/* ─── Formatters ──────────────────────────────────────────────────────── */

function formatTnd(value: number): string {
  const fixed = Math.abs(value).toFixed(3);
  const [intPart, fracPart] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${grouped}.${fracPart}`;
}

function formatGroupedAccount(accountNumber: string): string {
  // 20-digit Tunisian RIB → BB AAA NNNNNNNNNNNNN CC; falls through to a
  // generic 4-digit grouping for anything that isn't a canonical RIB.
  const grouped = formatRibDisplay(accountNumber);
  if (grouped !== accountNumber) return grouped;
  return accountNumber.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatRelativeStamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (d.toDateString() === now.toDateString()) return `Today · ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday · ${time}`;
  const month = d.toLocaleString("en-US", { month: "short" });
  return `${month} ${d.getDate()} · ${time}`;
}
