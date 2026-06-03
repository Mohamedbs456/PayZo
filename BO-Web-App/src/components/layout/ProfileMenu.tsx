import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronUp, Globe, LogOut, Moon, Sun, User, Lock } from "lucide-react";
import { session } from "@/lib/auth/session";
import { kcLogout } from "@/lib/auth/keycloak";
import { useChangePasswordModal } from "@/features/me/ChangePasswordModalProvider";

interface ProfileMenuProps {
  fullName: string;
  initials: string;
  roleLabel: string;
  /** Resolved (absolute) URL of the user's profile picture. Empty string
   *  means "no picture yet" — fall back to the initials avatar. */
  profilePictureUrl?: string;
}

type Lang = "EN" | "FR";

/**
 * Sidebar profile button + pull-up panel. The button stays visually identical
 * to the previous static one (avatar tile + name + role + chevron); the panel
 * pops up *above* it and offers:
 *
 *   - View profile (placeholder route — not yet built)
 *   - Change password (placeholder route — not yet built)
 *   - Language toggle: EN / FR (persists to localStorage; reload picks it up)
 *   - Dark mode switch (persists; toggles `dark` class on <html>)
 *   - Sign out (clears the session and redirects to /login)
 *
 * Click-outside + Escape close the panel.
 */
export function ProfileMenu({ fullName, initials, roleLabel, profilePictureUrl }: ProfileMenuProps) {
  const navigate = useNavigate();
  const changePasswordModal = useChangePasswordModal();
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<Lang>(() => readLang());
  const [dark, setDark] = useState<boolean>(() => readDark());
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Apply dark-mode class + persist whenever it flips.
  useEffect(() => {
    if (dark) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
    try {
      localStorage.setItem("payzo.bo.theme", dark ? "dark" : "light");
    } catch {
      /* noop — sessionStorage may be unavailable in some browsers */
    }
  }, [dark]);

  useEffect(() => {
    try {
      localStorage.setItem("payzo.bo.lang", lang);
    } catch {
      /* noop */
    }
  }, [lang]);

  // Click-outside + Escape close.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const node = wrapperRef.current;
      if (node && !node.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleSignOut = () => {
    const s = session.get();
    if (s) void kcLogout(s.tokens.refreshToken);
    session.clear();
    navigate("/login", { replace: true });
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 overflow-hidden rounded-xl border border-brand-cream-2 bg-white py-3 pl-3 pr-2.5 shadow-[0px_2px_6px_0px_rgba(0,0,0,0.06)] transition-all duration-150 ease-out hover:scale-[1.01] hover:shadow-[0px_4px_12px_rgba(14,27,44,0.10)]"
      >
        <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-medium font-sans text-[12px] font-bold text-brand-cream">
          {profilePictureUrl ? (
            <img
              src={profilePictureUrl}
              alt={fullName}
              className="size-full object-cover"
            />
          ) : (
            initials
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col items-start gap-px overflow-hidden whitespace-nowrap">
          <span className="font-sans text-[13px] font-semibold text-text-primary">
            {fullName}
          </span>
          <span className="font-sans text-[11px] font-medium text-brand-medium">
            {roleLabel}
          </span>
        </span>
        <ChevronUp
          className={[
            "size-3.5 shrink-0 text-text-faint transition-transform duration-150 ease-out",
            open ? "" : "rotate-180",
          ].join(" ")}
          strokeWidth={2.4}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Profile"
          // Pulls up above the trigger — `bottom-[calc(100%+8px)]` anchors to
          // the top edge of the button. Width matches the button so it lines
          // up cleanly inside the sidebar's 240px column.
          className="absolute bottom-[calc(100%+8px)] left-0 right-0 z-40 overflow-hidden rounded-xl bg-white shadow-[0_24px_64px_-12px_rgba(42,31,20,0.30)] ring-1 ring-brand-cream-2"
        >
          <div className="py-1">
            <MenuItem
              icon={<User className="size-4" aria-hidden />}
              onClick={() => {
                setOpen(false);
                navigate("/profile");
              }}
            >
              View profile
            </MenuItem>
            <MenuItem
              icon={<Lock className="size-4" aria-hidden />}
              onClick={() => {
                setOpen(false);
                changePasswordModal.open();
              }}
            >
              Change password
            </MenuItem>

            <Divider />

            {/* Language toggle — segmented control, 2 options */}
            <div className="px-3 py-2">
              <div className="mb-1.5 flex items-center gap-2 font-sans text-[10px] font-bold uppercase tracking-[1.2px] text-text-label">
                <Globe className="size-3.5 text-text-muted" aria-hidden />
                Language
              </div>
              <div className="flex items-center gap-1 rounded-full bg-brand-cream/60 p-1">
                {(["EN", "FR"] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLang(l)}
                    className={[
                      "flex-1 rounded-full px-2.5 py-1 font-sans text-[11px] font-semibold transition-colors duration-150 ease-out",
                      lang === l
                        ? "bg-white text-text-primary shadow-[0_1px_2px_rgba(42,31,20,0.10)]"
                        : "text-text-muted hover:text-text-primary",
                    ].join(" ")}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Dark-mode toggle — switch-style row */}
            <button
              type="button"
              onClick={() => setDark((d) => !d)}
              role="switch"
              aria-checked={dark}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left font-sans text-[12px] text-text-primary transition-colors duration-150 ease-out hover:bg-brand-cream/40"
            >
              {dark ? (
                <Moon className="size-4 text-text-muted" aria-hidden />
              ) : (
                <Sun className="size-4 text-text-muted" aria-hidden />
              )}
              <span className="flex-1">Dark mode</span>
              <Switch on={dark} />
            </button>

            <Divider />

            <MenuItem
              icon={<LogOut className="size-4 text-negative" aria-hidden />}
              danger
              onClick={handleSignOut}
            >
              Sign out
            </MenuItem>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Building blocks ─────────────────────────────────────────────────── */

function MenuItem({
  icon,
  children,
  danger,
  onClick,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={[
        "flex w-full items-center gap-2.5 px-3 py-2 text-left font-sans text-[12px] transition-colors duration-150 ease-out",
        danger
          ? "text-negative hover:bg-negative/5"
          : "text-text-primary hover:bg-brand-cream/40",
      ].join(" ")}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

function Divider() {
  return <div className="mx-3 my-1 h-px bg-brand-cream-2/60" aria-hidden />;
}

function Switch({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={[
        "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-150 ease-out",
        on ? "bg-brand-dark" : "bg-brand-cream-2",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block size-3 rounded-full bg-white shadow-sm transition-transform duration-150 ease-out",
          on ? "translate-x-3.5" : "translate-x-0.5",
        ].join(" ")}
      />
    </span>
  );
}

/* ─── Persisted preferences ───────────────────────────────────────────── */

function readLang(): Lang {
  try {
    const v = localStorage.getItem("payzo.bo.lang");
    return v === "FR" ? "FR" : "EN";
  } catch {
    return "EN";
  }
}

function readDark(): boolean {
  try {
    return localStorage.getItem("payzo.bo.theme") === "dark";
  } catch {
    return false;
  }
}
