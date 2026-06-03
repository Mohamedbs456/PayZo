import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDown, ArrowRight, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { isDemoMode, withDemo } from "@/lib/demoMode";
import { ApiError } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { formatRibDisplay } from "@/lib/rib";
import {
  type ClientAccount,
  getAccounts,
} from "@/features/dashboard/api";
import { DEMO_ACCOUNTS } from "@/features/dashboard/mockData";
import { executeInternalTransfer } from "@/features/transfers/api";
import { TransferSummaryPanel } from "@/features/transfers/components/TransferSummaryPanel";

/**
 * Between-my-accounts transfer (Figma 174:2).
 *
 * Single page — no OTP, no fraud-scoring (D40), instant settlement.
 * From-block + ↓ icon + To-block + amount + "instant + free" callout
 * + a single primary "Move money →" CTA.
 */
export function InternalTransferPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const demo = isDemoMode();

  const [accounts, setAccounts] = useState<ClientAccount[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (demo) {
      setAccounts(DEMO_ACCOUNTS);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await getAccounts();
        if (!cancelled) setAccounts(data);
      } catch (err) {
        if (cancelled) return;
        if (!(err instanceof ApiError)) throw err;
        setAccounts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [demo]);

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
    return Array.from(out.values());
  }, [accounts]);

  const [fromBank, setFromBank] = useState("");
  const [fromAccount, setFromAccount] = useState("");
  const [toBank, setToBank] = useState("");
  const [toAccount, setToAccount] = useState("");
  const [amount, setAmount] = useState("");

  // Bootstrap default selections — first bank with multiple accounts goes
  // on the FROM side; the next becomes TO.
  useEffect(() => {
    if (banks.length === 0 || fromBank) return;
    setFromBank(banks[0].code);
    setFromAccount(banks[0].accounts[0]?.accountNumber ?? "");
    if (banks.length > 1) {
      setToBank(banks[1].code);
      setToAccount(banks[1].accounts[0]?.accountNumber ?? "");
    } else if (banks[0].accounts.length > 1) {
      setToBank(banks[0].code);
      setToAccount(banks[0].accounts[1].accountNumber);
    }
  }, [banks, fromBank]);

  const fromBucket = banks.find((b) => b.code === fromBank);
  const fromAcct = fromBucket?.accounts.find(
    (a) => a.accountNumber === fromAccount,
  );
  const toBucket = banks.find((b) => b.code === toBank);
  const toAcct = toBucket?.accounts.find((a) => a.accountNumber === toAccount);

  // Snap account selection when bank changes.
  useEffect(() => {
    if (fromBucket && !fromBucket.accounts.some((a) => a.accountNumber === fromAccount)) {
      setFromAccount(fromBucket.accounts[0]?.accountNumber ?? "");
    }
  }, [fromBank, fromBucket, fromAccount]);
  useEffect(() => {
    if (toBucket && !toBucket.accounts.some((a) => a.accountNumber === toAccount)) {
      setToAccount(toBucket.accounts[0]?.accountNumber ?? "");
    }
  }, [toBank, toBucket, toAccount]);

  const numericAmount = Number(amount);
  const sameAccount = fromAccount && fromAccount === toAccount;
  const valid =
    !!fromAcct &&
    !!toAcct &&
    !sameAccount &&
    numericAmount > 0 &&
    numericAmount <= (fromAcct?.balance ?? 0);

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      if (!demo) {
        await executeInternalTransfer({
          sourceAccountNumber: fromAccount,
          destAccountNumber: toAccount,
          amount: numericAmount,
        });
      }
      toast.showToast({ tier: "success", message: "Money moved." });
      navigate(withDemo("/dashboard"), { replace: true });
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 422
          ? err.message ?? "Insufficient balance."
          : "Couldn't move the money. Try again.";
      toast.showToast({ tier: "danger", message: msg });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full min-h-0 flex-1 flex-col gap-4 lg:flex-row">
      <main className="flex min-w-0 flex-1 flex-col gap-2.5 overflow-hidden rounded-3xl border border-border-soft bg-surface-card px-6 py-5 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.18)] sm:px-8 sm:py-5">
        <header className="flex flex-col gap-0.5">
          <p
            className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-accent"
            style={{ fontVariationSettings: "'wdth' 100" }}
          >
            Internal transfer
          </p>
          <h1 className="font-sans text-[clamp(18px,2.2vw,22px)] font-bold leading-tight text-text-primary">
            Move money between your accounts
          </h1>
        </header>

        {/* FROM */}
        <SideBlock
          label="From"
          banks={banks}
          bankCode={fromBank}
          accountNumber={fromAccount}
          onBank={setFromBank}
          onAccount={setFromAccount}
        />

        {/* Down arrow */}
        <div className="flex justify-center" aria-hidden>
          <span className="flex size-8 items-center justify-center rounded-full bg-accent-soft">
            <ArrowDown
              className="size-5 text-accent"
              strokeWidth={2}
            />
          </span>
        </div>

        {/* TO */}
        <SideBlock
          label="To"
          banks={banks}
          bankCode={toBank}
          accountNumber={toAccount}
          onBank={setToBank}
          onAccount={setToAccount}
        />

        {/* Amount */}
        <div className="flex flex-col gap-1.5">
          <p
            className="font-sans text-[11px] font-bold uppercase tracking-[0.1em] text-text-muted"
            style={{ fontVariationSettings: "'wdth' 100" }}
          >
            Amount to move
          </p>
          <div className="flex h-[64px] items-center justify-between rounded-[14px] border-2 border-accent bg-accent-soft px-6">
            <div className="flex items-baseline gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) =>
                  setAmount(
                    e.target.value
                      .replace(/[^0-9.,]/g, "")
                      .replace(",", "."),
                  )
                }
                placeholder="0.000"
                className="w-[240px] bg-transparent font-sans text-[30px] font-bold text-text-primary outline-none placeholder:text-text-muted"
              />
              <span className="font-sans text-[16px] font-bold text-text-secondary">
                TND
              </span>
            </div>
          </div>
          {fromAcct && (
            <p className="font-sans text-[11px] text-text-secondary">
              Available: {formatTnd(fromAcct.balance)} TND
            </p>
          )}
          {sameAccount && (
            <p role="alert" className="font-sans text-[12px] text-negative">
              Source and destination must be different accounts.
            </p>
          )}
        </div>

        {/* Instant callout */}
        <div className="flex items-center gap-2.5 rounded-[10px] bg-positive-soft px-3 py-2">
          <Check className="size-4 shrink-0 text-positive" strokeWidth={2.6} aria-hidden />
          <p className="font-sans text-[12px] font-semibold text-text-primary">
            Instant, free, no OTP required.
          </p>
        </div>

        <div className="flex flex-1" />

        <div className="flex justify-end">
          <button
            type="button"
            onClick={submit}
            disabled={!valid || busy}
            className="flex h-12 items-center gap-2 rounded-[12px] bg-accent px-7 font-sans text-[14px] font-bold text-accent-foreground transition-all duration-150 ease-out hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-card disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Moving…" : "Move money"}
            {!busy && (
              <ArrowRight className="size-4" strokeWidth={2.4} aria-hidden />
            )}
          </button>
        </div>
      </main>

      <TransferSummaryPanel
        headerEyebrow="Internal transfer"
        headerTitle="Moving money"
        headerSubtitle="Both accounts belong to you — instant settlement."
        hideAccountRow
        fields={{
          fromTitle: fromAcct
            ? `${fromAcct.bankCode} · ${fromAcct.type === "CHECKING" ? "Checking" : "Savings"}`
            : undefined,
          fromSecondary: fromAcct
            ? `${formatRibDisplay(fromAcct.accountNumber)} · ${formatTnd(fromAcct.balance)} TND`
            : undefined,
          toName: toAcct
            ? `${toAcct.bankCode} · ${toAcct.type === "CHECKING" ? "Checking" : "Savings"}`
            : undefined,
          toSecondary: toAcct
            ? `${formatRibDisplay(toAcct.accountNumber)} · ${formatTnd(toAcct.balance)} TND`
            : undefined,
          amount: numericAmount > 0 ? `${formatTnd(numericAmount)} TND` : undefined,
        }}
      />
    </div>
  );
}

function SideBlock({
  label,
  banks,
  bankCode,
  accountNumber,
  onBank,
  onAccount,
}: {
  label: string;
  banks: { code: string; name: string; accounts: ClientAccount[] }[];
  bankCode: string;
  accountNumber: string;
  onBank: (c: string) => void;
  onAccount: (n: string) => void;
}) {
  const bucket = banks.find((b) => b.code === bankCode);
  const account = bucket?.accounts.find((a) => a.accountNumber === accountNumber);
  return (
    <div className="flex flex-col gap-1">
      <p
        className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-text-muted"
        style={{ fontVariationSettings: "'wdth' 100" }}
      >
        {label}
      </p>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <SimpleSelect
          label="Bank"
          value={bankCode}
          onChange={onBank}
          options={banks.map((b) => ({
            value: b.code,
            primary: b.code,
            secondary: b.name,
            leading: (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-accent">
                <span className="font-sans text-[11px] font-bold text-white">
                  {b.code.slice(0, 2)}
                </span>
              </span>
            ),
          }))}
          renderTrigger={() =>
            bucket ? (
              <div className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-accent">
                  <span className="font-sans text-[11px] font-bold text-white">
                    {bucket.code.slice(0, 2)}
                  </span>
                </span>
                <div className="flex flex-col gap-0.5 text-left">
                  <p className="font-sans text-[15px] font-semibold text-text-primary">
                    {bucket.code}
                  </p>
                  <p className="font-sans text-[12px] text-text-secondary">
                    {bucket.name}
                  </p>
                </div>
              </div>
            ) : null
          }
        />
        <SimpleSelect
          label="Account"
          value={accountNumber}
          onChange={onAccount}
          options={
            bucket?.accounts.map((a) => ({
              value: a.accountNumber,
              primary: `${a.type === "CHECKING" ? "Checking" : "Savings"} · ${formatRibDisplay(a.accountNumber)}`,
              secondary: `${formatTnd(a.balance)} TND ${a.type === "SAVINGS" ? "current" : "available"}`,
            })) ?? []
          }
          renderTrigger={() =>
            account ? (
              <div className="flex min-w-0 flex-col gap-0.5 text-left">
                <p className="font-sans text-[15px] font-semibold text-text-primary">
                  {account.type === "CHECKING" ? "Checking" : "Savings"}
                </p>
                <p className="truncate font-mono text-[11px] text-text-secondary">
                  {formatRibDisplay(account.accountNumber)} ·{" "}
                  {formatTnd(account.balance)} TND
                </p>
              </div>
            ) : null
          }
        />
      </div>
    </div>
  );
}

function SimpleSelect({
  label,
  value,
  options,
  onChange,
  renderTrigger,
}: {
  label: string;
  value: string;
  options: {
    value: string;
    primary: string;
    secondary?: string;
    leading?: React.ReactNode;
  }[];
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
    <div className="flex flex-col gap-1.5">
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
          className="flex h-[48px] w-full items-center justify-between rounded-xl border border-border-soft bg-accent-soft px-3 transition-colors duration-150 ease-out"
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
            {options.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 ease-out",
                    o.value === value
                      ? "bg-accent-soft"
                      : "hover:bg-surface-soft",
                  )}
                >
                  {o.leading}
                  <div className="flex flex-col gap-0.5">
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
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function formatTnd(value: number): string {
  const fixed = Math.abs(value).toFixed(3);
  const [intPart, fracPart] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${grouped}.${fracPart}`;
}
