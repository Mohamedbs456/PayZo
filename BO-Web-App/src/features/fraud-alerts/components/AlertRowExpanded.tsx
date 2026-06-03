import { useState, type ReactNode } from "react";
import { ArrowRight, Check, ChevronUp, X } from "lucide-react";
import { BankAvatar } from "@/features/banks/components/BankAvatar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { TransactionStatusPill } from "@/features/transactions/components/TransactionStatusPill";
import { RiskBadge } from "@/features/transactions/components/RiskBadge";
import { formatAmount, formatDateTime, formatRelative } from "@/features/transactions/format";
import { approveAlert, rejectAlert, type FraudAlert } from "../api";
import { AlertStatusPill } from "./AlertStatusPill";

interface AlertRowExpandedProps {
  alert: FraudAlert;
  onCollapse: () => void;
  /** Patch the parent list with the new server state after a decide-action. */
  onDecided: (updated: Partial<FraudAlert>) => void;
}

/**
 * Expanded fraud-alert panel (D33). Three sections separated by hairlines on
 * lg+: ML reasons + score, Transaction snapshot, and the Decision panel
 * (Approve = not fraud / Reject = confirmed fraud).
 *
 * Approve uses the `positive` ConfirmDialog variant; Reject uses `danger`.
 * Reject requires a non-blank comment (backend enforces) so the modal swaps
 * its message for a textarea before submitting.
 */
export function AlertRowExpanded({ alert, onCollapse, onDecided }: AlertRowExpandedProps) {
  const { showToast } = useToast();
  const [confirm, setConfirm] = useState<"approve" | "reject" | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const isPending = alert.status === "PENDING";

  const submitDecision = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (confirm === "approve") {
        await approveAlert(alert.id, comment);
        onDecided({
          status: "VALIDATED",
          analystComment: comment.trim() || null,
          decidedAt: new Date().toISOString(),
        });
        showToast({ tier: "success", message: "Alert approved — transfer executed" });
      } else if (confirm === "reject") {
        if (!comment.trim()) {
          showToast({
            tier: "danger",
            message: "A comment is required when confirming fraud.",
          });
          setBusy(false);
          return;
        }
        await rejectAlert(alert.id, comment);
        onDecided({
          status: "REJECTED",
          analystComment: comment.trim(),
          decidedAt: new Date().toISOString(),
        });
        showToast({ tier: "success", message: "Marked as fraud — transfer cancelled" });
      }
      setConfirm(null);
      setComment("");
    } catch (cause) {
      console.error("[fraud-alerts] decide failed", cause);
      showToast({
        tier: "danger",
        message: cause instanceof Error ? cause.message : "Decision failed",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="animate-row-fade-in border-b border-brand-cream-2/60 bg-brand-cream/55 px-6 py-5">
      {/* Header — collapse on click */}
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
          {alert.transactionReference}
        </span>
        <RiskBadge level={alert.riskLevel} />
        <AlertStatusPill status={alert.status} />
        <div className="min-w-0 flex-1" />
        <span className="font-sans text-[12px] text-text-muted">
          {formatRelative(alert.createdAt)}
        </span>
        <ChevronUp className="size-4 text-text-faint" aria-hidden />
      </div>

      {/* Body — three sections */}
      <div className="mt-5 grid gap-6 lg:grid-cols-[1.2fr_1fr_1.3fr] lg:gap-0 lg:[&>*+*]:border-l lg:[&>*+*]:border-brand-cream-2/70 lg:[&>*+*]:pl-6 lg:[&>*:not(:last-child)]:pr-6">
        {/* ─── Why flagged ───────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          <SectionTitle>Why flagged</SectionTitle>
          {alert.riskScore != null && (
            <div className="flex items-baseline gap-2">
              <span className="font-sans text-[10px] font-bold uppercase tracking-[1px] text-text-label">
                Score
              </span>
              <span className="font-sans text-[18px] font-bold tabular-nums text-text-primary">
                {Number(alert.riskScore).toFixed(3)}
              </span>
              <RiskBadge level={alert.riskLevel} />
            </div>
          )}
          {alert.mlReasons.length > 0 ? (
            <ul className="ml-4 list-disc space-y-1 font-sans text-[12px] text-text-primary">
              {alert.mlReasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          ) : (
            <p className="font-sans text-[12px] text-text-muted">
              No ML reasons captured.
            </p>
          )}
        </div>

        {/* ─── Transaction ───────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          <SectionTitle>Transaction</SectionTitle>
          <div className="flex items-baseline gap-1.5">
            <span className="font-sans text-[24px] font-bold tabular-nums text-text-primary">
              {formatAmount(alert.amount)}
            </span>
            <span className="font-sans text-[12px] font-semibold text-text-faint">TND</span>
          </div>
          <div className="flex items-center gap-2 font-sans text-[12px] text-text-muted">
            <BankAvatar code={alert.sourceBankCode} size={20} />
            <span className="font-mono">{alert.sourceBankCode}</span>
            <ArrowRight className="size-3.5 text-text-faint" aria-hidden />
            <BankAvatar code={alert.destBankCode} size={20} />
            <span className="font-mono">{alert.destBankCode}</span>
          </div>
          <div className="flex flex-col gap-0.5 font-sans text-[11px] text-text-muted">
            <span className="font-semibold uppercase tracking-[0.6px] text-text-label">
              Sender
            </span>
            <span className="font-sans text-[12px] text-text-primary">{alert.clientName}</span>
            <span className="font-mono">CIN {alert.clientCin}</span>
          </div>
          <TransactionStatusPill status="SUSPENDED_PENDING_ANALYST" />
        </div>

        {/* ─── Decision ──────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          <SectionTitle>Decision</SectionTitle>
          {!isPending ? (
            <DecisionResult alert={alert} />
          ) : (
            <>
              <p className="font-sans text-[12px] text-text-muted">
                Approve if this looks legitimate. Confirming fraud cancels the
                transfer and lowers the receiver's trust score.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setComment("");
                    setConfirm("approve");
                  }}
                  className="flex h-9 items-center gap-1.5 rounded-full bg-positive px-3.5 font-sans text-[12px] font-semibold text-white shadow-[0_4px_12px_rgba(51,204,140,0.30)] transition-all duration-150 ease-out hover:scale-[1.02] hover:bg-positive/90"
                >
                  <Check className="size-3.5" aria-hidden />
                  Not fraud
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setComment("");
                    setConfirm("reject");
                  }}
                  className="flex h-9 items-center gap-1.5 rounded-full bg-negative px-3.5 font-sans text-[12px] font-semibold text-white shadow-[0_4px_12px_rgba(240,97,97,0.30)] transition-all duration-150 ease-out hover:scale-[1.02] hover:bg-negative/90"
                >
                  <X className="size-3.5" aria-hidden />
                  Confirm fraud
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ─── Confirm dialog (shared frame for Approve and Reject) ── */}
      <ConfirmDialog
        open={confirm !== null}
        variant={confirm === "reject" ? "danger" : "positive"}
        title={
          confirm === "reject"
            ? "Confirm fraud"
            : "Approve as not fraud"
        }
        confirmLabel={
          confirm === "reject" ? "Confirm fraud" : "Approve & execute"
        }
        message={
          <div className="flex flex-col gap-2">
            <p>
              {confirm === "reject"
                ? "The transfer will be cancelled and the receiver's trust score reduced. A reason is required."
                : "The suspended transfer will resume and CBS will execute it. You can leave a note for audit."}
            </p>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={
                confirm === "reject"
                  ? "Required — what makes this fraudulent?"
                  : "Optional note"
              }
              rows={3}
              maxLength={2000}
              className="resize-none rounded-lg border border-brand-cream-2 bg-white px-3 py-2 font-sans text-[12px] text-text-primary placeholder:text-text-faint focus:border-brand-dark focus:outline-none"
            />
          </div>
        }
        busy={busy}
        onConfirm={submitDecision}
        onCancel={() => {
          if (busy) return;
          setConfirm(null);
          setComment("");
        }}
      />
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

function DecisionResult({ alert }: { alert: FraudAlert }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <AlertStatusPill status={alert.status} />
        {alert.trustDelta != null && (
          <span
            className={[
              "font-sans text-[11px] font-bold tabular-nums",
              alert.trustDelta < 0 ? "text-negative" : "text-positive",
            ].join(" ")}
          >
            trust {alert.trustDelta > 0 ? "+" : ""}
            {alert.trustDelta}
          </span>
        )}
      </div>
      {alert.analystName && (
        <div className="flex flex-col gap-0.5 font-sans text-[11px] text-text-muted">
          <span className="font-semibold uppercase tracking-[0.6px] text-text-label">
            Decided by
          </span>
          <span className="font-sans text-[12px] text-text-primary">
            {alert.analystName}
          </span>
          {alert.decidedAt && <span>{formatDateTime(alert.decidedAt)}</span>}
        </div>
      )}
      {alert.analystComment && (
        <div className="flex flex-col gap-0.5">
          <span className="font-sans text-[10px] font-bold uppercase tracking-[1px] text-text-label">
            Comment
          </span>
          <p className="rounded-lg bg-white/60 px-3 py-2 font-sans text-[12px] text-text-primary ring-1 ring-brand-cream-2/70">
            {alert.analystComment}
          </p>
        </div>
      )}
    </div>
  );
}
