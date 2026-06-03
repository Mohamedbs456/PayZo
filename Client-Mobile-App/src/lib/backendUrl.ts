import { env } from "@/lib/env";

// Profile pictures + counterpart avatars come back as server-relative paths
// (e.g. /api/v1/uploads/profile-pictures/{id}.jpg). The API base URL carries
// the host, so strip the path to get the origin and prepend it.
function backendOrigin(): string {
  try {
    return new URL(env.apiBaseUrl).origin;
  } catch {
    return env.apiBaseUrl;
  }
}

export function resolveBackendUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return `${backendOrigin()}${path.startsWith("/") ? "" : "/"}${path}`;
}
