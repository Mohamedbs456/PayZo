import { env } from "@/lib/env";

/**
 * Resolves a server-relative URL (e.g. `/api/v1/uploads/...`) into an
 * absolute URL pointing at the backend origin. The backend returns
 * paths starting with `/api/v1/...` for served files; the browser would
 * otherwise resolve those against the Vite dev origin (`localhost:5173`)
 * where no static handler exists.
 *
 * Usage: `<img src={resolveBackendUrl(me.profilePictureUrl)} />`
 *
 * Pass-throughs:
 *  - empty / null  → returns input unchanged
 *  - already absolute (`http://`, `https://`, `data:`, `blob:`) → unchanged
 */
export function resolveBackendUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (/^(?:https?:|data:|blob:)/i.test(url)) return url;
  // env.apiBaseUrl is e.g. "http://localhost:8081/api/v1" — strip the
  // path part to get the bare origin, so a server-relative `/api/v1/...`
  // doesn't end up double-prefixed.
  const origin = new URL(env.apiBaseUrl).origin;
  return origin + (url.startsWith("/") ? url : "/" + url);
}
