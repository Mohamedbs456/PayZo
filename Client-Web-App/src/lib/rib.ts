// 20-digit Tunisian RIB: BB AAA NNNNNNNNNNNNN CC
// 2-digit numeric bank code + 3-digit branch + 13-digit account body + 2-digit mod-97 check.

export function normalizeRib(s: string): string {
  return s.replace(/\s+/g, "");
}

// Mod-97 chunked arithmetic — JS Number can't safely hold 20-digit ints.
export function isValidRib(input: string | null | undefined): boolean {
  if (!input) return false;
  const s = normalizeRib(input);
  if (!/^\d{20}$/.test(s)) return false;
  let r = 0;
  for (let i = 0; i < s.length; i++) {
    r = (r * 10 + (s.charCodeAt(i) - 48)) % 97;
  }
  return r === 0;
}

export function formatRibDisplay(s: string | null | undefined): string {
  if (!s) return "";
  const n = normalizeRib(s);
  if (n.length !== 20) return s;
  return `${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5, 18)} ${n.slice(18, 20)}`;
}

// Live-format input as the user types: groups of 2 / 3 / 13 / 2.
export function formatRibInputLive(s: string): string {
  const n = s.replace(/\D/g, "").slice(0, 20);
  let out = n.slice(0, 2);
  if (n.length > 2) out += " " + n.slice(2, 5);
  if (n.length > 5) out += " " + n.slice(5, 18);
  if (n.length > 18) out += " " + n.slice(18, 20);
  return out;
}

// 2-digit numeric bank code = first two digits of the normalized RIB.
export function ribBankNumericCode(s: string | null | undefined): string | null {
  if (!s) return null;
  const n = normalizeRib(s);
  return /^\d{20}$/.test(n) ? n.slice(0, 2) : null;
}
