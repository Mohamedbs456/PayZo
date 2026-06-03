import { api } from "@/lib/api/client";

// Pre-transfer RIB / name resolution. resolveRib returns the bank + masked
// holder initials; verifyName confirms the sender-typed name against CBS
// (rate-limited server-side).

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

// PayZo-username resolution (D53). Resolves to the recipient's default account
// and returns name + avatar + trust score for the confirmation card.

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
  return api.post<UsernameResolveResponse>("/client/transfers/resolve-username", {
    username,
  });
}

// Tri-shape initiate body — exactly one of (beneficiaryId, payzoUsername,
// manual triple) is set. The backend enforces this via @AssertTrue.

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

export function confirmTransferOtp(transactionId: string, otpCode: string) {
  return api.post<void>(`/client/transfers/${transactionId}/confirm-otp`, {
    otpCode,
  });
}

// Re-issue the OTP for a PENDING_OTP transfer. 60s rate-limit enforced server-side.
export function resendTransferOtp(transactionId: string) {
  return api.post<void>(`/client/transfers/${transactionId}/resend-otp`);
}
