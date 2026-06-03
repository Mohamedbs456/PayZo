import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import payzoBrandMark from "@/assets/payzo-brand-mark.svg";
import payzoWordmark from "@/assets/payzo-wordmark.svg";
import { useToast } from "@/components/ui/Toast";
import {
  AccountDisabledError,
  InvalidCredentialsError,
  KeycloakConfigError,
  KeycloakUnreachableError,
  ropcLogin,
} from "@/lib/auth/keycloak";
import { bundleFromRaw, session } from "@/lib/auth/session";
import { decodeJwt, extractBoRoles } from "@/lib/auth/jwt";

/**
 * Backoffice login screen — Figma node 76:2.
 *
 * Flow (no OTP for staff — confirmed against AuthController.java which wires
 * /login/initiate-otp to the clients realm only):
 *   1. ROPC against Keycloak realm `backoffice` → access + refresh tokens
 *   2. Decode access token; verify `realm_access.roles` includes a BO role
 *   3. Persist tokens in sessionStorage; navigate to /dashboard
 *
 * Errors:
 *   - Empty fields              → inline message under inputs
 *   - 400 invalid_grant         → inline "Invalid username or password"
 *   - 400 disabled / locked     → toast (account suspended)
 *   - Token has no BO role      → toast (not authorized for backoffice)
 *   - Keycloak unreachable      → useHealthCheck flips the layout to /maintenance
 *
 * Layout: split panel ≥md, single-column with compact brand strip <md.
 * Wrapper is h-dvh + overflow-hidden; the form pane is the only place that
 * scrolls, and only on extremely short viewports (e.g. on-screen keyboard).
 */
export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (session.isAuthenticated()) {
      const redirectTo =
        (location.state as { from?: string } | null)?.from ?? "/dashboard";
      navigate(redirectTo, { replace: true });
    }
  }, [location.state, navigate]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const u = username.trim();
    const p = password;
    if (!u || !p) {
      setFormError("Enter your username and password.");
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const raw = await ropcLogin(u, p);
      const claims = decodeJwt(raw.access_token);
      const roles = extractBoRoles(claims);
      if (roles.length === 0) {
        showToast({
          tier: "danger",
          message: "This account is not authorized for the backoffice.",
        });
        return;
      }
      session.put(bundleFromRaw(raw));
      const redirectTo =
        (location.state as { from?: string } | null)?.from ?? "/dashboard";
      navigate(redirectTo, { replace: true });
    } catch (err) {
      if (err instanceof InvalidCredentialsError) {
        setFormError("Invalid username or password.");
      } else if (err instanceof AccountDisabledError) {
        showToast({
          tier: "danger",
          message: "Your account has been suspended. Contact support.",
        });
      } else if (err instanceof KeycloakConfigError) {
        // eslint-disable-next-line no-console
        console.error("[login] Keycloak config error", err);
        showToast({
          tier: "danger",
          message: `Sign-in misconfigured: ${err.errorCode}. Check the backoffice client.`,
          duration: 6000,
        });
      } else if (err instanceof KeycloakUnreachableError) {
        showToast({
          tier: "danger",
          message: "Can't reach the authentication service. Try again.",
        });
      } else {
        showToast({
          tier: "danger",
          message: "Sign in failed. Try again.",
        });
        // eslint-disable-next-line no-console
        console.error("[login] unexpected error", err);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const brandGradient =
    "linear-gradient(123.72048736889431deg, #2a1f14 0%, #7a4a28 39.286%, #b07840 71.429%)";

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-brand-cream md:flex-row">
      {/* Compact brand strip — mobile only (<md). Uses horizontal wordmark
          since the stacked brand mark doesn't fit at this height. */}
      <header
        className="relative flex h-[112px] shrink-0 flex-col items-center justify-center gap-2 px-6 md:hidden"
        style={{ backgroundImage: brandGradient }}
        aria-hidden
      >
        <img
          src={payzoWordmark}
          alt=""
          className="block h-[40px] w-auto shrink-0"
        />
        <p
          className="font-sans text-[10px] font-medium tracking-[1.4px] text-brand-cream"
          style={{ fontVariationSettings: "'wdth' 100" }}
        >
          CONTROL · REVIEW · PROTECT
        </p>
      </header>

      {/* Brand panel — md and up */}
      <aside
        className="relative hidden h-full shrink-0 flex-col items-center overflow-hidden p-8 md:flex md:w-[clamp(320px,38vw,440px)] lg:w-[clamp(420px,40vw,580px)] lg:px-14 lg:py-12"
        style={{ backgroundImage: brandGradient }}
        aria-hidden
      >
        {/* Centered mark + tagline group, lifted slightly above true center */}
        <div className="mt-[8vh] mb-auto flex w-full flex-col items-center gap-2 lg:gap-3">
          <img
            src={payzoBrandMark}
            alt=""
            className="block h-auto w-[min(78%,440px)] max-h-[42vh] object-contain"
          />
          <p className="whitespace-nowrap font-sans text-[clamp(13px,1.1vw,17px)] font-medium tracking-[0.68px] text-brand-cream">
            {"—   CONTROL   •   REVIEW   •   PROTECT   —"}
          </p>
        </div>

        {/* Bottom block */}
        <div className="flex w-full flex-col gap-4">
          <p
            className="font-display text-[clamp(13px,1.1vw,16px)] font-bold tracking-[1.92px] text-white"
            style={{ fontVariationSettings: "'wdth' 100" }}
          >
            BACKOFFICE STAFF ACCESS
          </p>
          <p className="hidden max-w-[420px] font-sans text-[14px] leading-[22px] text-white lg:block">
            Manage clients, decide on flagged transfers, and tune fraud-detection thresholds across PayZo. Internal staff access only.
          </p>
          <p className="mt-6 whitespace-pre font-sans text-[11px] text-white">
            {"© 2026 PayZo  ·  FSM  ·  Proxym"}
          </p>
        </div>
      </aside>

      {/* Form panel */}
      <main className="flex h-full min-h-0 flex-1 items-center justify-center overflow-y-auto bg-brand-cream p-6 sm:p-10 lg:p-20">
        <form
          onSubmit={handleSubmit}
          className="flex w-full max-w-[440px] flex-col gap-6 lg:gap-8"
          noValidate
          aria-busy={submitting}
        >
          <h1 className="font-sans text-[clamp(24px,3vw,32px)] font-bold leading-none text-text-primary">
            Welcome back
          </h1>
          <p className="font-sans text-[14px] leading-none text-text-label">
            Sign in to your PayZo backoffice account
          </p>

          <div className="flex w-full flex-col gap-2">
            <label
              htmlFor="bo-username"
              className="font-sans text-[11px] font-medium tracking-[0.88px] text-text-label"
            >
              USERNAME / CIN
            </label>
            <input
              id="bo-username"
              name="username"
              type="text"
              placeholder="Username or CIN"
              autoComplete="username"
              spellCheck={false}
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (formError) setFormError(null);
              }}
              disabled={submitting}
              aria-invalid={formError !== null}
              className="w-full bg-white px-4 py-[14px] font-sans text-[14px] leading-none text-text-primary placeholder:text-text-faint outline-none transition-shadow duration-150 ease-out focus-visible:ring-2 focus-visible:ring-brand-medium disabled:opacity-60"
            />
          </div>

          <div className="flex w-full flex-col gap-2">
            <label
              htmlFor="bo-password"
              className="font-sans text-[11px] font-medium tracking-[0.88px] text-text-label"
            >
              PASSWORD
            </label>
            <div className="flex w-full items-center gap-2.5 bg-white px-4 py-[14px] transition-shadow duration-150 ease-out focus-within:ring-2 focus-within:ring-brand-medium">
              <input
                id="bo-password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="password"
                autoComplete="current-password"
                spellCheck={false}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (formError) setFormError(null);
                }}
                disabled={submitting}
                aria-invalid={formError !== null}
                className="min-w-0 flex-1 bg-transparent font-sans text-[14px] leading-none text-text-primary placeholder:text-text-faint outline-none disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="flex size-5 shrink-0 items-center justify-center text-text-label transition-transform duration-150 ease-out hover:scale-[1.04]"
              >
                {showPassword ? (
                  <EyeOff size={20} strokeWidth={1.6} />
                ) : (
                  <Eye size={20} strokeWidth={1.6} />
                )}
              </button>
            </div>
            {formError && (
              <p
                role="alert"
                className="font-sans text-[12px] font-medium text-danger"
              >
                {formError}
              </p>
            )}
          </div>

          <div className="flex justify-end">
            <Link
              to="/forgot-password"
              className="font-sans text-[12px] text-brand-medium transition-colors hover:text-brand-dark hover:underline"
            >
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="group flex w-full items-center justify-center gap-2 overflow-hidden bg-brand-dark px-6 py-4 text-brand-cream transition-all duration-150 ease-out hover:scale-[1.02] hover:shadow-[0_4px_12px_rgba(14,27,44,0.10)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-medium focus-visible:ring-offset-2 focus-visible:ring-offset-brand-cream disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100 disabled:hover:shadow-none"
          >
            <span className="whitespace-nowrap font-sans text-[14px] font-semibold leading-none">
              {submitting ? "Signing in…" : "Sign in"}
            </span>
            {!submitting && (
              <span className="whitespace-nowrap font-sans text-[16px] font-bold leading-none transition-transform duration-150 ease-out group-hover:translate-x-1">
                {"→"}
              </span>
            )}
          </button>

          {/* Mobile-only footer (brand panel hides on <md) */}
          <p className="mt-2 text-center font-sans text-[11px] text-text-faint md:hidden">
            © 2026 PayZo · FSM · Proxym
          </p>
        </form>
      </main>
    </div>
  );
}
