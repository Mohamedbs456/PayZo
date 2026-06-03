import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  ChevronRight,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  Languages,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  Moon,
  Pencil,
  Phone,
  Sun,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { resolveBackendUrl } from "@/lib/backendUrl";
import { isDemoMode, withDemo } from "@/lib/demoMode";
import {
  type AppLocale,
  applyDarkMode,
  getDarkMode,
  getLocale,
  setLocale,
} from "@/lib/clientPrefs";
import { kcLogout } from "@/lib/auth/keycloak";
import { session } from "@/lib/auth/session";
import { ApiError } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PasswordRequirementsList } from "@/components/ui/PasswordRequirementsList";
import { isPasswordValid } from "@/features/me/passwordPolicy";
import {
  type ClientProfile,
  changePassword,
  setDefaultAccount,
  uploadProfilePicture,
} from "@/features/me/api";
import { useMe } from "@/features/me/MeProvider";
import { UsernameEditor } from "@/features/me/components/UsernameEditor";
import { getAccounts, type ClientAccount } from "@/features/dashboard/api";

interface ProfilePanelProps {
  open: boolean;
  onClose: () => void;
  /** When `null`, the panel renders generic placeholders. */
  me: ClientProfile | null;
}

type PanelView = "main" | "personal-info" | "reset-password";

/**
 * Right-side slide-out panel (Figma 18:92). Multi-view stack:
 *
 *   - main             : avatar (with pen-on-hover upload), identity
 *                        line, menu, dark/locale toggles, logout
 *   - personal-info    : read-only profile fields (CBS-sourced)
 *   - reset-password   : current + new + confirm with live checklist
 *
 * Switching views slides the active panel in from the right and the
 * previous one slides out to the left. The panel never opens a new
 * route — everything lives inside the slide-out.
 *
 * Other behaviors:
 *   - Avatar circle: pen overlay on hover, click → file picker, upload
 *     via `PUT /client/profile/picture`. 5 MB cap, JPG/PNG/WEBP only.
 *   - Logout: opens a centered ConfirmDialog (warning) before actually
 *     revoking the refresh token + clearing the session.
 *   - Dark mode: writes the `.dark` class on <html> via clientPrefs.
 *   - Language: writes the locale to <html lang> + localStorage so the
 *     same choice survives reloads. Real i18n is future work — the
 *     toggle exists today so the choice is captured.
 */
export function ProfilePanel({ open, onClose, me }: ProfilePanelProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const { patch } = useMe();

  const [view, setView] = useState<PanelView>("main");
  const [darkMode, setDarkMode] = useState(getDarkMode);
  const [locale, setLocaleState] = useState<AppLocale>(getLocale);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);

  // Reset to the main view every time the panel opens fresh.
  useEffect(() => {
    if (open) setView("main");
  }, [open]);

  // Esc — closes the panel from the main view, falls back to "main"
  // from a deeper view so the user can navigate back without grabbing
  // the mouse.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setView((cur) => {
        if (cur !== "main") return "main";
        onClose();
        return cur;
      });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  function toggleDarkMode() {
    const next = !darkMode;
    setDarkMode(next);
    applyDarkMode(next);
  }

  function chooseLocale(next: AppLocale) {
    if (next === locale) return;
    setLocaleState(next);
    setLocale(next);
  }

  async function handleConfirmLogout() {
    setLogoutBusy(true);
    if (isDemoMode()) {
      navigate("/login", { replace: true });
      return;
    }
    const current = session.get();
    if (current) {
      void kcLogout(current.tokens.refreshToken);
    }
    session.clear();
    toast.showToast({ tier: "success", message: "Signed out." });
    setLogoutBusy(false);
    setLogoutOpen(false);
    onClose();
    navigate("/login", { replace: true });
  }

  return (
    <>
      {/* Scrim — fades in/out, click closes. */}
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-scrim/40 backdrop-blur-[2px] transition-opacity duration-200 ease-out",
          open
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0",
        )}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Profile menu"
        aria-hidden={!open}
        className={cn(
          "fixed right-0 top-0 z-50 flex h-dvh w-full max-w-[480px] flex-col overflow-hidden border-l border-border-soft bg-surface-card shadow-[-16px_0px_24px_rgba(0,0,0,0.4)] transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {view === "main" && (
          <MainView
            me={me}
            darkMode={darkMode}
            locale={locale}
            onToggleDark={toggleDarkMode}
            onChooseLocale={chooseLocale}
            onClose={onClose}
            onPersonalInfo={() => setView("personal-info")}
            onResetPassword={() => setView("reset-password")}
            onBeneficiaries={() => {
              onClose();
              navigate(withDemo("/beneficiaries"));
            }}
            onLogoutRequest={() => setLogoutOpen(true)}
            onPictureUpdated={(url) => patch({ profilePictureUrl: url })}
          />
        )}

        {view === "personal-info" && (
          <PersonalInfoView
            me={me}
            onBack={() => setView("main")}
            onClose={onClose}
            onDefaultAccountChanged={(accountNumber) =>
              patch({ defaultAccountId: accountNumber })
            }
          />
        )}

        {view === "reset-password" && (
          <ResetPasswordView
            onBack={() => setView("main")}
            onClose={onClose}
            onSuccess={() => {
              toast.showToast({
                tier: "success",
                message: "Password updated.",
              });
              setView("main");
            }}
          />
        )}
      </aside>

      <ConfirmDialog
        open={logoutOpen}
        variant="warning"
        title="Sign out of PayZo?"
        message="You'll need to log in again with your password and OTP to come back. Any unsaved transfer in progress will be discarded."
        confirmLabel="Sign out"
        cancelLabel="Stay signed in"
        busy={logoutBusy}
        onConfirm={handleConfirmLogout}
        onCancel={() => setLogoutOpen(false)}
      />
    </>
  );
}

/* ─── Main view ───────────────────────────────────────────────────────── */

function MainView({
  me,
  darkMode,
  locale,
  onToggleDark,
  onChooseLocale,
  onClose,
  onPersonalInfo,
  onResetPassword,
  onBeneficiaries,
  onLogoutRequest,
  onPictureUpdated,
}: {
  me: ClientProfile | null;
  darkMode: boolean;
  locale: AppLocale;
  onToggleDark: () => void;
  onChooseLocale: (l: AppLocale) => void;
  onClose: () => void;
  onPersonalInfo: () => void;
  onResetPassword: () => void;
  onBeneficiaries: () => void;
  onLogoutRequest: () => void;
  onPictureUpdated: (url: string) => void;
}) {
  const fullName = me ? `${me.firstName} ${me.lastName}` : "Welcome";
  const cinLine = me ? `CIN  ·  ${me.cin}` : "";

  return (
    <div className="flex h-full flex-col">
      <PanelHeader title="Profile" onClose={onClose} />

      <div className="flex shrink-0 flex-col items-center gap-3.5 p-6">
        <AvatarUploader me={me} onUploaded={onPictureUpdated} />
        <p className="font-sans text-[18px] font-semibold text-text-primary">
          {fullName}
        </p>
        {cinLine && (
          <p className="whitespace-pre font-mono text-[12px] text-text-muted">
            {cinLine}
          </p>
        )}
      </div>

      <nav className="flex shrink-0 flex-col gap-1 p-3">
        <PanelButtonRow
          icon={<Info className="size-4" strokeWidth={2} aria-hidden />}
          label="Personal info"
          onClick={onPersonalInfo}
          chevron
        />
        <PanelButtonRow
          icon={<Users className="size-4" strokeWidth={2} aria-hidden />}
          label="Beneficiaries"
          onClick={onBeneficiaries}
          chevron
        />
        <PanelButtonRow
          icon={<KeyRound className="size-4" strokeWidth={2} aria-hidden />}
          label="Reset password"
          onClick={onResetPassword}
          chevron
        />
        <PanelLanguageRow locale={locale} onChoose={onChooseLocale} />
        <PanelToggleRow
          icon={
            darkMode ? (
              <Sun className="size-4" strokeWidth={2} aria-hidden />
            ) : (
              <Moon className="size-4" strokeWidth={2} aria-hidden />
            )
          }
          label="Dark mode"
          checked={darkMode}
          onToggle={onToggleDark}
        />
      </nav>

      <div className="min-h-0 flex-1" />

      <div className="shrink-0 px-3 pb-6 pt-3">
        <button
          type="button"
          onClick={onLogoutRequest}
          className="flex w-full items-center gap-3.5 rounded-[10px] px-4 py-3.5 text-left transition-colors duration-150 ease-out hover:bg-negative-soft"
        >
          <span className="flex size-7 shrink-0 items-center justify-center text-negative">
            <LogOut className="size-4" strokeWidth={2} aria-hidden />
          </span>
          <span className="flex-1 font-sans text-[14px] font-semibold text-negative">
            Log out
          </span>
          <ChevronRight
            className="size-4 text-text-muted"
            strokeWidth={2}
            aria-hidden
          />
        </button>
      </div>
    </div>
  );
}

/* ─── Avatar uploader ─────────────────────────────────────────────────── */

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — matches backend cap

function AvatarUploader({
  me,
  onUploaded,
}: {
  me: ClientProfile | null;
  onUploaded: (url: string) => void;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const displayUrl = previewUrl
    ? previewUrl
    : me?.profilePictureUrl
      ? resolveBackendUrl(me.profilePictureUrl)
      : null;

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!ALLOWED_MIME.includes(file.type)) {
      toast.showToast({
        tier: "danger",
        message: "Pick a JPG, PNG, or WEBP image.",
      });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.showToast({
        tier: "danger",
        message: "Image is too large — keep it under 5 MB.",
      });
      return;
    }

    // Optimistic local preview so the round face flips instantly.
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
    setBusy(true);
    try {
      if (isDemoMode()) {
        // Demo mode never hits the wire — keep the local preview as the
        // "uploaded" picture so other clients/staff would see it once
        // the backend is wired.
        await new Promise((r) => setTimeout(r, 350));
        onUploaded(localUrl);
        toast.showToast({
          tier: "success",
          message: "Profile picture updated.",
        });
      } else {
        const newUrl = await uploadProfilePicture(file);
        onUploaded(newUrl);
        // Drop the local preview so the canonical backend URL takes over.
        setPreviewUrl(null);
        URL.revokeObjectURL(localUrl);
        toast.showToast({
          tier: "success",
          message: "Profile picture updated.",
        });
      }
    } catch (err) {
      // Roll the preview back on failure.
      setPreviewUrl(null);
      URL.revokeObjectURL(localUrl);
      const msg =
        err instanceof ApiError && err.message
          ? err.message
          : "Couldn't upload the picture. Try again.";
      toast.showToast({ tier: "danger", message: msg });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      aria-label="Change profile picture"
      onClick={() => fileRef.current?.click()}
      disabled={busy}
      className="group relative size-[124px] shrink-0 overflow-hidden rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-card"
    >
      <span
        className="absolute inset-0 block"
        style={{ backgroundImage: "var(--gradient-avatar)" }}
        aria-hidden
      />
      {displayUrl && (
        <img
          src={displayUrl}
          alt=""
          className="absolute inset-0 block size-full object-cover"
        />
      )}
      {/* Hover overlay — subtle dark scrim + pen icon */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-0 flex items-center justify-center bg-black/35 text-white opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100",
          busy && "opacity-100",
        )}
      >
        {busy ? (
          <Loader2 className="size-7 animate-spin" strokeWidth={2} />
        ) : (
          <Pencil className="size-7" strokeWidth={2} />
        )}
      </span>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFile}
      />
    </button>
  );
}

/* ─── Personal info view ──────────────────────────────────────────────── */

function PersonalInfoView({
  me,
  onBack,
  onClose,
  onDefaultAccountChanged,
}: {
  me: ClientProfile | null;
  onBack: () => void;
  onClose: () => void;
  /** Called after the BE confirms the new default — lets the parent
   *  patch the {@code me} cache so the ★ marker on the accounts page
   *  updates without a refetch. */
  onDefaultAccountChanged: (accountNumber: string) => void;
}) {
  const toast = useToast();
  const demo = isDemoMode();

  // Lazy-load the client's accounts when the panel opens — drives the
  // default-account dropdown. Demo mode short-circuits to whatever the
  // mock layer hands back.
  const [accounts, setAccounts] = useState<ClientAccount[] | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [savingDefault, setSavingDefault] = useState(false);

  useEffect(() => {
    if (!me) return;
    if (demo) {
      setAccounts([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const list = await getAccounts();
        if (!cancelled) {
          setAccounts(list);
          setAccountsError(null);
        }
      } catch (err) {
        if (cancelled) return;
        setAccounts([]);
        setAccountsError(
          err instanceof ApiError && err.message
            ? err.message
            : "Couldn't load your accounts.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me, demo]);

  if (!me) {
    return (
      <div className="flex h-full flex-col">
        <PanelHeader title="Personal info" onBack={onBack} onClose={onClose} />
        <div className="flex flex-1 items-center justify-center px-6">
          <p className="font-sans text-[14px] text-text-muted">
            Sign in to see your personal info.
          </p>
        </div>
      </div>
    );
  }

  const dob = me.dateOfBirth
    ? new Date(me.dateOfBirth).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";

  async function handleSelectDefault(accountNumber: string) {
    if (!accountNumber || accountNumber === me?.defaultAccountId) return;
    setSavingDefault(true);
    try {
      if (!demo) {
        await setDefaultAccount(accountNumber);
      }
      onDefaultAccountChanged(accountNumber);
      toast.showToast({
        tier: "success",
        message: "Default account updated.",
      });
    } catch (err) {
      toast.showToast({
        tier: "danger",
        message:
          err instanceof ApiError && err.message
            ? err.message
            : "Couldn't update your default account. Try again.",
      });
    } finally {
      setSavingDefault(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        title="Personal info"
        subtitle="Identity & contact come from your bank — defaults are yours to set"
        onBack={onBack}
        onClose={onClose}
      />

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 pb-6 pt-2">
        <InfoSection title="Identity">
          <InfoRow label="Full name" value={`${me.firstName} ${me.lastName}`} />
          <InfoRow label="CIN" value={me.cin} mono />
          <InfoRow
            label="Date of birth"
            value={dob}
            icon={
              <Calendar className="size-3.5" strokeWidth={2} aria-hidden />
            }
          />
        </InfoSection>

        <InfoSection title="Contact">
          <InfoRow
            label="Email"
            value={me.email}
            icon={<Mail className="size-3.5" strokeWidth={2} aria-hidden />}
          />
          <InfoRow
            label="Phone"
            value={me.phone}
            icon={<Phone className="size-3.5" strokeWidth={2} aria-hidden />}
            mono
          />
        </InfoSection>

        <InfoSection title="Address">
          <InfoRow
            label="Address"
            value={me.address}
            icon={<MapPin className="size-3.5" strokeWidth={2} aria-hidden />}
          />
          <InfoRow label="Governorate" value={me.governorate} />
        </InfoSection>

        <InfoSection title="PayZo">
          {/* Keyed on me.id so a login swap re-mounts the editor and
              useState(initial) re-initialises with the new persisted
              username — avoids an effect-based sync. */}
          <UsernameEditor key={me.id} />
          <DefaultAccountRow
            value={me.defaultAccountId ?? null}
            accounts={accounts}
            error={accountsError}
            saving={savingDefault}
            onChange={handleSelectDefault}
          />
          <InfoRow
            label="Trust score"
            value={
              typeof me.trustScore === "number"
                ? `${me.trustScore} / 100`
                : "—"
            }
          />
        </InfoSection>

        <p className="font-sans text-[12px] leading-[1.5] text-text-muted">
          Need to update your phone, address, or any other detail? They sync
          automatically from your bank — get in touch with them and the
          changes show up here on your next sign-in.
        </p>
      </div>
    </div>
  );
}

/**
 * Editable "Default account" row. Renders a native <select> styled to
 * match the InfoRow rhythm — kept native (not a custom popover) for
 * accessibility (keyboard / screen reader / mobile picker) and to
 * keep this PR small. Pending state hides the chevron and adds a
 * spinner during the BE round-trip.
 */
function DefaultAccountRow({
  value,
  accounts,
  error,
  saving,
  onChange,
}: {
  value: string | null;
  accounts: ClientAccount[] | null;
  error: string | null;
  saving: boolean;
  onChange: (accountNumber: string) => void;
}) {
  const loading = accounts === null;
  const empty = !loading && (accounts?.length ?? 0) === 0;
  // If the persisted value isn't in the fetched list (rare — account
  // closed bank-side), fold it in as a disabled option so the select
  // still reflects the saved state instead of silently flipping to
  // the first option.
  const valueIsKnown =
    !!value && (accounts ?? []).some((a) => a.accountNumber === value);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-sans text-[11px] font-medium text-text-muted">
        Default account
      </span>
      <div className="relative flex items-center">
        <select
          value={value ?? ""}
          disabled={loading || empty || saving}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Default account"
          className={cn(
            "h-10 w-full appearance-none rounded-lg border border-border-soft bg-surface-card pl-3 pr-9 font-mono text-[13px] text-text-primary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          {loading && <option value="">Loading…</option>}
          {empty && !loading && <option value="">No accounts on file</option>}
          {!loading && !empty && !value && (
            <option value="" disabled>
              Choose one of your accounts…
            </option>
          )}
          {!loading &&
            (accounts ?? []).map((a) => (
              <option key={a.accountNumber} value={a.accountNumber}>
                {a.bankCode} · {a.type} · ••{a.accountNumber.slice(-4)}
              </option>
            ))}
          {/* Sentinel for an unknown persisted value */}
          {!loading && value && !valueIsKnown && (
            <option value={value} disabled>
              ••{value.slice(-4)} (no longer in your list)
            </option>
          )}
        </select>
        {/* Pending spinner — replaces the chevron during the round-trip */}
        <span
          aria-hidden
          className="pointer-events-none absolute right-3 flex items-center"
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin text-text-muted" />
          ) : (
            <ChevronRight className="size-4 rotate-90 text-text-muted" />
          )}
        </span>
      </div>
      {error && (
        <span className="font-sans text-[11px] text-negative">{error}</span>
      )}
      <span className="font-sans text-[11px] text-text-muted">
        Incoming transfers from other PayZo users land here.
      </span>
    </div>
  );
}

function InfoSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p
        className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-text-muted"
        style={{ fontVariationSettings: "'wdth' 100" }}
      >
        {title}
      </p>
      <div className="flex flex-col gap-px overflow-hidden rounded-[12px] border border-border-soft">
        {children}
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
  icon,
}: {
  label: string;
  value: string;
  mono?: boolean;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 bg-surface-card px-4 py-3">
      <span className="flex items-center gap-2 font-sans text-[12px] text-text-secondary">
        {icon}
        {label}
      </span>
      <span
        className={cn(
          "max-w-[60%] truncate text-right text-[13px] text-text-primary",
          mono ? "font-mono font-medium" : "font-sans font-semibold",
        )}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

/* ─── Reset password view ─────────────────────────────────────────────── */

function ResetPasswordView({
  onBack,
  onClose,
  onSuccess,
}: {
  onBack: () => void;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  const matches = next === confirm;
  const policyOK = isPasswordValid(next);
  const valid = current.length > 0 && policyOK && matches;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitted(true);
    if (!valid || busy) return;
    setBusy(true);
    try {
      if (isDemoMode()) {
        await new Promise((r) => setTimeout(r, 400));
      } else {
        await changePassword({
          currentPassword: current,
          newPassword: next,
        });
      }
      onSuccess();
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 401
          ? "Current password isn't right."
          : err instanceof ApiError && err.message
            ? err.message
            : "Couldn't update your password. Try again.";
      toast.showToast({ tier: "danger", message: msg });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        title="Reset password"
        subtitle="Type your current password, then choose a new one"
        onBack={onBack}
        onClose={onClose}
      />

      <form
        onSubmit={submit}
        className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 pb-6 pt-2"
        noValidate
      >
        <PasswordField
          label="Current password"
          value={current}
          onChange={setCurrent}
          autoFocus
        />
        <PasswordField
          label="New password"
          value={next}
          onChange={setNext}
          invalid={submitted && !policyOK}
        />
        <PasswordField
          label="Confirm new password"
          value={confirm}
          onChange={setConfirm}
          invalid={submitted && !matches}
        />
        {submitted && !matches && confirm.length > 0 && (
          <p role="alert" className="font-sans text-[12px] text-negative">
            Passwords don't match.
          </p>
        )}

        <PasswordRequirementsList
          value={next}
          showInvalidAsDanger={submitted && !policyOK}
        />

        <div className="flex-1" />

        <div className="flex flex-col gap-2">
          <button
            type="submit"
            disabled={!valid || busy}
            className="flex h-12 items-center justify-center gap-2 rounded-[12px] bg-accent px-6 font-sans text-[14px] font-bold text-accent-foreground transition-all duration-150 ease-out hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save new password"}
          </button>
          <button
            type="button"
            onClick={onBack}
            className="flex h-11 items-center justify-center rounded-[10px] bg-surface-raised px-6 font-sans text-[13px] font-semibold text-text-secondary transition-colors duration-150 ease-out hover:bg-surface-soft"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  autoFocus,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  invalid?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <label className="flex flex-col gap-1.5">
      <span
        className="font-sans text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted"
        style={{ fontVariationSettings: "'wdth' 100" }}
      >
        {label}
      </span>
      <div
        className={cn(
          "flex h-[52px] items-center gap-2 rounded-[12px] border bg-surface-card px-4 transition-colors duration-150 ease-out focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15",
          invalid ? "border-negative" : "border-border",
        )}
      >
        <input
          type={show ? "text" : "password"}
          autoComplete="off"
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 bg-transparent font-mono text-[14px] text-text-primary outline-none"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide password" : "Show password"}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors duration-150 ease-out hover:bg-surface-soft hover:text-text-primary"
        >
          {show ? (
            <EyeOff className="size-4" strokeWidth={2} aria-hidden />
          ) : (
            <Eye className="size-4" strokeWidth={2} aria-hidden />
          )}
        </button>
      </div>
    </label>
  );
}

/* ─── Shared primitives ───────────────────────────────────────────────── */

function PanelHeader({
  title,
  subtitle,
  onBack,
  onClose,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onClose: () => void;
}) {
  return (
    <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border-soft px-6 pb-4 pt-6">
      <div className="flex min-w-0 items-center gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="flex size-8 items-center justify-center rounded-[10px] text-text-secondary transition-colors duration-150 ease-out hover:bg-surface-soft hover:text-text-primary"
          >
            <ArrowLeft className="size-4" strokeWidth={2.4} aria-hidden />
          </button>
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="font-sans text-[18px] font-semibold text-text-primary">
            {title}
          </h2>
          {subtitle && (
            <p className="font-sans text-[12px] text-text-muted">{subtitle}</p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close profile panel"
        className="flex size-8 shrink-0 items-center justify-center rounded-[10px] text-text-secondary transition-colors duration-150 ease-out hover:bg-surface-soft hover:text-text-primary"
      >
        <X className="size-4" strokeWidth={2.4} aria-hidden />
      </button>
    </header>
  );
}

function PanelButtonRow({
  icon,
  label,
  onClick,
  chevron,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  chevron?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3.5 rounded-[10px] px-4 py-3.5 text-left transition-colors duration-150 ease-out hover:bg-surface-soft"
    >
      <span className="flex size-7 shrink-0 items-center justify-center text-text-secondary">
        {icon}
      </span>
      <span className="flex-1 font-sans text-[14px] font-semibold text-text-primary">
        {label}
      </span>
      {chevron && (
        <ChevronRight
          className="size-4 text-text-muted"
          strokeWidth={2}
          aria-hidden
        />
      )}
    </button>
  );
}

function PanelLanguageRow({
  locale,
  onChoose,
}: {
  locale: AppLocale;
  onChoose: (l: AppLocale) => void;
}) {
  return (
    <div className="flex items-center gap-3.5 rounded-[10px] px-4 py-3">
      <span className="flex size-7 shrink-0 items-center justify-center text-text-secondary">
        <Languages className="size-4" strokeWidth={2} aria-hidden />
      </span>
      <span className="flex-1 font-sans text-[14px] font-semibold text-text-primary">
        Language
      </span>
      <div
        role="radiogroup"
        aria-label="Language"
        className="flex items-center gap-1 rounded-[10px] bg-surface-soft p-1"
      >
        {(["en", "fr"] as const).map((opt) => {
          const active = opt === locale;
          return (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChoose(opt)}
              className={cn(
                "flex h-7 items-center justify-center rounded-[8px] px-3 font-sans text-[12px] transition-colors duration-150 ease-out",
                active
                  ? "bg-surface-card font-semibold text-text-primary shadow-[0px_1px_3px_0px_rgba(0,0,0,0.08)]"
                  : "font-medium text-text-secondary hover:text-text-primary",
              )}
            >
              {opt === "en" ? "EN" : "FR"}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PanelToggleRow({
  icon,
  label,
  checked,
  onToggle,
}: {
  icon: ReactNode;
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-3.5 rounded-[10px] px-4 py-3.5 text-left transition-colors duration-150 ease-out hover:bg-surface-soft"
    >
      <span className="flex size-7 shrink-0 items-center justify-center text-text-secondary">
        {icon}
      </span>
      <span className="flex-1 font-sans text-[14px] font-semibold text-text-primary">
        {label}
      </span>
      <span
        role="switch"
        aria-checked={checked}
        aria-label={`Toggle ${label.toLowerCase()}`}
        className={cn(
          "relative h-[22px] w-[40px] shrink-0 rounded-full transition-colors duration-200 ease-out",
          checked ? "bg-accent" : "bg-border-soft",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-[18px] rounded-full bg-surface-card shadow-sm transition-transform duration-200 ease-out",
            checked ? "translate-x-[20px]" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}
