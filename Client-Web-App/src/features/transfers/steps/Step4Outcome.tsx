import { CheckCircle2, Plus, Home } from "lucide-react";

interface Step4OutcomeProps {
  recipientName: string;
  amountLabel: string;
  onSendAnother: () => void;
  onDone: () => void;
}

/**
 * Step 4 — Outcome screen shown after a successful OTP confirmation.
 *
 * The backend kicks off ML scoring asynchronously, so the decision
 * (LOW / MED / HIGH) isn't known at the moment OTP confirm returns —
 * MED/HIGH outcomes surface later in the user's notifications and
 * transactions list, not here. This screen just acknowledges that the
 * transfer was authorized and gives the user two next moves.
 */
export function Step4Outcome({
  recipientName,
  amountLabel,
  onSendAnother,
  onDone,
}: Step4OutcomeProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-10 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-positive-soft">
        <CheckCircle2
          className="size-9 text-positive"
          strokeWidth={2}
          aria-hidden
        />
      </span>

      <div className="flex flex-col gap-2">
        <h2 className="font-sans text-[22px] font-bold text-text-primary">
          Transfer authorized
        </h2>
        <p className="max-w-md font-sans text-[14px] leading-[1.6] text-text-secondary">
          You sent{" "}
          <span className="font-semibold text-text-primary">{amountLabel}</span>{" "}
          to{" "}
          <span className="font-semibold text-text-primary">
            {recipientName}
          </span>
          . If our fraud checks flag anything unusual, we'll let you know in
          your notifications before the money clears.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onSendAnother}
          className="flex h-11 items-center gap-1.5 rounded-[10px] bg-surface-raised pl-4 pr-5 font-sans text-[14px] font-semibold text-text-secondary transition-colors duration-150 ease-out hover:bg-surface-soft"
        >
          <Plus className="size-4" strokeWidth={2.4} aria-hidden />
          Send another
        </button>
        <button
          type="button"
          onClick={onDone}
          className="flex h-11 items-center gap-1.5 rounded-[10px] bg-text-primary pl-5 pr-6 font-sans text-[14px] font-bold text-text-on-inverse transition-all duration-150 ease-out hover:bg-text-primary/90"
        >
          <Home className="size-4" strokeWidth={2.4} aria-hidden />
          Done
        </button>
      </div>
    </div>
  );
}
