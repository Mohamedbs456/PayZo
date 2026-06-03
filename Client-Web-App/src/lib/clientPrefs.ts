/**
 * Local-only client preferences (theme + locale). Stored in
 * localStorage so they survive reloads but never sent to the BE — these
 * are pure UI choices.
 *
 * `applyDarkMode` is called once on app boot so the persisted choice
 * takes effect before any page renders, then re-called by the profile
 * panel toggle. The CSS overrides for `.dark` live in `index.css`.
 */

const DARK_KEY = "payzo.client.darkMode";
const LOCALE_KEY = "payzo.client.locale";

export type AppLocale = "en" | "fr";

export function getDarkMode(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(DARK_KEY) === "1";
}

export function applyDarkMode(enabled: boolean): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", enabled);
  localStorage.setItem(DARK_KEY, enabled ? "1" : "0");
}

export function getLocale(): AppLocale {
  if (typeof window === "undefined") return "en";
  const stored = localStorage.getItem(LOCALE_KEY);
  return stored === "fr" ? "fr" : "en";
}

export function setLocale(locale: AppLocale): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  localStorage.setItem(LOCALE_KEY, locale);
  // Notify any subscribers (the ProfilePanel listens so the visual
  // toggle reflects external changes too).
  window.dispatchEvent(new CustomEvent("payzo:locale-change", { detail: locale }));
}
