import { resolveBackendUrl } from "@/lib/backendUrl";

/**
 * Round avatar — uses `profilePictureUrl` when present, otherwise a 2-letter
 * initials chip on a brand-cream-2 background. Sized 36px to fit the 56-ish
 * pixel row height in the clients table.
 *
 * The URL coming from the BE for client profile pictures is server-relative
 * (e.g. {@code /api/v1/uploads/profile-pictures/<id>.jpg}). We pass it
 * through {@code resolveBackendUrl} so the {@code <img>} element resolves
 * against the backend origin in dev (where the FE runs on a different
 * port) — without it, the picture only renders for the calling user via
 * the side channels that already prefixed it.
 */
interface ClientAvatarProps {
  firstName: string;
  lastName: string;
  profilePictureUrl: string | null;
  size?: number;
}

export function ClientAvatar({
  firstName,
  lastName,
  profilePictureUrl,
  size = 36,
}: ClientAvatarProps) {
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
      className="flex shrink-0 items-center justify-center rounded-full bg-brand-cream-2 font-sans font-bold text-brand-dark"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      aria-label={`${firstName} ${lastName}`}
    >
      {initials}
    </div>
  );
}
