import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatRibDisplay } from "@/lib/rib";
import type { ClientAccount } from "@/features/dashboard/api";

interface Step2SourceAndAmountProps {
  accounts: ClientAccount[];
  initial: {
    sourceAccountNumber: string;
    amount: string;
    motif: string;
  };
  /** From `me.defaultAccountId` — picked as the initial source. */
  defaultSourceAccountId: string | null;
  /** Recipient summary card content (rendered at the bottom). */
  recipientSummary: {
    displayName: string;
    bankLabel: string | null;
    accountNumber: string;
    initials: string;
  };
  busy: boolean;
  onBack: () => void;
  onNext: (args: {
    sourceAccountNumber: string;
    amount: string;
    motif: string;
  }) => void;
}

const QUICK_AMOUNTS = [10, 50, 100, 200, 500, 1000];

/**
 * Step 2 — source bank+account dropdowns + amount + motif + recipient
 * confirmation card. Source accounts render via {@link formatRibDisplay}
 * so the 20-digit RIB groups read naturally (BB AAA NNNNNNNNNNNNN CC).
 */
export function Step2SourceAndAmount({
  accounts,
  initial,
  defaultSourceAccountId,
  recipientSummary,
  busy,
  onBack,
  onNext,
}: Step2SourceAndAmountProps) {
  const banks = useMemo(() => {
    const out = new Map<
      string,
      { code: string; name: string; accounts: ClientAccount[] }
    >();
    for (const a of accounts) {
      const cur = out.get(a.bankCode) ?? {
        code: a.bankCode,
        name: a.bankName,
        accounts: [] as ClientAccount[],
      };
      cur.accounts.push(a);
      out.set(a.bankCode, cur);
    }
    return Array.from(out.values()).sort(
      (x, y) => y.accounts.length - x.accounts.length,
    );
  }, [accounts]);

  const initialAccount =
    accounts.find((a) => a.accountNumber === initial.sourceAccountNumber) ??
    accounts.find((a) => a.accountNumber === defaultSourceAccountId) ??
    accounts[0] ??
    null;

  const [bankCode, setBankCode] = useState(initialAccount?.bankCode ?? "");
  const [accountNumber, setAccountNumber] = useState(
    initialAccount?.accountNumber ?? "",
  );
  const [amount, setAmount] = useState(initial.amount);
  const [motif, setMotif] = useState(initial.motif);

  const selectedBank = banks.find((b) => b.code === bankCode) ?? banks[0];
  const accountsForBank = selectedBank?.accounts ?? [];
  const selectedAccount =
    accountsForBank.find((a) => a.accountNumber === accountNumber) ??
    accountsForBank[0];

  useEffect(() => {
    if (
      selectedBank &&
      !selectedBank.accounts.some((a) => a.accountNumber === accountNumber)
    ) {
      setAccountNumber(selectedBank.accounts[0]?.accountNumber ?? "");
    }
  }, [bankCode, selectedBank, accountNumber]);

  const numericAmount = Number(amount);
  const valid =
    numericAmount > 0 &&
    !!selectedAccount &&
    numericAmount <= selectedAccount.balance;

  function submit() {
    if (!valid) return;
    onNext({ sourceAccountNumber: accountNumber, amount, motif });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
      {/* FROM */}
      <div className="flex flex-col gap-1.5">
        <p
          className="font-sans text-[11px] font-bold uppercase tracking-[0.1em] text-text-muted"
          style={{ fontVariationSettings: "'wdth' 100" }}
        >
          From
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <BankDropdown
            label="Bank"
            banks={banks}
            value={bankCode}
            onChange={setBankCode}
          />
          <AccountDropdown
            label="Account"
            accounts={accountsForBank}
            value={accountNumber}
            onChange={setAccountNumber}
          />
        </div>
      </div>

      {/* AMOUNT */}
      <div className="flex flex-col gap-1.5">
        <p
          className="font-sans text-[11px] font-bold uppercase tracking-[0.1em] text-text-muted"
          style={{ fontVariationSettings: "'wdth' 100" }}
        >
          Amount to send
        </p>
        <div className="flex h-[76px] items-center rounded-[14px] border-2 border-accent bg-accent-soft px-6">
          <div className="flex flex-1 items-baseline gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) =>
                setAmount(
                  e.target.value.replace(/[^0-9.,]/g, "").replace(",", "."),
                )
              }
              placeholder="0.000"
              className="w-full bg-transparent font-sans text-[36px] font-bold text-text-primary outline-none placeholder:text-text-muted"
            />
            <span className="shrink-0 font-sans text-[16px] font-bold text-text-secondary">
              TND
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {QUICK_AMOUNTS.map((v) => {
            const selected = Number(amount) === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setAmount(String(v))}
                className={cn(
                  "flex h-[28px] items-center justify-center rounded-full border px-3 font-sans text-[12px] font-semibold transition-colors duration-150 ease-out",
                  selected
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-border-soft bg-surface-card text-text-secondary hover:bg-surface-soft",
                )}
              >
                {v}
              </button>
            );
          })}
          {selectedAccount && (
            <>
              <button
                type="button"
                onClick={() => setAmount(String(selectedAccount.balance))}
                className={cn(
                  "flex h-[28px] items-center justify-center rounded-full border px-3 font-sans text-[12px] font-semibold transition-colors duration-150 ease-out",
                  Number(amount) === selectedAccount.balance
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-border-soft bg-surface-card text-text-secondary hover:bg-surface-soft",
                )}
              >
                ALL
              </button>
              <span className="ml-auto font-sans text-[11px] text-text-secondary">
                Available: {formatTnd(selectedAccount.balance)} TND
              </span>
            </>
          )}
        </div>
      </div>

      {/* MOTIF */}
      <div className="flex flex-col gap-1.5">
        <p
          className="font-sans text-[11px] font-bold uppercase tracking-[0.1em] text-text-muted"
          style={{ fontVariationSettings: "'wdth' 100" }}
        >
          Motif (optional)
        </p>
        <input
          type="text"
          value={motif}
          onChange={(e) => setMotif(e.target.value.slice(0, 500))}
          placeholder="What's the motif behind this money transfer?"
          className="h-12 w-full rounded-[10px] border border-border-soft bg-accent-soft px-4 font-sans text-[14px] text-text-primary outline-none placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/15"
        />
      </div>

      {/* RECIPIENT SUMMARY — sender double-checks before continuing. */}
      <div className="flex items-center gap-3 rounded-xl border border-border-soft bg-surface-raised px-4 py-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent font-sans text-[13px] font-bold text-accent-foreground">
          {recipientSummary.initials}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="font-sans text-[14px] font-bold text-text-primary">
            Sending to {recipientSummary.displayName}
          </p>
          <p className="truncate font-mono text-[12px] text-text-secondary">
            {recipientSummary.bankLabel && (
              <span className="font-sans">{recipientSummary.bankLabel} · </span>
            )}
            {formatRibDisplay(recipientSummary.accountNumber)}
          </p>
        </div>
      </div>

      </div>

      <div className="flex shrink-0 items-center justify-between pt-4">
        <button
          type="button"
          onClick={onBack}
          className="flex h-11 items-center gap-1.5 rounded-[10px] bg-surface-raised pl-4 pr-5 font-sans text-[14px] font-semibold text-text-secondary transition-colors duration-150 ease-out hover:bg-surface-soft"
        >
          <ArrowLeft className="size-4" strokeWidth={2.2} aria-hidden />
          Back
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!valid || busy}
          className="flex h-11 items-center gap-1.5 rounded-[10px] bg-text-primary pl-6 pr-5 font-sans text-[14px] font-bold text-text-on-inverse transition-all duration-150 ease-out hover:bg-text-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Starting…" : "Next"}
          {!busy && (
            <ArrowRight className="size-4" strokeWidth={2.4} aria-hidden />
          )}
        </button>
      </div>
    </div>
  );
}

/* ─── Custom dropdowns ────────────────────────────────────────────────── */

function BankDropdown({
  label,
  banks,
  value,
  onChange,
}: {
  label: string;
  banks: { code: string; name: string }[];
  value: string;
  onChange: (code: string) => void;
}) {
  const selected = banks.find((b) => b.code === value) ?? banks[0];
  return (
    <Dropdown
      label={label}
      onChange={onChange}
      options={banks.map((b) => ({
        value: b.code,
        primary: b.code,
        secondary: b.name,
        leading: <BankAvatar code={b.code} />,
      }))}
      value={selected?.code ?? ""}
      renderTrigger={() => (
        <>
          {selected && (
            <div className="flex items-center gap-3">
              <BankAvatar code={selected.code} />
              <div className="flex flex-col gap-0.5 text-left">
                <p className="font-sans text-[15px] font-semibold text-text-primary">
                  {selected.code}
                </p>
                <p className="font-sans text-[12px] text-text-secondary">
                  {selected.name}
                </p>
              </div>
            </div>
          )}
        </>
      )}
    />
  );
}

function AccountDropdown({
  label,
  accounts,
  value,
  onChange,
}: {
  label: string;
  accounts: ClientAccount[];
  value: string;
  onChange: (n: string) => void;
}) {
  const selected = accounts.find((a) => a.accountNumber === value) ?? accounts[0];
  return (
    <Dropdown
      label={label}
      onChange={onChange}
      options={accounts.map((a) => ({
        value: a.accountNumber,
        primary: `${a.type === "CHECKING" ? "Checking" : "Savings"} · ${formatRibDisplay(a.accountNumber)}`,
        secondary: `${formatTnd(a.balance)} TND available`,
      }))}
      value={selected?.accountNumber ?? ""}
      renderTrigger={() =>
        selected ? (
          <div className="flex min-w-0 flex-col gap-0.5 text-left">
            <p className="font-sans text-[15px] font-semibold text-text-primary">
              {selected.type === "CHECKING" ? "Checking" : "Savings"}
            </p>
            <p className="truncate font-mono text-[11px] text-text-secondary">
              {formatRibDisplay(selected.accountNumber)}
            </p>
          </div>
        ) : null
      }
    />
  );
}

function Dropdown({
  label,
  options,
  value,
  onChange,
  renderTrigger,
}: {
  label: string;
  options: {
    value: string;
    primary: string;
    secondary?: string;
    leading?: React.ReactNode;
  }[];
  value: string;
  onChange: (v: string) => void;
  renderTrigger: () => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [open]);

  return (
    <div className="flex flex-col gap-1">
      <p
        className="font-sans text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted"
        style={{ fontVariationSettings: "'wdth' 100" }}
      >
        {label}
      </p>
      <div ref={wrapperRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="listbox"
          className="flex h-[56px] w-full items-center justify-between rounded-xl border-2 border-accent bg-accent-soft px-4 transition-colors duration-150 ease-out"
        >
          {renderTrigger()}
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-text-secondary transition-transform duration-150 ease-out",
              open && "rotate-180",
            )}
            strokeWidth={2.4}
            aria-hidden
          />
        </button>
        {open && (
          <ul
            role="listbox"
            className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-[280px] overflow-y-auto rounded-xl border border-border-soft bg-surface-card shadow-[0px_8px_24px_0px_rgba(0,0,0,0.18)]"
          >
            {options.map((o) => {
              const selected = o.value === value;
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 ease-out",
                      selected ? "bg-accent-soft" : "hover:bg-surface-soft",
                    )}
                  >
                    {o.leading}
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <p className="font-sans text-[14px] font-semibold text-text-primary">
                        {o.primary}
                      </p>
                      {o.secondary && (
                        <p className="font-sans text-[12px] text-text-secondary">
                          {o.secondary}
                        </p>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function BankAvatar({ code }: { code: string }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-accent">
      <span className="font-sans text-[11px] font-bold text-white">
        {code.slice(0, 2)}
      </span>
    </span>
  );
}

function formatTnd(value: number): string {
  const fixed = Math.abs(value).toFixed(3);
  const [intPart, fracPart] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${grouped}.${fracPart}`;
}
