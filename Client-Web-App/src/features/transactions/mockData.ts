import type { ClientTransaction } from "@/features/dashboard/api";

/**
 * Demo data for the Transactions page (Figma 207:2). Mirrors the 8 rows
 * shown in the design across 3 date groups (today / yesterday / 2 days
 * ago) so every status pill, direction, and amount-color rule has a
 * representative row to render.
 */

const NOW = Date.now();

function todayAt(h: number, m: number): string {
  const d = new Date(NOW);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function daysAgoAt(n: number, h: number, m: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

export const DEMO_TRANSACTIONS: ClientTransaction[] = [
  /* ─── TODAY ──────────────────────────────────────────────────────────── */
  {
    id: "tx-101",
    reference: "TX-2026-05-02-0142",
    type: "DEBIT",
    amount: 250,
    counterpartName: "Sara Mansouri",
    counterpartAccount: "001100004521",
    counterpartUsername: "sara.mansouri",
    description: "Lunch share",
    timestamp: todayAt(14, 32),
    status: "APPROVED",
    riskLevel: "LOW",
    sourceMaskedAccount: "BIAT ••8421",
    destMaskedAccount: "BIAT ••4521",
    sourceBankCode: "BIAT",
    destBankCode: "BIAT",
    mlScore: 0.18,
    finalStatusLabel: "Auto-Approved",
    otpConfirmedAt: todayAt(14, 32),
  },
  {
    id: "tx-102",
    reference: "TX-2026-05-02-0118",
    type: "CREDIT",
    amount: 120,
    counterpartName: "Karim Ben Ali",
    counterpartAccount: "030001281093",
    counterpartUsername: "karim.benali",
    description: "Coffee",
    timestamp: todayAt(11, 8),
    status: "APPROVED",
    riskLevel: "LOW",
    sourceMaskedAccount: "STB ••1093",
    destMaskedAccount: "BIAT ••8421",
    sourceBankCode: "STB",
    destBankCode: "BIAT",
    mlScore: 0.09,
    finalStatusLabel: "Auto-Approved",
    otpConfirmedAt: todayAt(11, 8),
  },
  {
    id: "tx-103",
    reference: "TX-2026-05-02-0094",
    type: "DEBIT",
    amount: 1500,
    counterpartName: null,
    counterpartAccount: "030001281093",
    description: null,
    timestamp: todayAt(9, 45),
    status: "APPROVED",
    riskLevel: null,
    sourceMaskedAccount: "BIAT ••8421",
    destMaskedAccount: "STB ••1093",
    sourceBankCode: "BIAT",
    destBankCode: "STB",
    internal: true,
    subtitleSuffix: "No OTP",
    finalStatusLabel: "Instant",
  },

  /* ─── YESTERDAY ──────────────────────────────────────────────────────── */
  {
    id: "tx-201",
    reference: "TX-2026-05-01-0421",
    type: "DEBIT",
    amount: 75,
    counterpartName: "Fatma Trabelsi",
    counterpartAccount: "012005555567",
    counterpartUsername: "fatma.trabelsi",
    description: "Movie tickets",
    timestamp: daysAgoAt(1, 21, 14),
    status: "PENDING_OTP",
    riskLevel: "LOW",
    sourceMaskedAccount: "BIAT ••8421",
    destMaskedAccount: "ATB ••5567",
    sourceBankCode: "BIAT",
    destBankCode: "ATB",
    subtitleSuffix: "Awaiting OTP",
    finalStatusLabel: "Awaiting OTP",
  },
  {
    id: "tx-202",
    reference: "TX-2026-05-01-0388",
    type: "DEBIT",
    amount: 8400,
    counterpartName: "Yassine Lakhdar",
    counterpartAccount: "030001239947",
    counterpartUsername: "yassine.lakhdar",
    description: "Equipment purchase",
    timestamp: daysAgoAt(1, 20, 2),
    status: "SUSPENDED_PENDING_ANALYST",
    riskLevel: "HIGH",
    sourceMaskedAccount: "BIAT ••8421",
    destMaskedAccount: "STB ••9947",
    sourceBankCode: "BIAT",
    destBankCode: "STB",
    subtitleSuffix: "Flagged HIGH risk",
    mlScore: 0.83,
    finalStatusLabel: "Held by ML",
    otpConfirmedAt: daysAgoAt(1, 20, 1),
  },
  {
    id: "tx-203",
    reference: "TX-2026-05-01-0294",
    type: "CREDIT",
    amount: 300,
    counterpartName: "Mohamed Khalil",
    counterpartAccount: "020003003324",
    counterpartUsername: "m.khalil",
    description: "Refund",
    timestamp: daysAgoAt(1, 16, 55),
    status: "APPROVED",
    riskLevel: "LOW",
    sourceMaskedAccount: "BNA ••3324",
    destMaskedAccount: "BIAT ••8421",
    sourceBankCode: "BNA",
    destBankCode: "BIAT",
    mlScore: 0.07,
    finalStatusLabel: "Auto-Approved",
    otpConfirmedAt: daysAgoAt(1, 16, 54),
  },

  /* ─── 4 DAYS AGO — matched against alert-2 ───────────────────────────── */
  {
    id: "tx-401",
    reference: "TX-2026-04-28-0512",
    type: "DEBIT",
    amount: 3200,
    counterpartName: "Sara Mansouri",
    counterpartAccount: "001100004521",
    counterpartUsername: "sara.mansouri",
    description: "Apartment deposit",
    timestamp: daysAgoAt(4, 19, 14),
    status: "APPROVED",
    riskLevel: "MED",
    sourceMaskedAccount: "BIAT ••8421",
    destMaskedAccount: "BIAT ••4521",
    sourceBankCode: "BIAT",
    destBankCode: "BIAT",
    subtitleSuffix: "Released after analyst review",
    mlScore: 0.54,
    finalStatusLabel: "Approved · Analyst",
    otpConfirmedAt: daysAgoAt(4, 19, 13),
  },

  /* ─── 2 DAYS AGO ─────────────────────────────────────────────────────── */
  {
    id: "tx-301",
    reference: "TX-2026-04-30-0612",
    type: "DEBIT",
    amount: 12000,
    counterpartName: "Amira Hadj",
    counterpartAccount: "030009991828",
    counterpartUsername: "amira.h",
    description: "Investment transfer",
    timestamp: daysAgoAt(2, 18, 21),
    status: "REJECTED",
    riskLevel: "HIGH",
    sourceMaskedAccount: "BIAT ••8421",
    destMaskedAccount: "STB ••1828",
    sourceBankCode: "BIAT",
    destBankCode: "STB",
    subtitleSuffix: "Rejected by analyst",
    mlScore: 0.91,
    finalStatusLabel: "Rejected · Analyst",
    otpConfirmedAt: daysAgoAt(2, 18, 19),
  },
  {
    id: "tx-302",
    reference: "TX-2026-04-30-0455",
    type: "CREDIT",
    amount: 500,
    counterpartName: null,
    counterpartAccount: "001118282345",
    description: null,
    timestamp: daysAgoAt(2, 10, 30),
    status: "APPROVED",
    riskLevel: null,
    sourceMaskedAccount: "STB ••1093",
    destMaskedAccount: "BIAT ••8421",
    sourceBankCode: "STB",
    destBankCode: "BIAT",
    internal: true,
    subtitleSuffix: "Instant",
    finalStatusLabel: "Instant",
  },
];
