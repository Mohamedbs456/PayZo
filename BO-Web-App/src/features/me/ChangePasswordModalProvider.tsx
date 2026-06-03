import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";
import { ChangePasswordModal } from "@/features/me/components/ChangePasswordModal";

interface OpenOptions {
  /** When true, the modal can't be dismissed — no X, no Cancel, no
   *  backdrop click, no Escape. Used for the first-login flow where
   *  the user MUST rotate the emailed temp password before doing
   *  anything else. */
  forced?: boolean;
}

interface ChangePasswordModalContextValue {
  open: (options?: OpenOptions) => void;
  close: () => void;
}

const ChangePasswordModalContext =
  createContext<ChangePasswordModalContextValue | null>(null);

/**
 * Mounts a single ChangePasswordModal at the layout root so any component —
 * the sidebar profile menu, the profile page, dashboard — can pop it with
 * a one-line `useChangePasswordModal().open()` call. The modal blurs
 * whatever page is behind it instead of routing away from it.
 */
export function ChangePasswordModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [forced, setForced] = useState(false);

  const open = useCallback((options?: OpenOptions) => {
    setForced(!!options?.forced);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => {
    setIsOpen(false);
    // Reset `forced` on close so the next voluntary open() (from
    // ProfileMenu / ProfilePage) is dismissable again by default.
    setForced(false);
  }, []);

  return (
    <ChangePasswordModalContext.Provider value={{ open, close }}>
      {children}
      <ChangePasswordModal open={isOpen} forced={forced} onClose={close} />
    </ChangePasswordModalContext.Provider>
  );
}

export function useChangePasswordModal(): ChangePasswordModalContextValue {
  const ctx = useContext(ChangePasswordModalContext);
  if (!ctx) {
    throw new Error(
      "useChangePasswordModal() must be used inside <ChangePasswordModalProvider>",
    );
  }
  return ctx;
}
