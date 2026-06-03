import { useEffect } from "react";

const SESSION_KEY = "payzo.client.session.v1";

/**
 * Cross-tab session sync. The `storage` event fires on every OTHER tab when
 * sessionStorage / localStorage changes — but the spec only delivers it for
 * localStorage in most browsers. Since our tokens live in sessionStorage,
 * cross-tab propagation isn't free; we use the BroadcastChannel API instead
 * and fall back to a no-op when it's not available (older Safari).
 *
 * Triggered scenarios:
 *   - User signs out in tab A → tab B sees the broadcast and reloads to /login.
 *   - User logs in (different account) in tab A → tab B reloads so the cached
 *     MeProvider can't render the previous user's data.
 *
 * Why a full reload instead of programmatic navigate: the ToastProvider,
 * MeProvider, and router state could all be holding the previous user's
 * data. A reload is the safest one-shot reset.
 */
const CHANNEL_NAME = "payzo.client.session";

export function broadcastSessionChange(kind: "logout" | "login"): void {
  if (typeof window === "undefined") return;
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({ kind });
    channel.close();
  } catch {
    // BroadcastChannel can throw in private/incognito modes — best-effort.
  }
}

export function useCrossTabLogout(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof BroadcastChannel === "undefined") return;

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
    } catch {
      return;
    }

    const onMessage = (event: MessageEvent) => {
      const kind = (event.data as { kind?: string } | null)?.kind;
      if (kind === "logout" || kind === "login") {
        // The session in THIS tab may already be empty (logout) or stale
        // (login). Always force a clean reload onto the public root.
        window.location.assign("/");
      }
    };

    // Belt-and-braces: localStorage `storage` event fires across tabs for
    // free, so if a future change moves the session token to localStorage
    // (e.g. PWA "remember me" mode) this listener already covers it. The
    // check on the key name prevents reacting to unrelated localStorage
    // changes (theme, locale, etc.).
    const onStorage = (event: StorageEvent) => {
      if (event.key === SESSION_KEY && event.newValue === null) {
        window.location.assign("/");
      }
    };

    channel.addEventListener("message", onMessage);
    window.addEventListener("storage", onStorage);

    return () => {
      channel?.removeEventListener("message", onMessage);
      window.removeEventListener("storage", onStorage);
      channel?.close();
    };
  }, []);
}
