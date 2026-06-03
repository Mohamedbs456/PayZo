import { api } from "@/lib/api";

/* ─── Pre-transfer RIB / name resolution ────────────────────────────────── */
// Backend pair powering the new send-money UX (replaces username lookup).
// resolveRib: returns bank + masked initials of the account holder.
// verifyName: confirms the sender-typed first/last name against CBS, rate-limited.

export interface RibResolveResponse {
  bankCode: string;
  bankName: string;
  bankNumericCode: string;
  firstNameMasked: string;
  lastNameMasked: string;
  isPayZoUser: boolean;
}

export interface NameVerifyResponse {
  matched: boolean;
  attemptsRemaining: number;
}

export function resolveRib(rib: string) {
  return api.post<RibResolveResponse>("/client/transfers/resolve-rib", { rib });
}

export function verifyName(rib: string, firstName: string, lastName: string) {
  return api.post<NameVerifyResponse>("/client/transfers/verify-name", {
    rib,
    firstName,
    lastName,
  });
}

/* ─── PayZo-username resolution (D53) ───────────────────────────────────── */
// Shortcut path for PayZo-to-PayZo transfers when the sender knows the
// recipient's @username but not their RIB. Backend resolves to the
// recipient's `defaultAccountId` and skips server-side name re-verification
// (username = identity proof). Rate-limited to 30 calls/hour/sender.

export interface UsernameResolveResponse {
  username: string;
  firstName: string;
  lastName: string;
  profilePictureUrl: string | null;
  trustScore: number;
  accountNumberMasked: string;
  bankCode: string;
  bankName: string;
}

export function resolveUsername(username: string) {
  return api.post<UsernameResolveResponse>(
    "/client/transfers/resolve-username",
    { username },
  );
}

/* ─── Initiate transfer ─────────────────────────────────────────────────── */
// Tri-shape body — exactly one of (beneficiaryId, payzoUsername, manual triple)
// must be set. The backend enforces this via @AssertTrue.

export interface ManualTransferRequest {
  sourceAccountNumber: string;
  destRib: string;
  destFirstName: string;
  destLastName: string;
  saveBeneficiary?: boolean;
  beneficiaryNickname?: string;
  amount: number;
  motif?: string;
}

export interface SavedBeneficiaryTransferRequest {
  sourceAccountNumber: string;
  beneficiaryId: string;
  amount: number;
  motif?: string;
}

export interface PayZoUsernameTransferRequest {
  sourceAccountNumber: string;
  payzoUsername: string;
  amount: number;
  motif?: string;
}

export type InitiateTransferRequest =
  | ManualTransferRequest
  | SavedBeneficiaryTransferRequest
  | PayZoUsernameTransferRequest;

export interface InitiateTransferResponse {
  transactionId: string;
  otpSentAt: string;
  maskedPhone: string;
}

export function initiateTransfer(req: InitiateTransferRequest) {
  return api.post<InitiateTransferResponse>("/client/transfers", req);
}

/* ─── Confirm transfer OTP ──────────────────────────────────────────────── */

export interface ConfirmTransferOtpRequest {
  otpCode: string;
}

export function confirmTransferOtp(transactionId: string, otpCode: string) {
  return api.post<void>(
    `/client/transfers/${transactionId}/confirm-otp`,
    { otpCode } satisfies ConfirmTransferOtpRequest,
  );
}

/* ─── Resend transfer OTP ───────────────────────────────────────────────── */
// Re-issue the OTP for a PENDING_OTP transfer. Backend enforces a 60s
// rate-limit on the (cin, TRANSFER_CONFIRMATION) pair — calling faster
// returns a 4xx with errorCode that the caller surfaces as a toast.

export function resendTransferOtp(transactionId: string) {
  return api.post<void>(`/client/transfers/${transactionId}/resend-otp`);
}

/* ─── Internal (between-my-accounts) transfer ───────────────────────────── */
// Source + dest are the sender's own 20-digit RIBs. No fraud-scoring, no OTP.

export interface InternalTransferRequest {
  sourceAccountNumber: string;
  destAccountNumber: string;
  amount: number;
}

export function executeInternalTransfer(req: InternalTransferRequest) {
  return api.post<{ transactionId: string }>(
    "/client/transfers/internal",
    req,
  );
}
