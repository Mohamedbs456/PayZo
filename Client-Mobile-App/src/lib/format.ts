// TND display formatting — Tunisian style: space thousands, comma decimal,
// 3 fraction digits (millimes). Built manually so it doesn't depend on Hermes
// Intl locale data. Display only — never use the result for re-summation.
export function formatMoney(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const [int, frac] = Math.abs(safe).toFixed(3).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const sign = safe < 0 ? "-" : "";
  return `${sign}${grouped},${frac}`;
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function formatWelcomeDate(d: Date): string {
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()} · ${time}`;
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "recently";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return weeks === 1 ? "a week ago" : `${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? "a month ago" : `${months} months ago`;
  return "over a year ago";
}
