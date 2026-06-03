import { api } from "@/lib/api/client";

export type OtpChannel = "EMAIL" | "SMS";

export type OtpPurpose =
  | "REGISTRATION"
  | "LOGIN"
  | "PASSWORD_RESET"
  | "TRANSFER_CONFIRMATION"
  | "PASSWORD_CHANGE";

// --- Login (D23 identifier resolve + D27 OTP channel split) ---

export interface ResolveIdentifierResponse {
  keycloakUsername: string;
}

export function resolveClientIdentifier(identifier: string) {
  return api.post<ResolveIdentifierResponse>("/auth/resolve-client-identifier", { identifier });
}

export interface PreviewLoginChannelsResponse {
  userId: string;
  maskedEmail: string | null;
  maskedPhone: string | null;
}

export function previewLoginChannels(accessToken: string) {
  return api.post<PreviewLoginChannelsResponse>(
    "/auth/login/preview-channels",
    { accessToken },
    { token: accessToken },
  );
}

export function initiateLoginOtp(args: { accessToken: string; channel: OtpChannel }) {
  return api.post<void>(
    "/auth/login/initiate-otp",
    { accessToken: args.accessToken, channel: args.channel },
    { token: args.accessToken },
  );
}

export interface LoginOtpVerifyResponse {
  sessionConfirmed: boolean;
}

export function verifyLoginOtp(args: { userId: string; otpCode: string }, accessToken: string) {
  return api.post<LoginOtpVerifyResponse>("/auth/login/verify-otp", args, { token: accessToken });
}

export function resendOtp(req: { identifier: string; purpose: OtpPurpose }) {
  return api.post<void>("/auth/otp/resend", req);
}

// --- Registration (4-screen flow) ---

export interface RegistrationPreviewResponse {
  firstName: string;
  lastName: string;
  cin: string;
  email: string;
  phone: string;
  governorate: string;
}

export function previewRegistration(cin: string) {
  return api.post<RegistrationPreviewResponse>("/auth/register/preview", { cin });
}

export function sendRegistrationOtp(req: { cin: string; channel: OtpChannel }) {
  return api.post<void>("/auth/register/send-otp", req);
}

export function submitRegistration(req: { cin: string; otpCode: string }) {
  return api.post<void>("/auth/register/step2", req);
}

export interface RegistrationStatusResponse {
  status: "PENDING_APPROVAL" | "ACCEPTED" | "REJECTED" | "ACTIVE" | "BLOCKED";
}

export function getRegistrationStatus(cin: string) {
  return api.get<RegistrationStatusResponse>(`/auth/register/status/${cin}`);
}

// --- First-login forced rotation (D-flow: JWT is the proof of identity) ---

export function completeFirstLogin(req: { newPassword: string }) {
  return api.post<void>("/auth/first-login-complete", req);
}

// --- Forgot password (D44, three calls) ---

export interface ForgotPasswordStartResponse {
  deliveryChannel: OtpChannel;
  maskedDestination: string;
}

export function forgotPasswordStart(cin: string) {
  return api.post<ForgotPasswordStartResponse>("/auth/forgot-password/start", { cin });
}

export interface ForgotPasswordVerifyResponse {
  resetToken: string;
}

export function forgotPasswordVerifyOtp(cin: string, otpCode: string) {
  return api.post<ForgotPasswordVerifyResponse>("/auth/forgot-password/verify-otp", { cin, otpCode });
}

export function forgotPasswordReset(resetToken: string, newPassword: string) {
  return api.post<void>("/auth/forgot-password/reset", { resetToken, newPassword });
}
