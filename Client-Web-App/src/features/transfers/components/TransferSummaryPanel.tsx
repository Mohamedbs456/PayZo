import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";

export interface SummaryFields {
  /** TO row — recipient name + secondary line. Renders as a placeholder
   *  ("Pick a recipient") when both are empty. */
  toName?: string;
  toSecondary?: string;

  /** ACCOUNT row — usually "{recipient}'s default account" or a
   *  formatted bank/number for explicit account number. */
  accountTitle?: string;
  accountSecondary?: string;

  /** FROM row — source bank + masked number. */
  fromTitle?: string;
  fromSecondary?: string;

  /** AMOUNT row + optional motif line. */
  amount?: string;
  motif?: string;
}

interface TransferSummaryPanelProps {
  fields: SummaryFields;
  /** "Sending money" / "Moving money" header label. */
  headerEyebrow: string;
  headerTitle: string;
  headerSubtitle: string;

  /** Optional CTA at the bottom — only step 5 of the send-to-someone
   *  flow uses this; everywhere else the inline Next button drives nav. */
  cta?: {
    label: string;
    helperText?: string;
    onClick: () => void;
    disabled?: boolean;
    busy?: boolean;
  };

  /** Optional extra content between the body and the CTA — used by the
   *  internal-transfer page's "instant + free" callout. */
  bodyFooter?: ReactNode;

  /** Skip the ACCOUNT row + its divider. Used by the internal-transfer
   *  page where there's no "recipient's default account" concept. */
  hideAccountRow?: boolean;
}

/**
 * Right-rail summary card that updates live as the wizard progresses
 * (Figma 152:2 onwards). 380px fixed-width on desktop, takes the full
 * column width on mobile when the layout collapses.
 */
export function TransferSummaryPanel({
  fields,
  headerEyebrow,
  headerTitle,
  headerSubtitle,
  cta,
  bodyFooter,
  hideAccountRow,
}: TransferSummaryPanelProps) {
  return (
    <aside className="flex w-full max-w-[266px] flex-col overflow-hidden rounded-[16px] border border-border-soft bg-surface-card shadow-[0px_6px_6px_0px_rgba(0,0,0,0.18)] lg:self-start">
      {/* Header */}
      <header className="flex flex-col gap-1 px-4 pb-3 pt-4">
        <p
          className="font-sans text-[10px] font-bold uppercase tracking-[0.08em] text-text-secondary"
          style={{ fontVariationSettings: "'wdth' 100" }}
        >
          {headerEyebrow}
        </p>
        <h2 className="font-sans text-[16px] font-bold text-text-primary">
          {headerTitle}
        </h2>
        <p className="font-sans text-[11px] leading-[1.4] text-text-secondary">
          {headerSubtitle}
        </p>
      </header>

      <Divider />

      {/* Body — each row falls back to a muted "Pick X" placeholder. */}
      <div className="flex flex-col">
        <Row label="To">
          {fields.toName ? (
            <>
              <p className="font-sans text-[14px] font-bold text-text-primary">
                {fields.toName}
              </p>
              {fields.toSecondary && (
                <p className="font-sans text-[11px] text-text-secondary">
                  {fields.toSecondary}
                </p>
              )}
            </>
          ) : (
            <Placeholder>Pick a recipient</Placeholder>
          )}
        </Row>
        <Divider />

        {!hideAccountRow && (
          <>
            <Row label="Account">
              {fields.accountTitle ? (
                <>
                  <p className="font-sans text-[12px] font-semibold text-text-primary">
                    {fields.accountTitle}
                  </p>
                  {fields.accountSecondary && (
                    <p className="font-sans text-[11px] text-text-secondary">
                      {fields.accountSecondary}
                    </p>
                  )}
                </>
              ) : (
                <Placeholder>Default account</Placeholder>
              )}
            </Row>
            <Divider />
          </>
        )}

        <Row label="From">
          {fields.fromTitle ? (
            <>
              <p className="font-sans text-[12px] font-semibold text-text-primary">
                {fields.fromTitle}
              </p>
              {fields.fromSecondary && (
                <p className="font-sans text-[11px] text-text-secondary">
                  {fields.fromSecondary}
                </p>
              )}
            </>
          ) : (
            <Placeholder>Pick source account</Placeholder>
          )}
        </Row>
        <Divider />

        <Row label="Amount">
          <p
            className={cn(
              "font-sans text-[22px] font-bold leading-none",
              fields.amount ? "text-text-primary" : "text-text-muted",
            )}
          >
            {fields.amount ?? "0.000 TND"}
          </p>
          {fields.motif && (
            <p className="font-sans text-[11px] text-text-secondary">
              Motif: {fields.motif}
            </p>
          )}
        </Row>
      </div>

      {bodyFooter && (
        <>
          <Divider />
          <div className="px-4 py-3.5">{bodyFooter}</div>
        </>
      )}

      {/* Optional CTA */}
      {cta ? (
        <div className="flex flex-col gap-2 px-4 pb-4 pt-2">
          <button
            type="button"
            onClick={cta.onClick}
            disabled={cta.disabled || cta.busy}
            className="flex h-[46px] w-full items-center justify-center gap-1.5 rounded-[10px] bg-accent px-4 py-2.5 font-sans text-[14px] font-bold text-accent-foreground shadow-[0px_4px_12px_0px_rgba(0,0,0,0.18)] transition-all duration-150 ease-out hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cta.busy ? "Processing…" : cta.label}
            {!cta.busy && (
              <ArrowRight className="size-4" strokeWidth={2.4} aria-hidden />
            )}
          </button>
          {cta.helperText && (
            <p className="text-center font-sans text-[10px] text-text-muted">
              {cta.helperText}
            </p>
          )}
        </div>
      ) : (
        <div className="h-4" aria-hidden />
      )}
    </aside>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <p
        className="font-sans text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted"
        style={{ fontVariationSettings: "'wdth' 100" }}
      >
        {label}
      </p>
      {children}
    </div>
  );
}

function Placeholder({ children }: { children: ReactNode }) {
  return (
    <p className="font-sans text-[12px] text-text-muted">{children}</p>
  );
}

function Divider() {
  return <div aria-hidden className="h-px w-full bg-border-soft" />;
}
