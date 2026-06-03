import type {
  ClientAccount,
  ClientAlert,
  ClientAlertSummary,
  ClientTransaction,
} from "@/features/dashboard/api";

/**
 * Mock dashboard payloads used by `?demo`. Bank breakdown matches the
 * Accounts-page Figma frame (117:2): BIAT 5,840 / BNA 4,645 / STB 690
 * → 11,175 TND total across 9 accounts. Recent transactions and
 * alerts are unchanged (4 tx, 2 alerts).
 */

const PAST = (daysAgoN: number, h: number, m: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgoN);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

// All RIBs below are 20-digit Tunisian RIBs with valid mod-97 checksums
// so the client-side RIB validator (lib/rib.ts) accepts them in demo mode.

export const DEMO_ACCOUNTS: ClientAccount[] = [
  // ─── BIAT (08) — 3 accounts, 5,840 TND total ───────────────────────
  {
    accountNumber: "08001000000000401211",
    bankCode: "BIAT",
    bankName: "Banque Internationale Arabe de Tunisie",
    type: "CHECKING",
    balance: 3200,
    bankActive: true,
    branch: "BIAT . Avenue Bourguiba",
    openedAt: "2019-08-04",
    lastActivityAt: PAST(0, 14, 32),
  },
  {
    accountNumber: "08001000000001828275",
    bankCode: "BIAT",
    bankName: "Banque Internationale Arabe de Tunisie",
    type: "SAVINGS",
    balance: 1940,
    bankActive: true,
    branch: "BIAT . Bennane",
    openedAt: "2022-03-14",
    lastActivityAt: PAST(1, 17, 8),
  },
  {
    accountNumber: "08001000000009947078",
    bankCode: "BIAT",
    bankName: "Banque Internationale Arabe de Tunisie",
    type: "CHECKING",
    balance: 700,
    bankActive: true,
    branch: "BIAT . Lac 2",
    openedAt: "2024-02-19",
    lastActivityAt: PAST(4, 9, 15),
  },

  // ─── AMEN (07) — 3 accounts, 4,645 TND total ───────────────────────
  {
    accountNumber: "07001000000002200359",
    bankCode: "AMEN",
    bankName: "Amen Bank",
    type: "CHECKING",
    balance: 2200,
    bankActive: true,
    branch: "Amen . El Manar",
    openedAt: "2020-11-22",
    lastActivityAt: PAST(0, 11, 8),
  },
  {
    accountNumber: "07001000000001900823",
    bankCode: "AMEN",
    bankName: "Amen Bank",
    type: "SAVINGS",
    balance: 1500,
    bankActive: true,
    branch: "Amen . El Manar",
    openedAt: "2021-06-30",
    lastActivityAt: PAST(7, 16, 41),
  },
  {
    accountNumber: "07001000000007721017",
    bankCode: "AMEN",
    bankName: "Amen Bank",
    type: "CHECKING",
    balance: 945,
    bankActive: true,
    branch: "Amen . Ariana",
    openedAt: "2023-09-12",
    lastActivityAt: PAST(2, 12, 22),
  },

  // ─── STB (10) — 3 accounts, 690 TND total ──────────────────────────
  {
    accountNumber: "10001000000002810901",
    bankCode: "STB",
    bankName: "Société Tunisienne de Banque",
    type: "CHECKING",
    balance: 350,
    bankActive: true,
    branch: "STB . Tunis Centre",
    openedAt: "2018-04-17",
    lastActivityAt: PAST(5, 10, 50),
  },
  {
    accountNumber: "10001000000001994743",
    bankCode: "STB",
    bankName: "Société Tunisienne de Banque",
    type: "SAVINGS",
    balance: 240,
    bankActive: true,
    branch: "STB . Tunis Centre",
    openedAt: "2018-04-17",
    lastActivityAt: PAST(12, 14, 5),
  },
  {
    accountNumber: "10001000000006712144",
    bankCode: "STB",
    bankName: "Société Tunisienne de Banque",
    type: "CHECKING",
    balance: 100,
    bankActive: true,
    branch: "STB . Sousse",
    openedAt: "2024-07-02",
    lastActivityAt: PAST(20, 8, 3),
  },
];

export const DEMO_TOTAL_BALANCE = DEMO_ACCOUNTS.reduce(
  (acc, a) => acc + a.balance,
  0,
);

const NOW = Date.now();
const today = (h: number, m: number) => {
  const d = new Date(NOW);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const daysAgo = (n: number, h: number, m: number) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

export const DEMO_RECENT_TRANSACTIONS: ClientTransaction[] = [
  {
    id: "tx-1",
    reference: "TRX-9F2A18C0",
    type: "CREDIT",
    amount: 250,
    counterpartName: "Sara Mansouri",
    counterpartAccount: "010001111111",
    description: "Lunch split",
    timestamp: today(14, 32),
    status: "APPROVED",
    riskLevel: "LOW",
  },
  {
    id: "tx-2",
    reference: "TRX-3D81FB42",
    type: "DEBIT",
    amount: 1200,
    counterpartName: "Karim Bouaziz",
    counterpartAccount: "020002222222",
    description: "Rent",
    timestamp: today(11, 8),
    status: "APPROVED",
    riskLevel: "LOW",
  },
  {
    id: "tx-3",
    reference: "TRX-7E0A2C99",
    type: "DEBIT",
    amount: 4500,
    counterpartName: "Yacine Laribi",
    counterpartAccount: "030003333333",
    description: "Equipment",
    timestamp: daysAgo(1, 22, 14),
    status: "APPROVED",
    riskLevel: "MED",
  },
  {
    id: "tx-4",
    reference: "TRX-1A4F8D03",
    type: "CREDIT",
    amount: 750,
    counterpartName: "Fatma Trabelsi",
    counterpartAccount: "010004444444",
    description: "Refund",
    timestamp: daysAgo(2, 9, 45),
    status: "APPROVED",
    riskLevel: "LOW",
  },
];

export const DEMO_ALERTS: ClientAlert[] = [
  {
    id: "alert-1",
    transactionId: "tx-pending-1",
    transactionReference: "TRX-A82F",
    counterpartName: "Sara Mansouri",
    amount: 1800,
    riskLevel: "MED",
    status: "PENDING_ANALYST",
    createdAt: new Date(NOW - 12 * 60 * 1000).toISOString(),
    reason: null,
  },
  {
    id: "alert-2",
    transactionId: "tx-3",
    transactionReference: "TRX-7E0A",
    counterpartName: "Yacine Laribi",
    amount: 4500,
    riskLevel: "HIGH",
    status: "REJECTED",
    createdAt: daysAgo(1, 22, 14),
    reason: "Pattern matches a known fraud cluster, flagged destination.",
  },
];

export const DEMO_ALERT_SUMMARY: ClientAlertSummary = {
  alerts: DEMO_ALERTS,
  totalCount: 7,
  underReviewCount: 1,
  rejectedCount: 1,
};
