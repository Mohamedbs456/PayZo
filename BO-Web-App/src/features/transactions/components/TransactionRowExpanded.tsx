import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, Loader2, ChevronUp } from "lucide-react";
import { BankAvatar } from "@/features/banks/components/BankAvatar";
import {
  fetchTransactionDetail,
  type TransactionDetail,
  type TransactionListItem,
} from "../api";
import { TransactionStatusPill } from "./TransactionStatusPill";
import { RiskBadge } from "./RiskBadge";
import { formatAccountNumber, formatAmount, formatDateTime } from "../format";

interface TransactionRowExpandedProps {
  row: TransactionListItem;
  onCollapse: () => void;
}

/**
 * Click-to-expand detail panel for a transaction row (D32 / Impact 9b).
 * Three sections separated by hairlines on lg+ screens — Parties (sender,
 * receiver), Money trail (amount, motif, account numbers, snapshot stamp),
 * and Pipeline (status timeline + ML decision context).
 *
 * The detail payload is lazy-fetched on expand and cached only for the
 * lifetime of this row instance — collapsing+re-expanding refetches.
 */
export function TransactionRowExpanded({ row, onCollapse }: TransactionRowExpandedProps) {
  const [detail, setDetail] = useState<TransactionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchTransactionDetail(row.id, controller.signal)
      .then((d) => setDetail(d))
      .catch((cause) => {
        if (controller.signal.aborted) return;
        console.error("[transactions] detail fetch failed", cause);
        setError(cause instanceof Error ? cause.message : "Failed to load");
      });
    return () => controller.abort();
  }, [row.id]);

  return (
    <div className="animate-row-fade-in border-b border-brand-cream-2/60 bg-brand-cream/55 px-6 py-5">
      {/* Click-to-collapse header — same gesture symmetry as Clients/Accounts. */}
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
        className="-m-1.5 flex cursor-pointer items-center gap-3 rounded-lg p-1.5 transition-colors duration-150 ease-out hover:bg-brand-cream-2/40"
      >
        <span className="font-mono text-[13px] font-bold text-text-primary">
          {row.reference}
        </span>
        <TransactionStatusPill status={row.status} />
        <RiskBadge level={row.riskLevel} />
        <div className="min-w-0 flex-1" />
        <span className="font-sans text-[12px] text-text-muted">
          {formatDateTime(row.createdAt)}
        </span>
        <ChevronUp className="size-4 text-text-faint" aria-hidden />
      </div>

      {/* Body — three sections separated by thin column lines on lg+. */}
      <div className="mt-5 grid gap-6 lg:grid-cols-[1.2fr_1fr_1.2fr] lg:gap-0 lg:[&>*+*]:border-l lg:[&>*+*]:border-brand-cream-2/70 lg:[&>*+*]:pl-6 lg:[&>*:not(:last-child)]:pr-6">
        {/* ─── Parties ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          <SectionTitle>Parties</SectionTitle>
          <PartyBlock
            label="Sender"
            name={detail?.from.name ?? row.clientName}
            username={detail?.from.username ?? null}
            cinOrAccount={`CIN ${row.clientCin}`}
            bankCode={detail?.from.bankCode ?? row.sourceBankCode}
            accountNumber={detail?.from.accountNumber ?? null}
          />
          <PartyBlock
            label="Receiver"
            name={detail?.to.name ?? row.party ?? "—"}
            username={detail?.to.username ?? null}
            cinOrAccount={null}
            bankCode={detail?.to.bankCode ?? row.destBankCode}
            accountNumber={detail?.to.accountNumber ?? row.destAccountNumber}
          />
        </div>

        {/* ─── Money trail ────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          <SectionTitle>Money trail</SectionTitle>
          <div className="flex items-baseline gap-1.5">
            <span className="font-sans text-[28px] font-bold tabular-nums text-text-primary">
              {formatAmount(row.amount)}
            </span>
            <span className="font-sans text-[12px] font-semibold text-text-faint">TND</span>
          </div>
          <div className="flex items-center gap-2 font-sans text-[12px] text-text-muted">
            <BankAvatar code={row.sourceBankCode} size={20} />
            <span className="font-mono">{row.sourceBankCode}</span>
            <ArrowRight className="size-3.5 text-text-faint" aria-hidden />
            <BankAvatar code={row.destBankCode} size={20} />
            <span className="font-mono">{row.destBankCode}</span>
          </div>
          <KeyValue label="Motif" value={detail?.motif ?? null} />
          <KeyValue label="Reference" value={row.reference} mono />
        </div>

        {/* ─── Pipeline ───────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          <SectionTitle>Pipeline</SectionTitle>
          {error && (
            <p className="font-sans text-[12px] font-semibold text-negative">{error}</p>
          )}
          {!detail && !error && (
            <div className="flex items-center gap-2 font-sans text-[12px] text-text-muted">
              <Loader2 className="size-3 animate-spin" aria-hidden />
              Loading detail…
            </div>
          )}
          {detail && (
            <>
              <Timeline
                createdAt={detail.timeline.createdAt}
                otpConfirmedAt={detail.timeline.otpConfirmedAt}
                decidedAt={detail.timeline.decidedAt}
                settledAt={detail.timeline.settledAt}
              />
              {detail.ml.score != null && (
                <div className="mt-1 flex flex-col gap-1.5 rounded-lg bg-white/60 px-3 py-2 ring-1 ring-brand-cream-2/70">
                  <div className="flex items-center gap-2">
                    <span className="font-sans text-[10px] font-bold uppercase tracking-[1px] text-text-label">
                      ML decision
                    </span>
                    <RiskBadge level={detail.ml.level} />
                    {detail.ml.activeLayer && (
                      <span className="ml-auto font-sans text-[10px] font-bold uppercase tracking-[0.6px] text-text-faint">
                        {detail.ml.activeLayer}
                      </span>
                    )}
                  </div>
                  <span className="font-sans text-[12px] tabular-nums text-text-primary">
                    score{" "}
                    <span className="font-bold">
                      {Number(detail.ml.score).toFixed(3)}
                    </span>
                  </span>
                  {detail.ml.reasons.length > 0 && (
                    <ul className="ml-4 list-disc space-y-0.5 font-sans text-[11px] text-text-muted">
                      {detail.ml.reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ──────────────────────────────────────────────────── */

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <span className="font-sans text-[10px] font-bold uppercase tracking-[1.4px] text-brand-medium">
      {children}
    </span>
  );
}

function PartyBlock({
  label,
  name,
  username,
  cinOrAccount,
  bankCode,
  accountNumber,
}: {
  label: string;
  name: string;
  username: string | null;
  cinOrAccount: string | null;
  bankCode: string;
  accountNumber: string | null;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-sans text-[10px] font-bold uppercase tracking-[1px] text-text-label">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <BankAvatar code={bankCode} size={26} />
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate font-sans text-[13px] font-semibold text-text-primary">
            {name}
          </span>
          {username && (
            <span className="truncate font-mono text-[11px] text-text-muted">
              @{username}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-0.5 pl-[34px] font-sans text-[11px] text-text-muted">
        {cinOrAccount && <span>{cinOrAccount}</span>}
        {accountNumber && (
          <span className="font-mono">{formatAccountNumber(accountNumber)}</span>
        )}
        <span className="font-mono">{bankCode}</span>
      </div>
    </div>
  );
}

function KeyValue({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-sans text-[10px] font-bold uppercase tracking-[1px] text-text-label">
        {label}
      </span>
      <span
        className={[
          "text-[12px] text-text-primary",
          mono ? "font-mono" : "font-sans",
        ].join(" ")}
      >
        {value ?? "—"}
      </span>
    </div>
  );
}

function Timeline({
  createdAt,
  otpConfirmedAt,
  decidedAt,
  settledAt,
}: {
  createdAt: string;
  otpConfirmedAt: string | null;
  decidedAt: string | null;
  settledAt: string | null;
}) {
  // 4 phases — only renders the ones that have actually happened. Each step
  // shows a coloured dot if reached, or a hollow ring if not yet.
  const steps: Array<{ label: string; at: string | null }> = [
    { label: "Created", at: createdAt },
    { label: "OTP confirmed", at: otpConfirmedAt },
    { label: "Decided", at: decidedAt },
    { label: "Settled", at: settledAt },
  ];
  return (
    <div className="flex flex-col gap-2">
      {steps.map((s, i) => {
        const reached = !!s.at;
        return (
          <div key={i} className="flex items-start gap-2.5">
            <span
              className={[
                "mt-1 size-[8px] shrink-0 rounded-full",
                reached
                  ? "bg-brand-dark"
                  : "border border-brand-cream-2 bg-white",
              ].join(" ")}
              aria-hidden
            />
            <div className="flex min-w-0 flex-col leading-tight">
              <span
                className={[
                  "font-sans text-[11px] font-semibold",
                  reached ? "text-text-primary" : "text-text-faint",
                ].join(" ")}
              >
                {s.label}
              </span>
              <span className="font-sans text-[11px] text-text-muted">
                {reached ? formatDateTime(s.at) : "—"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
