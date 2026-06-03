import { useRef, useState } from "react";
import {
  Calendar,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Pencil,
  Phone,
  ShieldCheck,
  User,
} from "lucide-react";
import { uploadProfilePicture } from "@/features/me/api";
import { useBoMe } from "@/features/me/BoMeProvider";
import { useChangePasswordModal } from "@/features/me/ChangePasswordModalProvider";
import { useToast } from "@/components/ui/Toast";
import { resolveBackendUrl } from "@/lib/backendUrl";

/**
 * Backoffice profile page (D45). Live data — pulled from `/api/v1/me`,
 * which returns every field stored on the shared `users` row (phone,
 * governorate, address, DOB, profile picture, role, status, timestamps).
 */
export function ProfilePage() {
  const { me, error, patch } = useBoMe();
  const [uploadingPic, setUploadingPic] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const changePasswordModal = useChangePasswordModal();
  const { showToast } = useToast();

  const handlePickFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so picking the SAME file later still fires onChange.
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      showToast({ tier: "danger", message: "JPEG, PNG, or WEBP only." });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast({ tier: "danger", message: "File exceeds 5 MB." });
      return;
    }
    setUploadingPic(true);
    try {
      const url = await uploadProfilePicture(file);
      // Broadcast to BoMeProvider so the sidebar avatar updates too.
      patch({ profilePictureUrl: url });
      showToast({ tier: "success", message: "Profile picture updated." });
    } catch (cause) {
      console.error("[me] profile picture upload failed", cause);
      showToast({
        tier: "danger",
        message: cause instanceof Error ? cause.message : "Upload failed",
      });
    } finally {
      setUploadingPic(false);
    }
  };

  if (error) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-5">
        <p className="font-sans text-[13px] font-semibold text-negative">
          Couldn't load your profile
        </p>
        <p className="font-sans text-[12px] text-text-muted">{error.message}</p>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="flex h-full w-full items-center justify-center gap-2 p-5 font-sans text-[12px] text-text-muted">
        <Loader2 className="size-3 animate-spin" aria-hidden />
        Loading profile…
      </div>
    );
  }

  const fullName = `${me.firstName} ${me.lastName}`.trim();
  const initials = (
    (me.firstName?.[0] ?? "") + (me.lastName?.[0] ?? "")
  ).toUpperCase() ||
    me.username?.slice(0, 2).toUpperCase() ||
    "??";

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4 overflow-y-auto p-5">
      <div className="flex shrink-0 items-baseline gap-2">
        <span className="font-sans text-[14px] font-bold text-text-primary">
          My profile
        </span>
        <span className="font-sans text-[12px] text-text-muted">
          {me.status}
        </span>
      </div>

      <div className="flex flex-col gap-6 rounded-2xl bg-white p-6 shadow-[0_1px_2px_0_rgba(42,31,20,0.04),0_8px_24px_-6px_rgba(42,31,20,0.10)]">
        {/* Hidden file input — triggered by the avatar's pen overlay. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileSelected}
        />

        {/* Avatar + headline */}
        <div className="flex items-center gap-4">
          {/* Click to upload. Hovering reveals a "pen" overlay; while
              uploading we swap it for a spinner and lock the trigger. */}
          <button
            type="button"
            onClick={handlePickFile}
            disabled={uploadingPic}
            aria-label="Change profile picture"
            className="group relative size-16 shrink-0 overflow-hidden rounded-full ring-1 ring-brand-cream-2/70 transition-shadow duration-150 hover:ring-2 hover:ring-brand-dark/30 disabled:cursor-wait"
          >
            {me.profilePictureUrl ? (
              <img
                src={resolveBackendUrl(me.profilePictureUrl)}
                alt={fullName}
                width={64}
                height={64}
                className="size-full object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center bg-brand-medium font-sans text-[22px] font-bold text-brand-cream">
                {initials}
              </div>
            )}
            {/* Hover scrim + icon. Always visible during an upload. */}
            <span
              className={[
                "absolute inset-0 flex items-center justify-center bg-black/45 transition-opacity duration-150",
                uploadingPic
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100",
              ].join(" ")}
              aria-hidden
            >
              {uploadingPic ? (
                <Loader2 className="size-5 animate-spin text-white" />
              ) : (
                <Pencil className="size-4 text-white" strokeWidth={2.4} />
              )}
            </span>
          </button>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="font-sans text-[18px] font-bold text-text-primary">
              {fullName}
            </span>
            <span className="font-mono text-[12px] text-text-muted">
              @{me.username ?? "—"}
            </span>
          </div>
          <div className="ml-auto flex flex-col items-end gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-cream-2/60 px-3 py-1 font-sans text-[11px] font-bold uppercase tracking-[0.6px] text-text-primary">
              <ShieldCheck className="size-3.5 text-brand-medium" aria-hidden />
              {me.role}
            </span>
          </div>
        </div>

        <div className="h-px bg-brand-cream-2/60" aria-hidden />

        {/* Info grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field icon={<User className="size-4" aria-hidden />} label="Username">
            <span className="font-mono text-[13px] text-text-primary">
              {me.username ?? "—"}
            </span>
          </Field>
          <Field icon={<Mail className="size-4" aria-hidden />} label="Email">
            <span className="font-sans text-[13px] text-text-primary">
              {me.email}
            </span>
          </Field>
          <Field icon={<Phone className="size-4" aria-hidden />} label="Phone">
            <span className="font-sans text-[13px] text-text-primary">
              {me.phone ?? "—"}
            </span>
          </Field>
          <Field icon={<MapPin className="size-4" aria-hidden />} label="Governorate">
            <span className="font-sans text-[13px] text-text-primary">
              {me.governorate ?? "—"}
            </span>
          </Field>
          <Field icon={<MapPin className="size-4" aria-hidden />} label="Address">
            <span className="font-sans text-[13px] text-text-primary">
              {me.address ?? "—"}
            </span>
          </Field>
          <Field icon={<Calendar className="size-4" aria-hidden />} label="Date of birth">
            <span className="font-sans text-[13px] text-text-primary">
              {me.dateOfBirth ?? "—"}
            </span>
          </Field>
        </div>

        <div className="h-px bg-brand-cream-2/60" aria-hidden />

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => changePasswordModal.open()}
            className="flex h-9 items-center gap-1.5 rounded-full bg-brand-dark px-4 font-sans text-[12px] font-semibold text-brand-cream transition-all duration-150 ease-out hover:scale-[1.02] hover:bg-brand-dark/90"
          >
            <Lock className="size-3.5" aria-hidden />
            Change password
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 font-sans text-[10px] font-bold uppercase tracking-[1px] text-text-label">
        <span className="text-brand-medium">{icon}</span>
        {label}
      </span>
      <div>{children}</div>
    </div>
  );
}
