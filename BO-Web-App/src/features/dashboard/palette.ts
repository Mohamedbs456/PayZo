/**
 * Dashboard chart palette — single source of truth for every donut, pie,
 * multi-line, and bank-color assignment across the backoffice.
 *
 * Two disjoint sets:
 *   - CHART_COLORS (20): used for bank slices and any series-by-bank chart.
 *     Holds 15 active banks + 5 reserve so the palette doesn't need to
 *     change when a new bank is added.
 *   - STAFF_BAR_COLORS (3): used for the STAFF card's Admins/Analysts/Banks
 *     bars. Disjoint from CHART_COLORS so a bank donut and the staff bars
 *     never share a tone on the same screen.
 *
 * Ordering of CHART_COLORS is deliberate: adjacent indices contrast
 * heavily (light/dark, warm/cool) so consecutive donut slices stay visually
 * distinct without any per-chart shuffling.
 */

export const CHART_COLORS: readonly string[] = [
  "#6f1d1b", // 1  burgundy red
  "#adc178", // 2  vivid sage
  "#432818", // 3  espresso
  "#ffe6a7", // 4  pale yellow
  "#99582a", // 5  rust
  "#a7cdbd", // 6  pale teal
  "#7f5539", // 7  saddle brown
  "#869d7a", // 8  sage green
  "#8b5d33", // 9  caramel
  "#ede0d4", // 10 cream
  "#6c584c", // 11 dark warm brown
  "#bbe1c3", // 12 pale mint
  "#91785d", // 13 taupe
  "#bb9457", // 14 khaki gold
  "#414833", // 15 forest dark
  "#e1bb80", // 16 warm tan light
  "#685634", // 17 dark olive
  "#a68a64", // 18 tan
  "#656d4a", // 19 olive green
  "#727d71", // 20 grey-green
] as const;

export const STAFF_BAR_COLORS = {
  admins: "#6d4c3d",   // dark warm brown
  analysts: "#806443", // mid brown
  banks: "#a98467",    // warm tan
} as const;

/**
 * Pick a chart color by index, wrapping over CHART_COLORS so callers don't
 * need to handle out-of-range indices.
 */
export function chartColorAt(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}

/**
 * Explicit bank-code → palette-index pinning. Guarantees zero collisions
 * across the 15 known Tunisian banks (vs. the previous hash-based mapping
 * which collided on BFT/ZTB, AMEN/BNA, and the 3-way ABC/BH/BIAT).
 *
 * The mapping lives here as the source of truth so charts stay consistent
 * across the dashboard, transactions table, fraud-alerts queue, etc.
 * Slots 15..19 are intentionally left for the hash fallback below.
 */
const BANK_COLOR_INDEX: Record<string, number> = {
  ABC: 0,
  ALB: 1,
  AMEN: 2,
  ATB: 3,
  ATJ: 4,
  BFT: 5,
  BH: 6,
  BIAT: 7,
  BNA: 8,
  BTE: 9,
  BTK: 10,
  CIB: 11,
  STB: 12,
  UIB: 13,
  ZTB: 14,
};

/**
 * Map a bank code (or any stable string key) to a chart color
 * deterministically. Same key → same color across renders.
 *
 * Known bank codes use the explicit pinning above. Unknown codes fall
 * back to a hash that lands in the reserved spare slots [15..19] — keeps
 * future banks from stealing a known bank's color.
 */
export function chartColorFor(key: string): string {
  const idx = BANK_COLOR_INDEX[key];
  if (idx !== undefined) return CHART_COLORS[idx];

  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  const spareStart = Object.keys(BANK_COLOR_INDEX).length;
  const spareCount = CHART_COLORS.length - spareStart;
  return CHART_COLORS[spareStart + (Math.abs(hash) % spareCount)];
}
