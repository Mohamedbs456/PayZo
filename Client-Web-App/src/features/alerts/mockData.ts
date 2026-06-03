import type { ClientAlert } from "@/features/dashboard/api";

const NOW = Date.now();

function daysAgoAt(n: number, h: number, m: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

/**
 * Three demo alerts matching the Figma frame (208:2). Pending +
 * Approved-with-friction + Rejected covers every visual state of the
 * `<AlertCard>` component.
 */
export const DEMO_ALERT_LIST: ClientAlert[] = [
  // ─── Pending analyst review (HIGH risk) ────────────────────────────
  {
    id: "alert-1",
    transactionId: "tx-202",
    transactionReference: "TX-2026-05-01-0388",
    counterpartName: "Yassine Lakhdar",
    counterpartUsername: "yassine.lakhdar",
    amount: 8400,
    riskLevel: "HIGH",
    status: "PENDING_ANALYST",
    createdAt: daysAgoAt(1, 20, 2),
    reason: null,
    sourceMaskedAccount: "BIAT ••8421",
    destMaskedAccount: "STB ••9947",
    sourceBankCode: "BIAT",
    destBankCode: "STB",
    mlReasons: [
      "Amount is 12× larger than your usual transfer",
      "First time sending to this recipient",
      "Sent outside your usual hours (after 20:00)",
    ],
  },

  // ─── Approved with small trust friction (MED risk) ─────────────────
  {
    id: "alert-2",
    transactionId: "tx-401",
    transactionReference: "TX-2026-04-28-0512",
    counterpartName: "Sara Mansouri",
    counterpartUsername: "sara.mansouri",
    amount: 3200,
    riskLevel: "MED",
    status: "APPROVED",
    createdAt: daysAgoAt(4, 19, 14),
    reason: null,
    sourceMaskedAccount: "BIAT ••8421",
    destMaskedAccount: "BIAT ••4521",
    sourceBankCode: "BIAT",
    destBankCode: "BIAT",
    mlReasons: [
      "Amount is 4× larger than your usual transfer to this recipient",
      "Sent at an unusual time of day",
    ],
    decidedAt: daysAgoAt(4, 21, 30),
    decidedByName: "Mariem K., Fraud Analyst",
    decisionComment:
      "Verified — recipient confirmed via secondary channel. Pattern matches client's normal behavior. Releasing transfer.",
    trustDelta: -1,
  },

  // ─── Rejected by analyst (HIGH risk) ───────────────────────────────
  {
    id: "alert-3",
    transactionId: "tx-301",
    transactionReference: "TX-2026-04-30-0612",
    counterpartName: "Amira Hadj",
    counterpartUsername: "amira.h",
    amount: 12000,
    riskLevel: "HIGH",
    status: "REJECTED",
    createdAt: daysAgoAt(2, 18, 21),
    reason: null,
    sourceMaskedAccount: "BIAT ••8421",
    destMaskedAccount: "STB ••1828",
    sourceBankCode: "BIAT",
    destBankCode: "STB",
    mlReasons: [
      "Amount is 20× larger than your usual transfer",
      "Recipient account flagged in 2 prior fraud reports across other clients",
      "Same day, multiple high-value transfer attempts to different accounts",
    ],
    decidedAt: daysAgoAt(2, 19, 5),
    decidedByName: "Mariem K., Fraud Analyst",
    decisionComment:
      "Recipient account is part of an active fraud investigation. Transfer rejected — please contact us if you believe this is a mistake.",
    trustDelta: -10,
  },
];
