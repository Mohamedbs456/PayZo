import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { PasswordField } from "@/components/ui/PasswordField";
import { DividerWithLabel } from "@/components/ui/DividerWithLabel";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api";
import { decodeJwt } from "@/lib/auth/jwt";
import {
  ropcLogin,
  InvalidCredentialsError,
  AccountDisabledError,
  KeycloakUnreachableError,
  KeycloakConfigError,
} from "@/lib/auth/keycloak";
import { previewLoginChannels, resolveClientIdentifier } from "@/features/auth/api";

interface LocationState {
  from?: string;
}

/**
 * Login credentials form (Figma node 74:5). On submit:
 *   1. POST /auth/resolve-client-identifier  — map username → KC username
 *   2. ROPC against /realms/clients/...      — mint access token
 *   3. POST /auth/login/preview-channels     — fetch masked email/phone
 *   4. Navigate to /login/channel with the access token + masked
 *      destinations in router state. The picker page then dispatches
 *      the OTP via `initiateLoginOtp({ accessToken, channel })` to the
 *      chosen channel only — never both.
 *
 * The session is NOT stored yet — we only persist after the OTP step
 * confirms (D27). That keeps an unconfirmed login from granting access
 * to client APIs.
 */
export function LoginForm() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;

    const trimmed = identifier.trim();
    if (!trimmed || !password) {
      setFormError("Enter your CIN or username, and your password.");
      return;
    }

    setFormError(null);
    setBusy(true);

    try {
      // 1) Resolve identifier (CIN or username) → canonical KC username.
      const { keycloakUsername } = await resolveClientIdentifier(trimmed);

      // 2) ROPC against the clients realm.
      const tokens = await ropcLogin(keycloakUsername, password);

      // 3) Fetch masked email/phone for the channel chooser. No OTP fires
      //    here — the picker page dispatches one once the user chooses.
      const claims = decodeJwt(tokens.access_token);
      const preview = await previewLoginChannels(tokens.access_token);

      // 4) Hand off to the channel chooser. The (unconfirmed) tokens
      //    follow through router state so the verify step can replay
      //    them; nothing is committed to sessionStorage yet.
      navigate("/login/channel", {
        state: {
          tokens,
          userId: preview.userId ?? claims.sub,
          identifier: trimmed,
          maskedEmail: preview.maskedEmail,
          maskedPhone: preview.maskedPhone,
          from: (location.state as LocationState | null)?.from,
        },
        replace: true,
      });
    } catch (err) {
      if (err instanceof InvalidCredentialsError) {
        setFormError("That CIN/username and password don't match.");
      } else if (err instanceof AccountDisabledError) {
        setFormError(
          "This account isn't active yet. If you just signed up, an admin will review it shortly.",
        );
      } else if (err instanceof ApiError && err.status === 404) {
        // resolveClientIdentifier didn't find an ACTIVE/ACCEPTED client.
        setFormError("That CIN/username and password don't match.");
      } else if (err instanceof KeycloakConfigError) {
        toast.showToast({
          tier: "danger",
          message:
            "Authentication is misconfigured. Please contact support if this persists.",
        });
      } else if (err instanceof KeycloakUnreachableError) {
        toast.showToast({
          tier: "danger",
          message: "Couldn't reach PayZo. Check your connection and try again.",
        });
      } else {
        toast.showToast({
          tier: "danger",
          message: "Something went wrong. Try again.",
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="flex w-full flex-col gap-5 lg:gap-7"
      noValidate
      aria-busy={busy}
    >
      <header className="flex flex-col gap-2">
        <h1 className="font-sans text-[clamp(24px,3vw,32px)] font-bold leading-tight tracking-tight text-text-primary">
          Welcome back
        </h1>
        <p className="font-sans text-[14px] text-text-secondary">
          Sign in to your PayZo account
        </p>
      </header>

      <TextField
        label="CIN or username"
        autoComplete="username"
        autoFocus
        spellCheck={false}
        autoCapitalize="off"
        placeholder="Enter your CIN or username"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        disabled={busy}
        required
      />

      <PasswordField
        label="Password"
        autoComplete="current-password"
        placeholder="••••••••••••"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={busy}
        required
        labelAdornment={
          <Link
            to="/forgot-password"
            className="font-sans text-[11px] font-semibold text-text-secondary transition-colors duration-150 ease-out hover:text-text-primary"
          >
            Forgot password?
          </Link>
        }
      />

      {formError && (
        <p
          role="alert"
          className="-mt-3 font-sans text-[13px] text-negative"
        >
          {formError}
        </p>
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        busy={busy}
        trailingIcon={<ArrowRight className="size-4" strokeWidth={2.2} aria-hidden />}
      >
        {busy ? "Signing in…" : "Sign in"}
      </Button>

      <DividerWithLabel>New to PayZo?</DividerWithLabel>

      <Link
        to="/signup"
        className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-border-strong bg-surface-card px-6 font-sans text-[14px] font-semibold text-text-primary transition-all duration-150 ease-out hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-soft"
      >
        Create an account
      </Link>
    </form>
  );
}
