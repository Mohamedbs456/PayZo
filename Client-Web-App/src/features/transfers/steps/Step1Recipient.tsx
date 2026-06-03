import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type MouseEvent,
} from "react";
import {
  ArrowRight,
  AtSign,
  Check,
  Loader2,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/api";
import { isDemoMode } from "@/lib/demoMode";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  formatRibDisplay,
  formatRibInputLive,
  isValidRib,
  normalizeRib,
} from "@/lib/rib";
import {
  type RibResolveResponse,
  type UsernameResolveResponse,
  resolveRib,
  resolveUsername,
  verifyName,
} from "@/features/transfers/api";
import {
  type BeneficiaryResponse,
  deleteBeneficiary,
  listBeneficiaries,
  toggleBeneficiaryFavorite,
} from "@/features/transfers/beneficiariesApi";
import { FavoritesBubbles } from "@/features/beneficiaries/components/FavoritesBubbles";
import { RecipientConfirmationCard } from "@/features/transfers/components/RecipientConfirmationCard";

/* ─── Demo data ────────────────────────────────────────────────────────── */
// Valid 20-digit Tunisian RIBs (mod-97=0) so the demo flow exercises the
// real client-side validation path.

const DEMO_RESOLVED: RibResolveResponse = {
  bankCode: "BIAT",
  bankName: "Banque Internationale Arabe de Tunisie",
  bankNumericCode: "08",
  firstNameMasked: "S****",
  lastNameMasked: "M*******",
  isPayZoUser: true,
};

const DEMO_USERNAME_RESOLVED: UsernameResolveResponse = {
  username: "hamza.trabelsi",
  firstName: "Hamza",
  lastName: "Trabelsi",
  profilePictureUrl: null,
  trustScore: 78,
  accountNumberMasked: "08 001 ************* 79",
  bankCode: "BIAT",
  bankName: "Banque Internationale Arabe de Tunisie",
};

const DEMO_BENEFICIARIES: BeneficiaryResponse[] = [
  {
    id: "b-1",
    accountNumber: "08001000000000000079",
    displayName: "Sis",
    nickname: "Sis",
    bankCode: "BIAT",
    favorite: true,
    transferCount: 7,
    confirmedAt: new Date(Date.now() - 30 * 86400 * 1000).toISOString(),
    lastUsedAt: new Date(Date.now() - 2 * 86400 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 30 * 86400 * 1000).toISOString(),
    initials: "SM",
  },
  {
    id: "b-2",
    accountNumber: "10001000000000000017",
    displayName: "Karim Bouaziz",
    nickname: null,
    bankCode: "STB",
    favorite: false,
    transferCount: 2,
    confirmedAt: new Date(Date.now() - 14 * 86400 * 1000).toISOString(),
    lastUsedAt: new Date(Date.now() - 9 * 86400 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 14 * 86400 * 1000).toISOString(),
    initials: "KB",
  },
];

/* ─── Props ────────────────────────────────────────────────────────────── */

export interface Step1RecipientSelection {
  rib: string;                        // normalized 20 digits
  firstName: string;                  // sender-typed; backend re-verifies
  lastName: string;
  saveBeneficiary: boolean;
  beneficiaryNickname: string;        // "" when not saving
  resolved: RibResolveResponse;       // bank + masked names
}

export interface Step1UsernameSelection {
  username: string;
  resolved: UsernameResolveResponse;
}

interface Step1RecipientProps {
  initial: {
    rib: string;
    firstName: string;
    lastName: string;
    saveBeneficiary: boolean;
    beneficiaryNickname: string;
  };
  busy: boolean;
  onContinueManual: (sel: Step1RecipientSelection) => void;
  onContinueFromSaved: (b: BeneficiaryResponse) => void;
  onContinueFromUsername: (sel: Step1UsernameSelection) => void;
}

type Tab = "username" | "saved" | "rib";

/* ─── Component ────────────────────────────────────────────────────────── */

/**
 * Step 1 — pick a recipient (D53: 3-tab segmented control).
 *
 * Tabs (left → right): `@username` · `Saved` · `RIB`.
 *
 * Default tab on entry, in priority order:
 *   1. `@username` — if localStorage flag `payzo.lastSendMethod === "username"`.
 *   2. `Saved`     — else if the client has ≥1 beneficiary.
 *   3. `RIB`       — else.
 *
 * Username path: single input → `POST /transfers/resolve-username` →
 * confirmation card (avatar + name + trust score + 2 buttons). On
 * confirm, hands the resolved username up to the flow; the actual POST
 * to `/transfers` happens at Step 2.
 *
 * Saved + RIB paths are unchanged from Phase 1.
 */
export function Step1Recipient({
  initial,
  busy,
  onContinueManual,
  onContinueFromSaved,
  onContinueFromUsername,
}: Step1RecipientProps) {
  const toast = useToast();
  const demo = isDemoMode();

  // RIB is the always-default landing tab. The user can switch to
  // `@username` or `Saved` explicitly.
  const [tab, setTab] = useState<Tab>("rib");

  return (
    <div className="flex flex-1 flex-col gap-5">
      <h2 className="font-sans text-[15px] font-semibold text-text-primary">
        Who are you sending to?
      </h2>
      <TabSwitcher tab={tab} onChange={setTab} />
      {tab === "username" && (
        <UsernameTab
          busy={busy}
          demo={demo}
          onContinue={onContinueFromUsername}
        />
      )}
      {tab === "rib" && (
        <NewRecipientTab
          initial={initial}
          busy={busy}
          demo={demo}
          onContinue={onContinueManual}
          onToast={toast.showToast}
        />
      )}
      {tab === "saved" && (
        <SavedBeneficiariesTab
          demo={demo}
          busy={busy}
          onChoose={onContinueFromSaved}
          onToast={toast.showToast}
        />
      )}
    </div>
  );
}

/* ─── Tab switcher ─────────────────────────────────────────────────────── */

function TabSwitcher({
  tab,
  onChange,
}: {
  tab: Tab;
  onChange: (t: Tab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Recipient source"
      className="inline-flex self-start rounded-[12px] bg-surface-raised p-1"
    >
      <TabButton
        active={tab === "rib"}
        onClick={() => onChange("rib")}
        label="RIB"
      />
      <TabButton
        active={tab === "username"}
        onClick={() => onChange("username")}
        label="@username"
      />
      <TabButton
        active={tab === "saved"}
        onClick={() => onChange("saved")}
        label="Saved"
      />
    </div>
  );
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "h-9 rounded-[8px] px-4 font-sans text-[13px] font-semibold transition-colors duration-150 ease-out",
        active
          ? "bg-surface-card text-text-primary shadow-[0px_2px_6px_0px_rgba(14,27,44,0.08)]"
          : "text-text-muted hover:text-text-primary",
      )}
    >
      {label}
    </button>
  );
}

/* ─── @username tab ────────────────────────────────────────────────────── */

interface UsernameTabState {
  input: string;
  resolving: boolean;
  resolved: UsernameResolveResponse | null;
  error: string | null;
}

function UsernameTab({
  busy,
  demo,
  onContinue,
}: {
  busy: boolean;
  demo: boolean;
  onContinue: (sel: Step1UsernameSelection) => void;
}) {
  const [s, setS] = useState<UsernameTabState>({
    input: "",
    resolving: false,
    resolved: null,
    error: null,
  });
  const seq = useRef(0);

  function update(patch: Partial<UsernameTabState>) {
    setS((prev) => ({ ...prev, ...patch }));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (s.resolving || busy) return;
    const trimmed = s.input.trim().replace(/^@+/, "");
    if (!trimmed) return;

    const mySeq = ++seq.current;
    update({ resolving: true, error: null, resolved: null });
    try {
      const res = demo
        ? { ...DEMO_USERNAME_RESOLVED, username: trimmed }
        : await resolveUsername(trimmed);
      if (seq.current !== mySeq) return;
      update({ resolving: false, resolved: res, error: null });
    } catch (err) {
      if (seq.current !== mySeq) return;
      update({
        resolving: false,
        resolved: null,
        error: usernameResolveErrorMessage(err),
      });
    }
  }

  function handleReject() {
    update({ resolved: null, error: null });
  }

  function handleConfirm() {
    if (!s.resolved) return;
    onContinue({ username: s.resolved.username, resolved: s.resolved });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      {!s.resolved && (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-2">
          <label
            htmlFor="recipient-username"
            className="font-sans text-[11px] font-bold uppercase tracking-[0.06em] text-text-secondary"
          >
            PayZo username
          </label>
          <div
            className={cn(
              "flex h-[60px] items-center gap-2 rounded-xl border bg-surface-card px-4 transition-colors duration-150 ease-out focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15",
              s.error ? "border-negative" : "border-border",
            )}
          >
            <AtSign
              className="size-4 shrink-0 text-text-muted"
              strokeWidth={2.4}
              aria-hidden
            />
            <input
              id="recipient-username"
              type="text"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              value={s.input}
              onChange={(e) =>
                update({
                  input: e.target.value,
                  error: s.error ? null : s.error,
                })
              }
              placeholder="username"
              className="min-w-0 flex-1 bg-transparent font-sans text-[16px] text-text-primary outline-none placeholder:text-text-muted"
              disabled={busy || s.resolving}
            />
            <button
              type="submit"
              disabled={busy || s.resolving || !s.input.trim()}
              className="flex h-10 items-center gap-1.5 rounded-[10px] bg-text-primary px-4 font-sans text-[13px] font-semibold text-text-on-inverse transition-all duration-150 ease-out hover:bg-text-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {s.resolving ? (
                <Loader2
                  className="size-4 animate-spin"
                  strokeWidth={2.4}
                  aria-hidden
                />
              ) : (
                <>
                  Find
                  <ArrowRight
                    className="size-4"
                    strokeWidth={2.4}
                    aria-hidden
                  />
                </>
              )}
            </button>
          </div>
          {s.error && (
            <p role="alert" className="font-sans text-[12px] text-negative">
              {s.error}
            </p>
          )}
        </form>
      )}

      {s.resolved && (
        <RecipientConfirmationCard
          firstName={s.resolved.firstName}
          lastName={s.resolved.lastName}
          profilePictureUrl={s.resolved.profilePictureUrl}
          trustScore={s.resolved.trustScore}
          busy={busy}
          onConfirm={handleConfirm}
          onReject={handleReject}
        />
      )}
    </div>
  );
}

function usernameResolveErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return "Something went wrong";
  switch (err.errorCode) {
    case "RESOURCE_NOT_FOUND":
      return "No PayZo user with this username";
    case "CANNOT_TRANSFER_TO_SELF":
      return "That's you";
    case "RECIPIENT_NO_DEFAULT_ACCOUNT":
      return "Recipient has no default account";
    case "BANK_NOT_REGISTERED":
    case "BANK_INACTIVE":
      return "Bank not supported";
    case "RESOLVE_USERNAME_RATE_LIMIT":
      return "Too many tries — wait an hour";
    default:
      return "Something went wrong";
  }
}

/* ─── New recipient (RIB) tab ──────────────────────────────────────────── */

interface NewTabState {
  ribInput: string;
  ribError: string | null;
  resolved: RibResolveResponse | null;
  resolving: boolean;
  firstName: string;
  lastName: string;
  nameStatus: "idle" | "verifying" | "matched" | "mismatch" | "blocked";
  attemptsRemaining: number | null;
  saveBeneficiary: boolean;
  nickname: string;
}

function NewRecipientTab({
  initial,
  busy,
  demo,
  onContinue,
  onToast,
}: {
  initial: Step1RecipientProps["initial"];
  busy: boolean;
  demo: boolean;
  onContinue: (sel: Step1RecipientSelection) => void;
  onToast: ReturnType<typeof useToast>["showToast"];
}) {
  const [s, setS] = useState<NewTabState>(() => ({
    ribInput: initial.rib ? formatRibInputLive(initial.rib) : "",
    ribError: null,
    resolved: null,
    resolving: false,
    firstName: initial.firstName,
    lastName: initial.lastName,
    nameStatus: "idle",
    attemptsRemaining: null,
    saveBeneficiary: initial.saveBeneficiary,
    nickname: initial.beneficiaryNickname,
  }));

  // Cancellation guard so a stale resolve/verify doesn't clobber fresher state.
  const resolveSeq = useRef(0);
  const verifySeq = useRef(0);

  function update(patch: Partial<NewTabState>) {
    setS((prev) => ({ ...prev, ...patch }));
  }

  /* ─── RIB input handling ─────────────────────────────────────────── */

  async function handleRibChange(e: ChangeEvent<HTMLInputElement>) {
    const next = formatRibInputLive(e.target.value);
    const normalized = normalizeRib(next);
    update({
      ribInput: next,
      ribError: null,
      // Editing the RIB invalidates any prior resolution + name verification.
      resolved: s.resolved && normalized === normalizeRib(s.ribInput)
        ? s.resolved
        : null,
      nameStatus: "idle",
      attemptsRemaining: null,
    });

    if (normalized.length === 20) {
      if (!isValidRib(normalized)) {
        update({ ribError: "Invalid RIB checksum.", resolved: null });
        return;
      }
      // Trigger resolve.
      const seq = ++resolveSeq.current;
      update({ resolving: true });
      try {
        const resolved = demo
          ? DEMO_RESOLVED
          : await resolveRib(normalized);
        if (resolveSeq.current !== seq) return;
        update({ resolved, resolving: false, ribError: null });
      } catch (err) {
        if (resolveSeq.current !== seq) return;
        const msg = ribResolveErrorMessage(err);
        update({ resolving: false, ribError: msg, resolved: null });
      }
    }
  }

  /* ─── Name verification ──────────────────────────────────────────── */

  async function runVerify(): Promise<boolean> {
    if (!s.resolved) return false;
    if (s.nameStatus === "matched") return true;
    if (s.nameStatus === "blocked") return false;
    const fn = s.firstName.trim();
    const ln = s.lastName.trim();
    if (!fn || !ln) return false;

    const seq = ++verifySeq.current;
    update({ nameStatus: "verifying" });
    try {
      const res = demo
        ? { matched: true, attemptsRemaining: 5 }
        : await verifyName(normalizeRib(s.ribInput), fn, ln);
      if (verifySeq.current !== seq) return false;
      update({
        nameStatus: res.matched ? "matched" : "mismatch",
        attemptsRemaining: res.attemptsRemaining,
      });
      if (!res.matched && res.attemptsRemaining <= 2) {
        onToast({
          tier: "warning",
          message:
            res.attemptsRemaining === 0
              ? "Out of attempts — try again in an hour."
              : `${res.attemptsRemaining} attempt${res.attemptsRemaining === 1 ? "" : "s"} left.`,
        });
      }
      return res.matched;
    } catch (err) {
      if (verifySeq.current !== seq) return false;
      if (err instanceof ApiError && err.status === 409) {
        update({ nameStatus: "blocked", attemptsRemaining: 0 });
        onToast({
          tier: "danger",
          message: "Too many name attempts — try again in an hour.",
        });
        return false;
      }
      onToast({
        tier: "danger",
        message:
          err instanceof ApiError && err.message
            ? err.message
            : "Couldn't verify the name. Try again.",
      });
      update({ nameStatus: "idle" });
      return false;
    }
  }

  /* ─── Submit ─────────────────────────────────────────────────────── */

  // Enabled once a valid RIB resolves and both names are entered; the match is
  // verified on submit (and the backend re-verifies on the actual transfer).
  const namesEntered = !!s.firstName.trim() && !!s.lastName.trim();
  const canContinue =
    !!s.resolved &&
    namesEntered &&
    !busy &&
    s.nameStatus !== "verifying" &&
    s.nameStatus !== "blocked" &&
    isValidRib(normalizeRib(s.ribInput));

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canContinue || !s.resolved) return;
    if (s.nameStatus !== "matched") {
      const matched = await runVerify();
      if (!matched) return;
    }
    onContinue({
      rib: normalizeRib(s.ribInput),
      firstName: s.firstName.trim(),
      lastName: s.lastName.trim(),
      saveBeneficiary: s.saveBeneficiary,
      beneficiaryNickname: s.saveBeneficiary ? s.nickname.trim() : "",
      resolved: s.resolved,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex min-h-0 flex-1 flex-col"
      noValidate
    >
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-1">
      {/* RIB input */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor="recipient-rib"
          className="font-sans text-[11px] font-bold uppercase tracking-[0.06em] text-text-secondary"
        >
          Recipient RIB (20 digits)
        </label>
        <div
          className={cn(
            "flex h-[60px] items-center gap-3 rounded-xl border bg-surface-card px-4 transition-colors duration-150 ease-out focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15",
            s.ribError ? "border-negative" : "border-border",
          )}
        >
          <input
            id="recipient-rib"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            autoFocus
            value={s.ribInput}
            onChange={handleRibChange}
            placeholder="BB AAA NNNNNNNNNNNNN CC"
            className="min-w-0 flex-1 bg-transparent font-mono text-[16px] tracking-[0.04em] text-text-primary outline-none placeholder:text-text-muted"
            disabled={busy}
          />
          {s.resolving && (
            <Loader2
              className="size-4 shrink-0 animate-spin text-text-muted"
              strokeWidth={2.4}
              aria-hidden
            />
          )}
        </div>
        {s.ribError && (
          <p role="alert" className="font-sans text-[12px] text-negative">
            {s.ribError}
          </p>
        )}
        {s.resolved && !s.ribError && (
          <div className="flex flex-wrap items-center gap-2 rounded-[10px] bg-positive-soft px-3 py-2">
            <Check
              className="size-4 text-positive"
              strokeWidth={2.4}
              aria-hidden
            />
            <p className="font-sans text-[12px] text-text-primary">
              <span className="font-semibold">
                {s.resolved.bankName} ({s.resolved.bankCode})
              </span>
              <span className="text-text-secondary">
                {" · holder "}
                {s.resolved.firstNameMasked} {s.resolved.lastNameMasked}
              </span>
              {s.resolved.isPayZoUser && (
                <span className="ml-2 inline-flex h-[18px] items-center rounded-full bg-accent px-2 font-sans text-[10px] font-bold text-accent-foreground">
                  PayZo user
                </span>
              )}
            </p>
          </div>
        )}
      </div>

      {/* Name inputs — revealed after resolve */}
      {s.resolved && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <NameField
            id="recipient-first-name"
            label="First name"
            value={s.firstName}
            placeholder={s.resolved.firstNameMasked}
            disabled={busy || s.nameStatus === "blocked"}
            status={s.nameStatus}
            onChange={(v) =>
              update({
                firstName: v,
                nameStatus:
                  s.nameStatus === "matched" || s.nameStatus === "mismatch" ? "idle" : s.nameStatus,
              })
            }
          />
          <NameField
            id="recipient-last-name"
            label="Last name"
            value={s.lastName}
            placeholder={s.resolved.lastNameMasked}
            disabled={busy || s.nameStatus === "blocked"}
            status={s.nameStatus}
            onChange={(v) =>
              update({
                lastName: v,
                nameStatus:
                  s.nameStatus === "matched" || s.nameStatus === "mismatch" ? "idle" : s.nameStatus,
              })
            }
            onBlur={() => void runVerify()}
          />
        </div>
      )}

      {s.nameStatus === "mismatch" && (
        <div className="flex items-start gap-2 rounded-[10px] bg-negative-soft px-3 py-2">
          <X
            className="mt-0.5 size-4 shrink-0 text-negative"
            strokeWidth={2.4}
            aria-hidden
          />
          <p className="font-sans text-[12px] text-text-primary">
            Doesn't match what the bank has on file for this RIB.
            {s.attemptsRemaining !== null && (
              <span className="text-text-secondary">
                {" "}
                {s.attemptsRemaining} attempt
                {s.attemptsRemaining === 1 ? "" : "s"} left.
              </span>
            )}
          </p>
        </div>
      )}

      {s.nameStatus === "blocked" && (
        <div className="flex items-start gap-2 rounded-[10px] bg-negative-soft px-3 py-2">
          <X
            className="mt-0.5 size-4 shrink-0 text-negative"
            strokeWidth={2.4}
            aria-hidden
          />
          <p className="font-sans text-[12px] text-text-primary">
            Too many name attempts on this RIB. Try again in an hour.
          </p>
        </div>
      )}

      {/* Save as beneficiary */}
      {s.resolved && s.nameStatus === "matched" && (
        <div className="flex flex-col gap-2 rounded-[10px] border border-border-soft bg-surface-card px-4 py-3">
          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={s.saveBeneficiary}
              onChange={(e) => update({ saveBeneficiary: e.target.checked })}
              className="size-4 accent-accent"
            />
            <span className="font-sans text-[13px] font-semibold text-text-primary">
              Save as a beneficiary
            </span>
            <span className="font-sans text-[11px] text-text-secondary">
              Send to them again without re-typing the RIB.
            </span>
          </label>
          {s.saveBeneficiary && (
            <input
              type="text"
              value={s.nickname}
              onChange={(e) => update({ nickname: e.target.value.slice(0, 60) })}
              placeholder="Nickname (optional, e.g. Sis, Karim B.)"
              className="h-10 w-full rounded-[8px] border border-border-soft bg-accent-soft px-3 font-sans text-[13px] text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
            />
          )}
        </div>
      )}

      </div>

      <div className="flex shrink-0 justify-end pt-4">
        <button
          type="submit"
          disabled={!canContinue}
          className="flex h-12 items-center gap-2 rounded-xl bg-text-primary px-7 font-sans text-[14px] font-semibold text-text-on-inverse transition-all duration-150 ease-out hover:bg-text-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-card disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Working…" : "Continue"}
          {!busy && (
            <ArrowRight className="size-4" strokeWidth={2.4} aria-hidden />
          )}
        </button>
      </div>
    </form>
  );
}

function ribResolveErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return "Couldn't reach PayZo. Try again.";
  switch (err.errorCode) {
    case "INVALID_RIB":
      return "That RIB doesn't pass our checksum.";
    case "CANNOT_TRANSFER_TO_SELF":
      return "You can't send money to your own account here.";
    case "BANK_NOT_REGISTERED":
      return "We don't currently support transfers to this bank.";
    case "BANK_INACTIVE":
      return "Transfers to this bank are temporarily paused.";
    case "CLIENT_NOT_FOUND_IN_CBS":
      return "No account found at the bank for this RIB.";
    default:
      return err.message ?? "Couldn't look up that RIB.";
  }
}

/* ─── Name field ───────────────────────────────────────────────────────── */

function NameField({
  id,
  label,
  value,
  placeholder,
  disabled,
  status,
  onChange,
  onBlur,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  disabled: boolean;
  status: NewTabState["nameStatus"];
  onChange: (v: string) => void;
  onBlur?: () => void;
}) {
  const ring =
    status === "matched"
      ? "border-positive focus-within:ring-positive/30"
      : status === "mismatch" || status === "blocked"
        ? "border-negative focus-within:ring-negative/30"
        : "border-border focus-within:border-accent focus-within:ring-accent/15";

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className="font-sans text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted"
      >
        {label}
      </label>
      <div
        className={cn(
          "flex h-[52px] items-center rounded-[10px] border bg-surface-card px-3.5 transition-colors duration-150 ease-out focus-within:ring-2",
          ring,
        )}
      >
        <input
          id={id}
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          disabled={disabled}
          className="min-w-0 flex-1 bg-transparent font-sans text-[14px] text-text-primary outline-none placeholder:text-text-muted"
        />
        {status === "verifying" && (
          <Loader2
            className="size-4 shrink-0 animate-spin text-text-muted"
            strokeWidth={2.4}
            aria-hidden
          />
        )}
        {status === "matched" && (
          <Check
            className="size-4 shrink-0 text-positive"
            strokeWidth={2.6}
            aria-hidden
          />
        )}
        {(status === "mismatch" || status === "blocked") && (
          <X
            className="size-4 shrink-0 text-negative"
            strokeWidth={2.6}
            aria-hidden
          />
        )}
      </div>
    </div>
  );
}

/* ─── Saved beneficiaries tab ──────────────────────────────────────────── */

function SavedBeneficiariesTab({
  demo,
  busy,
  onChoose,
  onToast,
}: {
  demo: boolean;
  busy: boolean;
  onChoose: (b: BeneficiaryResponse) => void;
  onToast: ReturnType<typeof useToast>["showToast"];
}) {
  const [items, setItems] = useState<BeneficiaryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BeneficiaryResponse | null>(
    null,
  );
  const [actionBusy, setActionBusy] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const cardRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = demo
          ? { content: DEMO_BENEFICIARIES, totalElements: DEMO_BENEFICIARIES.length, totalPages: 1, page: 0, size: 50 }
          : await listBeneficiaries(0, 50);
        if (!cancelled) setItems(res.content);
      } catch (err) {
        if (cancelled) return;
        setItems([]);
        setError(
          err instanceof ApiError && err.message
            ? err.message
            : "Couldn't load your beneficiaries.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [demo, reloadTick]);

  async function toggleFavorite(b: BeneficiaryResponse) {
    if (actionBusy) return;
    setActionBusy(true);
    const previous = items;
    setItems((prev) =>
      prev.map((x) => (x.id === b.id ? { ...x, favorite: !x.favorite } : x)),
    );
    try {
      if (!demo) {
        const updated = await toggleBeneficiaryFavorite(b.id);
        setItems((prev) =>
          prev.map((x) =>
            x.id === b.id
              ? {
                  ...x,
                  ...updated,
                  payzoUser: updated.payzoUser ?? x.payzoUser,
                  profilePictureUrl:
                    updated.profilePictureUrl ?? x.profilePictureUrl,
                }
              : x,
          ),
        );
      }
    } catch (err) {
      setItems(previous);
      onToast({
        tier: "danger",
        message:
          err instanceof ApiError && err.message
            ? err.message
            : "Couldn't update the favorite.",
      });
    } finally {
      setActionBusy(false);
    }
  }

  async function handleToggleFavorite(
    e: MouseEvent<HTMLButtonElement>,
    b: BeneficiaryResponse,
  ) {
    e.stopPropagation();
    void toggleFavorite(b);
  }

  function handleOpenInList(b: BeneficiaryResponse) {
    const el = cardRefs.current.get(b.id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    el.classList.add("animate-card-flash");
    window.setTimeout(() => el.classList.remove("animate-card-flash"), 700);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setActionBusy(true);
    const previous = items;
    setItems((prev) => prev.filter((x) => x.id !== deleteTarget.id));
    try {
      if (!demo) await deleteBeneficiary(deleteTarget.id);
      onToast({ tier: "success", message: "Beneficiary removed." });
    } catch (err) {
      setItems(previous);
      onToast({
        tier: "danger",
        message:
          err instanceof ApiError && err.message
            ? err.message
            : "Couldn't remove the beneficiary.",
      });
    } finally {
      setActionBusy(false);
      setDeleteTarget(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-16 text-text-muted">
        <Loader2 className="size-5 animate-spin" strokeWidth={2.4} aria-hidden />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-center">
        <p className="font-sans text-[13px] text-negative">{error}</p>
        <button
          type="button"
          onClick={() => setReloadTick((t) => t + 1)}
          className="rounded-[8px] bg-surface-raised px-3 py-1.5 font-sans text-[12px] font-semibold text-text-secondary hover:bg-surface-soft"
        >
          Retry
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
        <p className="font-sans text-[14px] font-bold text-text-primary">
          No saved recipients yet
        </p>
        <p className="max-w-sm font-sans text-[12px] text-text-secondary">
          Save someone the next time you send. They'll show up here for one-tap
          transfers.
        </p>
      </div>
    );
  }

  return (
    <>
      <FavoritesBubbles
        items={items}
        busy={busy || actionBusy}
        onTap={onChoose}
        onRemoveFavorite={toggleFavorite}
        onOpenInList={handleOpenInList}
      />
      <ul className="flex flex-col gap-2.5">
        {items.map((b) => (
          <li
            key={b.id}
            ref={(el) => {
              if (el) cardRefs.current.set(b.id, el);
              else cardRefs.current.delete(b.id);
            }}
            className="scroll-mt-32"
          >
            <button
              type="button"
              disabled={busy || actionBusy}
              onClick={() => onChoose(b)}
              className="group flex w-full items-center gap-3 rounded-[12px] border border-border-soft bg-surface-card px-3.5 py-3 text-left transition-colors duration-150 ease-out hover:bg-surface-raised disabled:opacity-60"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent font-sans text-[14px] font-bold text-accent-foreground">
                {b.initials}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <p className="truncate font-sans text-[14px] font-bold text-text-primary">
                    {b.displayName}
                  </p>
                  {b.favorite && (
                    <Star
                      className="size-3.5 fill-warning text-warning"
                      strokeWidth={2}
                      aria-hidden
                    />
                  )}
                </div>
                <p className="truncate font-mono text-[11px] text-text-secondary">
                  {b.bankCode && (
                    <span className="font-sans">{b.bankCode} · </span>
                  )}
                  {formatRibDisplay(b.accountNumber)}
                </p>
                {b.lastUsedAt && (
                  <p className="font-sans text-[11px] text-text-muted">
                    Used {relativeTime(b.lastUsedAt)} · {b.transferCount}{" "}
                    transfer{b.transferCount === 1 ? "" : "s"}
                  </p>
                )}
              </div>
              <span className="flex shrink-0 items-center gap-1.5">
                <RowAction
                  ariaLabel={b.favorite ? "Unfavorite" : "Favorite"}
                  onClick={(e) => handleToggleFavorite(e, b)}
                >
                  <Star
                    className={cn(
                      "size-4",
                      b.favorite
                        ? "fill-warning text-warning"
                        : "text-text-muted",
                    )}
                    strokeWidth={2}
                    aria-hidden
                  />
                </RowAction>
                <RowAction
                  ariaLabel="Remove beneficiary"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(b);
                  }}
                >
                  <Trash2
                    className="size-4 text-text-muted"
                    strokeWidth={2}
                    aria-hidden
                  />
                </RowAction>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove beneficiary?"
        message={
          deleteTarget
            ? `${deleteTarget.displayName} will no longer appear in your saved list. The transfers you've already sent stay in your history.`
            : ""
        }
        confirmLabel="Remove"
        cancelLabel="Keep"
        variant="danger"
        busy={actionBusy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </>
  );
}

function RowAction({
  ariaLabel,
  onClick,
  children,
}: {
  ariaLabel: string;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-full transition-colors duration-150 ease-out hover:bg-accent-soft"
    >
      {children}
    </button>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "recently";
  const diffMs = Date.now() - then;
  const dayMs = 86400 * 1000;
  const days = Math.floor(diffMs / dayMs);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return "a week ago";
  if (weeks < 5) return `${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return "a month ago";
  if (months < 12) return `${months} months ago`;
  return "over a year ago";
}
