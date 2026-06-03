import { Check, Mail, Smartphone } from "lucide-react";
import { cn } from "@/lib/cn";

export type OtpChannel = "EMAIL" | "SMS";

interface ChannelCardProps {
  channel: OtpChannel;
  /** Already-masked destination — e.g. "ahmed.benali@***.tn" or "+216 71 234 ***". */
  maskedValue: string;
  selected: boolean;
  onSelect: (channel: OtpChannel) => void;
  disabled?: boolean;
}

const COPY: Record<OtpChannel, { label: string; Icon: typeof Mail }> = {
  EMAIL: { label: "Email", Icon: Mail },
  SMS: { label: "SMS", Icon: Smartphone },
};

/**
 * One of two side-by-side selectable cards on the OTP-channel picker
 * (Figma node 77:95). Selected state: 2px accent border + accent-soft
 * fill + filled circular check; idle state: 1px default border on
 * surface-card.
 */
export function ChannelCard({
  channel,
  maskedValue,
  selected,
  onSelect,
  disabled = false,
}: ChannelCardProps) {
  const { label, Icon } = COPY[channel];
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={() => onSelect(channel)}
      className={cn(
        "flex flex-1 min-w-px flex-col items-start gap-2.5 overflow-hidden rounded-[12px] px-4 py-4 text-left transition-all duration-150 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-soft",
        "disabled:cursor-not-allowed disabled:opacity-60",
        selected
          ? "border-2 border-accent bg-accent-soft"
          : "border border-border bg-surface-card hover:bg-surface-soft",
      )}
    >
      <div className="flex items-center gap-2.5">
        <Icon
          className="size-[22px] text-text-primary"
          strokeWidth={1.6}
          aria-hidden
        />
        <span className="font-sans text-[14px] font-semibold text-text-primary">
          {label}
        </span>
        {selected && (
          <span className="flex size-[18px] items-center justify-center rounded-full bg-accent">
            <Check
              className="size-3 text-accent-foreground"
              strokeWidth={3}
              aria-hidden
            />
          </span>
        )}
      </div>
      <span className="font-mono text-[12px] text-text-muted">
        {maskedValue}
      </span>
    </button>
  );
}
