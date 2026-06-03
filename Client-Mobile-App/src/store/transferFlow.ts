import { create } from "zustand";
import type {
  RibResolveResponse,
  UsernameResolveResponse,
} from "@/features/transfers/api";
import type { BeneficiaryResponse } from "@/features/transfers/beneficiariesApi";

// One of three mutually-exclusive recipient shapes the backend accepts on
// POST /client/transfers. Steps 1-2 live in the transfer tab; the OTP and
// outcome steps are separate modal routes, so the wizard state lives here
// rather than in component state (expo-router unmounts screens on navigation).
export type RecipientMode = "manual" | "beneficiary" | "username";

export interface TransferFlowState {
  mode: RecipientMode | null;

  rib: string;
  firstName: string;
  lastName: string;
  resolved: RibResolveResponse | null;
  saveBeneficiary: boolean;
  beneficiaryNickname: string;

  beneficiary: BeneficiaryResponse | null;

  payzoUsername: string;
  usernameResolved: UsernameResolveResponse | null;

  sourceAccountNumber: string;
  amount: string;
  motif: string;

  transactionId: string | null;
  otpMaskedPhone: string;

  // RIB handed back from the QR scanner modal, read once by the RIB tab.
  scannedRib: string | null;

  // Username handed back from the QR scanner (it auto-detects RIB vs @username),
  // read once by the username tab.
  scannedUsername: string | null;

  // Set when the beneficiaries modal launches a transfer — the transfer tab
  // consumes it on focus to jump straight to step 2.
  preselectPending: boolean;

  setManual: (sel: {
    rib: string;
    firstName: string;
    lastName: string;
    resolved: RibResolveResponse;
    saveBeneficiary: boolean;
    beneficiaryNickname: string;
  }) => void;
  setBeneficiary: (b: BeneficiaryResponse) => void;
  setUsername: (sel: { username: string; resolved: UsernameResolveResponse }) => void;
  setAmount: (a: { sourceAccountNumber: string; amount: string; motif: string }) => void;
  setOtpInfo: (info: { transactionId: string; otpMaskedPhone: string }) => void;
  setScannedRib: (rib: string) => void;
  consumeScannedRib: () => string | null;
  setScannedUsername: (username: string) => void;
  consumeScannedUsername: () => string | null;
  startWithBeneficiary: (b: BeneficiaryResponse) => void;
  consumePreselect: () => boolean;
  reset: () => void;
}

const initial = {
  mode: null,
  rib: "",
  firstName: "",
  lastName: "",
  resolved: null,
  saveBeneficiary: false,
  beneficiaryNickname: "",
  beneficiary: null,
  payzoUsername: "",
  usernameResolved: null,
  sourceAccountNumber: "",
  amount: "",
  motif: "",
  transactionId: null,
  otpMaskedPhone: "",
  scannedRib: null,
  scannedUsername: null,
  preselectPending: false,
} satisfies Partial<TransferFlowState>;

export const useTransferFlow = create<TransferFlowState>((set, get) => ({
  ...initial,

  setManual: (sel) =>
    set({
      mode: "manual",
      rib: sel.rib,
      firstName: sel.firstName,
      lastName: sel.lastName,
      resolved: sel.resolved,
      saveBeneficiary: sel.saveBeneficiary,
      beneficiaryNickname: sel.beneficiaryNickname,
      beneficiary: null,
      payzoUsername: "",
      usernameResolved: null,
    }),

  setBeneficiary: (b) =>
    set({
      mode: "beneficiary",
      rib: b.accountNumber,
      firstName: "",
      lastName: "",
      resolved: null,
      beneficiary: b,
      saveBeneficiary: false,
      beneficiaryNickname: "",
      payzoUsername: "",
      usernameResolved: null,
    }),

  setUsername: (sel) =>
    set({
      mode: "username",
      rib: sel.resolved.accountNumberMasked,
      firstName: sel.resolved.firstName,
      lastName: sel.resolved.lastName,
      resolved: null,
      beneficiary: null,
      saveBeneficiary: false,
      beneficiaryNickname: "",
      payzoUsername: sel.username,
      usernameResolved: sel.resolved,
    }),

  setAmount: (a) =>
    set({
      sourceAccountNumber: a.sourceAccountNumber,
      amount: a.amount,
      motif: a.motif,
    }),

  setOtpInfo: (info) =>
    set({ transactionId: info.transactionId, otpMaskedPhone: info.otpMaskedPhone }),

  setScannedRib: (rib) => set({ scannedRib: rib }),

  consumeScannedRib: () => {
    const v = get().scannedRib;
    if (v) set({ scannedRib: null });
    return v;
  },

  setScannedUsername: (username) => set({ scannedUsername: username }),

  consumeScannedUsername: () => {
    const v = get().scannedUsername;
    if (v) set({ scannedUsername: null });
    return v;
  },

  startWithBeneficiary: (b) => {
    get().reset();
    get().setBeneficiary(b);
    set({ preselectPending: true });
  },

  consumePreselect: () => {
    const v = get().preselectPending;
    if (v) set({ preselectPending: false });
    return v;
  },

  reset: () => set({ ...initial }),
}));

export function recipientDisplayName(s: TransferFlowState): string {
  if (s.mode === "beneficiary") return s.beneficiary?.displayName ?? "";
  if (s.mode === "username") {
    return `${s.usernameResolved?.firstName ?? ""} ${s.usernameResolved?.lastName ?? ""}`.trim();
  }
  return `${s.firstName} ${s.lastName}`.trim();
}

export function recipientInitials(s: TransferFlowState): string {
  if (s.mode === "beneficiary") return s.beneficiary?.initials ?? "··";
  const first = s.mode === "username" ? s.usernameResolved?.firstName ?? "" : s.firstName;
  const last = s.mode === "username" ? s.usernameResolved?.lastName ?? "" : s.lastName;
  const f = first.trim().charAt(0).toUpperCase();
  const l = last.trim().charAt(0).toUpperCase();
  return f + l || "··";
}

export function recipientBankLabel(s: TransferFlowState): string | null {
  if (s.mode === "beneficiary") return s.beneficiary?.bankCode ?? null;
  if (s.mode === "username") return s.usernameResolved?.bankCode ?? null;
  return s.resolved?.bankCode ?? null;
}
