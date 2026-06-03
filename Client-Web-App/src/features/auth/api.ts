import { api } from "@/lib/api/client";

/**
 * Identifier resolution (D23).
 * The login form accepts CIN OR PayZo username. Keycloak only knows usernames
 * (which equal the CIN), so we ask the backend to resolve a username to the
 * canonical KC username before ROPC. Returns 404 if the identifier doesn't
 * match an ACTIVE / ACCEPTED client — surfaced to the caller as ApiError.
 */
export interface ResolveIdentifierResponse {
  /** The Keycloak `username` (always equals the CIN). */
  keycloakUsername: string;
}

export function resolveClientIdentifier(identifier: string) {
  return api.post<ResolveIdentifierResponse>(
    "/auth/resolve-client-identifier",
    { identifier },
  );
}

/**
 * OTP-gated login (D27, channel split).
 * After ROPC mints a JWT, the user lands on /login/channel to pick where
 * to receive the code. That page calls `previewLoginChannels` to get the
 * masked email/phone, then `initiateLoginOtp({ accessToken, channel })`
 * with the chosen one. The verify page (/login/verify) reads the channel
 * + masked destination from router state and submits the 6 digits via
 * `verifyLoginOtp`.
 */
import type { OtpChannel } from "@/features/auth/components/ChannelCard";
export type { OtpChannel } from "@/features/auth/components/ChannelCard";

export interface LoginOtpInitiateRequest {
  accessToken: string;
  channel: OtpChannel;
}

export function initiateLoginOtp(args: { accessToken: string; channel: OtpChannel }) {
  return api.post<void>(
    "/auth/login/initiate-otp",
    { accessToken: args.accessToken, channel: args.channel } satisfies LoginOtpInitiateRequest,
    {
      // The KC token is the auth context here, not a session bearer.
      token: args.accessToken,
    },
  );
}

export interface PreviewLoginChannelsResponse {
  userId: string;
  /** "ah•••@gmail.com" or null if the user has no email on file. */
  maskedEmail: string | null;
  /** "+216 71 2** ***" or null if the user has no phone on file. */
  maskedPhone: string | null;
}

/**
 * Preview the masked email/phone for the login channel chooser. <b>Does
 * not</b> dispatch an OTP — that fires after the user picks a channel
 * and `initiateLoginOtp` runs.
 */
export function previewLoginChannels(accessToken: string) {
  return api.post<PreviewLoginChannelsResponse>(
    "/auth/login/preview-channels",
    { accessToken },
    { token: accessToken },
  );
}

export interface LoginOtpVerifyRequest {
  userId: string;
  otpCode: string;
}

export interface LoginOtpVerifyResponse {
  sessionConfirmed: boolean;
}

export function verifyLoginOtp(
  args: LoginOtpVerifyRequest,
  accessToken: string,
) {
  return api.post<LoginOtpVerifyResponse>(
    "/auth/login/verify-otp",
    args,
    { token: accessToken },
  );
}

// OTP resend, shared across login / register / password-reset.
export type OtpPurpose =
  | "REGISTRATION"
  | "LOGIN"
  | "PASSWORD_RESET"
  | "TRANSFER_CONFIRMATION"
  | "PASSWORD_CHANGE";

export interface OtpResendRequest {
  identifier: string;
  purpose: OtpPurpose;
}

export function resendOtp(req: OtpResendRequest) {
  return api.post<void>("/auth/otp/resend", req);
}

/**
 * Registration (Figma 77:4 / 77:66 / 94:5 / 77:126).
 * The 4-frame sign-up flow drives three calls:
 *   1. previewRegistration(cin)        — returns the CBS-sourced profile
 *      plus masked email/phone so the channel picker can render.
 *   2. sendRegistrationOtp(cin, ch)    — dispatches the OTP via the chosen
 *      channel (no body change so backend can rate-limit per CIN).
 *   3. submitRegistration(cin, otp)    — verifies the OTP and creates the
 *      PENDING_APPROVAL user. Successful response means the user can move
 *      to the "submitted" screen.
 *
 * NOTE: backend currently only exposes /auth/register/step1 and /step2 —
 * the preview + send-otp split is a partner BE task. Until those land,
 * the FE will surface clear "not implemented" errors so we don't
 * silently misbehave.
 */
export interface RegistrationPreviewResponse {
  firstName: string;
  lastName: string;
  cin: string;
  email: string;          // already masked by the BE, e.g. ahmed.b***@example.tn
  phone: string;          // already masked, e.g. +216 71 234 ***
  governorate: string;
}

export function previewRegistration(cin: string) {
  return api.post<RegistrationPreviewResponse>("/auth/register/preview", { cin });
}

export type RegistrationChannel = "EMAIL" | "SMS";

export interface SendRegistrationOtpRequest {
  cin: string;
  channel: RegistrationChannel;
}

export function sendRegistrationOtp(req: SendRegistrationOtpRequest) {
  return api.post<void>("/auth/register/send-otp", req);
}

export interface SubmitRegistrationRequest {
  cin: string;
  otpCode: string;
}

export function submitRegistration(req: SubmitRegistrationRequest) {
  return api.post<void>("/auth/register/step2", req);
}

/**
 * Registration status polling (Figma TBD).
 * After submission, the user can land on the confirmation screen and the
 * underlying user is in PENDING_APPROVAL. The backend exposes a status
 * endpoint we'll poll on the dashboard once the client logs in for the
 * first time, but the sign-up flow itself only needs the value to confirm
 * the submission landed. Surface here so the page can use it directly.
 */
export interface RegistrationStatusResponse {
  status: "PENDING_APPROVAL" | "ACCEPTED" | "REJECTED" | "ACTIVE" | "BLOCKED";
}

export function getRegistrationStatus(cin: string) {
  return api.get<RegistrationStatusResponse>(`/auth/register/status/${cin}`);
}

/**
 * First-login forced password rotation (Figma 77:179).
 * Triggered on the dashboard when /client/profile returns
 * `firstLoginCompleted: false`. The user has just authed with their
 * temp password (issued by the admin via email) — this single call
 * updates the Keycloak credential AND flips the flag, so a single
 * round-trip resolves the gate.
 *
 * NOTE for the partner BE: the original /auth/first-login-complete
 * endpoint took no body. To match the Figma flow (only "new password"
 * + "confirm", no "current password" field — the JWT is the proof of
 * identity here) the endpoint should accept `{ newPassword }` and
 * push that into Keycloak before flipping `firstLoginCompleted` and
 * status → ACTIVE. If you'd rather keep the existing PATCH
 * /clients/me/password shape, swap this wrapper to call that with
 * a back-channel current-password (we'd need to stash it from the
 * login form), then call /first-login-complete with no body.
 */
export interface FirstLoginCompleteRequest {
  newPassword: string;
}

export function completeFirstLogin(req: FirstLoginCompleteRequest) {
  return api.post<void>("/auth/first-login-complete", req);
}

/**
 * Forgot password (Figma 277:2 / 277:42 / 277:102).
 * Three-call flow per DECISIONS.md D44 / Impact 20:
 *   1. forgotPasswordStart(cin)        — backend dispatches OTP via the
 *      delivery channel it picks (email by default). Returns the masked
 *      destination so the verify page can render "Code sent to a•••@…".
 *      Always 200 to avoid leaking which CINs exist (anti-enumeration).
 *   2. forgotPasswordVerifyOtp(cin,otp) — returns a short-lived reset
 *      token (5-min JWT, scope: PASSWORD_RESET).
 *   3. forgotPasswordReset(token,pw)   — sets the new password in
 *      Keycloak. Token is single-use.
 */
export interface ForgotPasswordStartResponse {
  /** "EMAIL" | "SMS" — the channel the backend chose. */
  deliveryChannel: "EMAIL" | "SMS";
  /** Already-masked destination for the verify-page caption. */
  maskedDestination: string;
}

export function forgotPasswordStart(cin: string) {
  return api.post<ForgotPasswordStartResponse>("/auth/forgot-password/start", {
    cin,
  });
}

export interface ForgotPasswordVerifyResponse {
  resetToken: string;
}

export function forgotPasswordVerifyOtp(cin: string, otpCode: string) {
  return api.post<ForgotPasswordVerifyResponse>(
    "/auth/forgot-password/verify-otp",
    { cin, otpCode },
  );
}

export function forgotPasswordReset(resetToken: string, newPassword: string) {
  return api.post<void>("/auth/forgot-password/reset", {
    resetToken,
    newPassword,
  });
}
