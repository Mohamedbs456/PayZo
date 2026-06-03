import { useEffect, useState } from "react";
import { Inbox, Check, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime, formatRelative } from "@/features/transactions/format";
import { fetchThresholdReports, markReportRead, type ThresholdReport } from "../api";

interface ThresholdReportsCardProps {
  /** True for SuperAdmin (sees Mark-as-read action). False for Analyst (read-only history). */
  canMarkRead: boolean;
}

/**
 * Analyst-submitted threshold proposals. Lives on the right of the bottom
 * row in the ML page; the body scrolls internally if there are more
 * reports than fit, while the page chrome stays put.
 */
export function ThresholdReportsCard({ canMarkRead }: ThresholdReportsCardProps) {
  const { showToast } = useToast();
  const [reports, setReports] = useState<ThresholdReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchThresholdReports({ size: 20, signal: controller.signal })
      .then((page) => setReports(page.content))
      .catch((cause) => {
        if (controller.signal.aborted) return;
        console.error("[ml-config] threshold reports fetch failed", cause);
        setError(cause instanceof Error ? cause.message : "Failed to load");
      });
    return () => controller.abort();
  }, []);

  const handleMarkRead = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    try {
      const updated = await markReportRead(id);
      setReports((prev) =>
        prev ? prev.map((r) => (r.id === id ? updated : r)) : prev,
      );
      showToast({ tier: "success", message: "Report marked as read" });
    } catch (cause) {
      console.error("[ml-config] mark read failed", cause);
      showToast({
        tier: "danger",
        message: cause instanceof Error ? cause.message : "Action failed",
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-2xl bg-white p-5 shadow-[0_1px_2px_0_rgba(42,31,20,0.04),0_8px_24px_-6px_rgba(42,31,20,0.10)]">
      <div className="flex shrink-0 items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-lg bg-brand-cream-2/60">
          <Inbox className="size-4 text-brand-medium" aria-hidden />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="font-sans text-[14px] font-bold text-text-primary">
            Threshold proposals
          </span>
          <span className="font-sans text-[11px] text-text-muted">
            Analyst suggestions for the band cut-offs.
          </span>
        </div>
        {reports && reports.length > 0 && (
          <span className="ml-auto rounded-full bg-brand-cream-2/60 px-2.5 py-0.5 font-sans text-[11px] font-semibold text-text-primary">
            {reports.length}
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {reports === null && !error && (
          <div className="flex items-center gap-2 px-1 font-sans text-[12px] text-text-muted">
            <Loader2 className="size-3 animate-spin" aria-hidden />
            Loading proposals…
          </div>
        )}

        {error && (
          <p className="font-sans text-[12px] font-semibold text-negative">{error}</p>
        )}

        {reports && reports.length === 0 && (
          <p className="font-sans text-[12px] text-text-muted">No proposals yet.</p>
        )}

        {reports && reports.length > 0 && (
          <div className="flex flex-col divide-y divide-brand-cream-2/60">
            {reports.map((r) => (
              <ReportRow
                key={r.id}
                report={r}
                canMarkRead={canMarkRead}
                busy={busyId === r.id}
                onMarkRead={() => handleMarkRead(r.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReportRow({
  report,
  canMarkRead,
  busy,
  onMarkRead,
}: {
  report: ThresholdReport;
  canMarkRead: boolean;
  busy: boolean;
  onMarkRead: () => void;
}) {
  const isUnread = report.readAt === null;
  return (
    <div className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2">
        {isUnread && (
          <span className="size-[8px] shrink-0 rounded-full bg-brand-dark" aria-hidden />
        )}
        <span className="truncate font-sans text-[13px] font-semibold text-text-primary">
          {report.description}
        </span>
        <span className="ml-2 shrink-0 font-mono text-[11px] tabular-nums text-text-muted">
          {report.suggestedLowMedium} / {report.suggestedMediumHigh}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <span className="font-sans text-[11px] text-text-muted">
            {formatRelative(report.submittedAt)}
          </span>
          {canMarkRead && isUnread && (
            <button
              type="button"
              disabled={busy}
              onClick={onMarkRead}
              className="flex h-7 items-center gap-1 rounded-full bg-brand-cream-2/60 px-2.5 font-sans text-[11px] font-semibold text-text-primary transition-colors duration-150 hover:bg-brand-cream-2 disabled:opacity-50"
            >
              <Check className="size-3" aria-hidden />
              Mark read
            </button>
          )}
        </div>
      </div>
      <p className="font-sans text-[12px] leading-snug text-text-primary">
        {report.justification}
      </p>
      <div className="flex items-center gap-3 font-sans text-[11px] text-text-muted">
        <span>By {report.analystName}</span>
        {report.readAt && (
          <span className="text-text-faint">· read {formatDateTime(report.readAt)}</span>
        )}
      </div>
    </div>
  );
}
