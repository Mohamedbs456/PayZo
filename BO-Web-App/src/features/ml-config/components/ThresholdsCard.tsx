import { useState, type ReactNode } from "react";
import { Save, Send, SlidersHorizontal } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  submitThresholdReport,
  updateThresholds,
  type MlConfig,
} from "../api";

interface ThresholdsCardProps {
  config: MlConfig;
  /** True for SuperAdmin (write directly). False for Analyst (proposes via report). */
  canEdit: boolean;
  onSaved: (next: { thresholdLowMedium: string; thresholdMediumHigh: string }) => void;
}

/**
 * SuperAdmin edits the band cut-offs by either dragging the two handles on
 * the tri-color bar or typing exact numbers — both inputs are bound to the
 * same state. Analyst sees the same controls but submits a proposal report
 * (description + justification required).
 *
 * Constraint `0 < low < high < 1` is enforced before Save / Submit enables.
 */
export function ThresholdsCard({ config, canEdit, onSaved }: ThresholdsCardProps) {
  const { showToast } = useToast();

  const [low, setLow] = useState<string>(config.thresholdLowMedium);
  const [high, setHigh] = useState<string>(config.thresholdMediumHigh);
  const [description, setDescription] = useState("");
  const [justification, setJustification] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const lowNum = Number(low);
  const highNum = Number(high);
  const isValidNumbers =
    !Number.isNaN(lowNum) &&
    !Number.isNaN(highNum) &&
    lowNum > 0 &&
    highNum < 1 &&
    lowNum < highNum;

  const dirty =
    low !== config.thresholdLowMedium || high !== config.thresholdMediumHigh;

  const canSubmit = canEdit
    ? isValidNumbers && dirty
    : isValidNumbers && dirty && description.trim() !== "" && justification.trim() !== "";

  // When the slider drags low past high (or vice versa), nudge the other
  // handle so we never end up with low >= high.
  const handleLowChange = (next: string) => {
    setLow(next);
    const n = Number(next);
    const h = Number(high);
    if (!Number.isNaN(n) && !Number.isNaN(h) && n >= h) {
      setHigh(Math.min(0.99, n + 0.01).toFixed(2));
    }
  };
  const handleHighChange = (next: string) => {
    setHigh(next);
    const n = Number(next);
    const l = Number(low);
    if (!Number.isNaN(n) && !Number.isNaN(l) && n <= l) {
      setLow(Math.max(0.01, n - 0.01).toFixed(2));
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    try {
      if (canEdit) {
        await updateThresholds({ thresholdLowMedium: low, thresholdMediumHigh: high });
        onSaved({ thresholdLowMedium: low, thresholdMediumHigh: high });
        showToast({ tier: "success", message: "Thresholds updated" });
      } else {
        await submitThresholdReport({
          suggestedLowMedium: low,
          suggestedMediumHigh: high,
          description: description.trim(),
          justification: justification.trim(),
        });
        showToast({
          tier: "success",
          message: "Threshold report submitted to SuperAdmin",
        });
        setDescription("");
        setJustification("");
      }
      setConfirm(false);
    } catch (cause) {
      console.error("[ml-config] threshold submit failed", cause);
      showToast({
        tier: "danger",
        message: cause instanceof Error ? cause.message : "Save failed",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-2xl bg-white p-5 shadow-[0_1px_2px_0_rgba(42,31,20,0.04),0_8px_24px_-6px_rgba(42,31,20,0.10)]">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-lg bg-brand-cream-2/60">
          <SlidersHorizontal className="size-4 text-brand-medium" aria-hidden />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="font-sans text-[14px] font-bold text-text-primary">
            Risk thresholds
          </span>
          <span className="font-sans text-[11px] text-text-muted">
            {canEdit
              ? "Drag the handles or type the exact value."
              : "Propose values — SuperAdmin reviews before applying."}
          </span>
        </div>
      </div>

      {/* SA gets the tri-color slider with two draggable handles for fast
          tuning. Analyst proposals are typed-only — no slider — to make the
          act feel deliberate (you're suggesting a value for review, not
          dragging to one). */}
      {canEdit && (
        <div className="flex shrink-0 flex-col gap-3 rounded-xl bg-brand-cream/40 p-4 ring-1 ring-inset ring-brand-cream-2/70">
          <DualSlider
            low={lowNum}
            high={highNum}
            onLowChange={(v) => handleLowChange(v.toFixed(2))}
            onHighChange={(v) => handleHighChange(v.toFixed(2))}
          />
          <BandLabels />
        </div>
      )}

      {/* Analyst gets a compact read-only strip of the live values so they
          know what they're proposing to change. SA gets the same info via
          the slider position above. */}
      {!canEdit && (
        <div className="flex shrink-0 items-center gap-3 rounded-xl bg-brand-cream/40 px-4 py-3 ring-1 ring-inset ring-brand-cream-2/70">
          <span className="font-sans text-[10px] font-bold uppercase tracking-[1px] text-text-label">
            Current
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[12px] tabular-nums text-text-primary">
            <span className="text-positive">LOW</span>
            <span className="text-text-faint">→</span>
            <span className="text-[#cf821a]">MED</span>
            <span className="rounded bg-white px-1.5 py-0.5 font-bold">
              {config.thresholdLowMedium}
            </span>
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[12px] tabular-nums text-text-primary">
            <span className="text-[#cf821a]">MED</span>
            <span className="text-text-faint">→</span>
            <span className="text-negative">HIGH</span>
            <span className="rounded bg-white px-1.5 py-0.5 font-bold">
              {config.thresholdMediumHigh}
            </span>
          </span>
        </div>
      )}

      {/* Number inputs — one row, side by side */}
      <div className="grid shrink-0 grid-cols-2 gap-3">
        <Field label="Low → Medium" hue="text-[#cf821a]">
          <NumberInput value={low} onChange={handleLowChange} />
        </Field>
        <Field label="Medium → High" hue="text-negative">
          <NumberInput value={high} onChange={handleHighChange} />
        </Field>
      </div>

      {!isValidNumbers && (
        <p className="shrink-0 font-sans text-[11px] font-semibold text-negative">
          Values must satisfy 0 &lt; low &lt; high &lt; 1.
        </p>
      )}

      {!canEdit && (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <Field label="Title">
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="One-line summary"
              className="rounded-lg border border-brand-cream-2 bg-white px-3 py-2 font-sans text-[12px] text-text-primary placeholder:text-text-faint focus:border-brand-dark focus:outline-none"
            />
          </Field>
          <Field label="Justification">
            <textarea
              rows={3}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Why these values?"
              className="min-h-0 flex-1 resize-none rounded-lg border border-brand-cream-2 bg-white px-3 py-2 font-sans text-[12px] text-text-primary placeholder:text-text-faint focus:border-brand-dark focus:outline-none"
            />
          </Field>
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto flex shrink-0 items-center justify-end gap-2 pt-1">
        {canEdit && dirty && (
          <button
            type="button"
            onClick={() => {
              setLow(config.thresholdLowMedium);
              setHigh(config.thresholdMediumHigh);
            }}
            className="flex h-9 items-center rounded-full px-3.5 font-sans text-[12px] font-semibold text-text-muted transition-colors duration-150 hover:bg-brand-cream/40"
          >
            Reset
          </button>
        )}
        <button
          type="button"
          disabled={!canSubmit || busy}
          onClick={() => setConfirm(true)}
          className="flex h-9 items-center gap-1.5 rounded-full bg-brand-dark px-4 font-sans text-[12px] font-semibold text-brand-cream transition-all duration-150 ease-out enabled:hover:scale-[1.02] enabled:hover:bg-brand-dark/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {canEdit ? <Save className="size-3.5" aria-hidden /> : <Send className="size-3.5" aria-hidden />}
          {canEdit ? "Save thresholds" : "Submit proposal"}
        </button>
      </div>

      <ConfirmDialog
        open={confirm}
        variant={canEdit ? "warning" : "primary"}
        title={canEdit ? "Apply new thresholds?" : "Submit threshold proposal?"}
        message={
          canEdit
            ? `New transfers will use ${low} / ${high} for risk banding starting now. Existing alerts are unaffected.`
            : "Your proposal will be sent to the SuperAdmin for review."
        }
        confirmLabel={canEdit ? "Apply now" : "Submit"}
        busy={busy}
        onConfirm={handleSubmit}
        onCancel={() => {
          if (busy) return;
          setConfirm(false);
        }}
      />
    </div>
  );
}

/* ─── Sub-components ──────────────────────────────────────────────────── */

function Field({
  label,
  hue,
  children,
}: {
  label: string;
  hue?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className={[
          "font-sans text-[10px] font-bold uppercase tracking-[1px]",
          hue ?? "text-text-label",
        ].join(" ")}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="number"
      step="0.01"
      min={0.01}
      max={0.99}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-brand-cream-2 bg-white px-3 py-2 font-mono text-[13px] tabular-nums text-text-primary focus:border-brand-dark focus:outline-none"
    />
  );
}

function BandLabels() {
  return (
    <div className="flex items-center justify-between font-sans text-[10px] font-bold uppercase tracking-[1px]">
      <span className="text-positive">Low</span>
      <span className="text-[#cf821a]">Medium</span>
      <span className="text-negative">High</span>
    </div>
  );
}

/**
 * Two-handle range slider built from two stacked native `<input type="range">`
 * elements over a custom-painted tri-color track. We keep the natives so
 * we get free keyboard handling + accessibility — the visual chrome is
 * just CSS.
 */
function DualSlider({
  low,
  high,
  onLowChange,
  onHighChange,
}: {
  low: number;
  high: number;
  onLowChange: (v: number) => void;
  onHighChange: (v: number) => void;
}) {
  // Coerce to 0..1 for paint without breaking the inputs themselves.
  const lp = Math.max(0, Math.min(1, low)) * 100;
  const hp = Math.max(0, Math.min(1, high)) * 100;
  const safeHp = Math.max(hp, lp + 0.5);

  return (
    <div className="relative h-9">
      {/* Painted track */}
      <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-brand-cream-2/80">
        <span className="absolute inset-y-0 left-0 bg-positive" style={{ width: `${lp}%` }} />
        <span
          className="absolute inset-y-0 bg-[#cf821a]"
          style={{ left: `${lp}%`, width: `${safeHp - lp}%` }}
        />
        <span className="absolute inset-y-0 bg-negative" style={{ left: `${safeHp}%`, right: 0 }} />
      </div>

      {/* Two thumbs — both inputs span the full track; pointer-events tweak
          ensures the right one wins when handles overlap. */}
      <RangeThumb
        value={low}
        max={Math.max(0.01, high - 0.01)}
        onChange={onLowChange}
        ariaLabel="Low to medium threshold"
      />
      <RangeThumb
        value={high}
        min={Math.min(0.99, low + 0.01)}
        onChange={onHighChange}
        ariaLabel="Medium to high threshold"
      />
    </div>
  );
}

function RangeThumb({
  value,
  min = 0.01,
  max = 0.99,
  onChange,
  ariaLabel,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
  ariaLabel: string;
}) {
  return (
    <input
      type="range"
      min={0.01}
      max={0.99}
      step={0.01}
      value={Number.isNaN(value) ? min : Math.min(max, Math.max(min, value))}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label={ariaLabel}
      className="threshold-thumb absolute inset-x-0 top-0 h-9 w-full cursor-pointer appearance-none bg-transparent"
    />
  );
}
