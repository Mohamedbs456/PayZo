import { resolveBackendUrl } from "@/lib/backendUrl";

interface StaffAvatarProps {
  firstName: string;
  lastName: string;
  profilePictureUrl?: string | null;
  size?: number;
}

/**
 * Round avatar for an admin/analyst. Mirrors ClientAvatar (initials fallback +
 * profile picture when present) but with a darker base tone so the staff
 * tables visually read as "internal" vs the client list.
 *
 * Picture URLs come back from the BE as server-relative paths
 * ({@code /api/v1/uploads/profile-pictures/{id}.jpg}); we hand them to
 * {@link resolveBackendUrl} so the browser resolves them against the API
 * origin instead of the FE dev origin (where the static handler doesn't
 * exist and every request 404s).
 */
export function StaffAvatar({
  firstName,
  lastName,
  profilePictureUrl,
  size = 36,
}: StaffAvatarProps) {
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

  if (profilePictureUrl) {
    return (
      <img
        src={resolveBackendUrl(profilePictureUrl)}
        alt={`${firstName} ${lastName}`}
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-brand-medium font-sans font-bold text-white"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      aria-label={`${firstName} ${lastName}`}
    >
      {initials}
    </div>
  );
}
