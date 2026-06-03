import { create } from "zustand";

// The profile picture is stored at a fixed path ({id}.jpg, overwritten on
// change), so the URL never changes and Android's image cache serves a stale
// copy. This token is appended as ?v=. It starts unique per app launch (so a
// photo changed on another device shows on next launch) and is bumped after an
// in-app upload, which forces every avatar to re-fetch.
interface PhotoVersionState {
  version: number;
  bump: () => void;
}

export const usePhotoVersion = create<PhotoVersionState>((set) => ({
  version: Date.now(),
  bump: () => set({ version: Date.now() }),
}));

export function withPhotoVersion(url: string | null, version: number): string | null {
  if (!url) return null;
  return `${url}${url.includes("?") ? "&" : "?"}v=${version}`;
}
