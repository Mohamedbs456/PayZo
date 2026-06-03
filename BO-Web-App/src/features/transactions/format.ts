/**
 * Shared formatters used across the transactions feature. Kept tiny on
 * purpose — anything more complex (relative time, grouping headers) lives
 * inline in the component that needs it.
 */

export function formatAmount(raw: string | null | undefined): string {
  if (raw == null || raw === "") return "—";
  const n = Number(raw);
  if (Number.isNaN(n)) return raw;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return formatDateTime(iso);
}

import { formatRibDisplay } from "@/lib/rib";

export function formatAccountNumber(raw: string | null | undefined): string {
  if (!raw) return "—";
  const s = raw.replace(/\s+/g, "");
  // 20-digit Tunisian RIB → BB AAA NNNNNNNNNNNNN CC.
  if (s.length === 20 && /^\d+$/.test(s)) {
    return formatRibDisplay(s);
  }
  // Legacy 12-digit account numbers — keep the older 4-4-4 grouping so any
  // pre-RIB rows still surfaced from history don't render as one long blob.
  if (s.length === 12 && /^\d+$/.test(s)) {
    return `${s.slice(0, 4)} ${s.slice(4, 8)} ${s.slice(8, 12)}`;
  }
  return raw;
}
