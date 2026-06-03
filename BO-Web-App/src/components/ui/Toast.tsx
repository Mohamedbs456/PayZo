import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Check, X, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/cn";

export type ToastTier = "success" | "danger" | "warning" | "info" | "neutral";

interface ToastInput {
  tier?: ToastTier;
  message: string;
  /** Auto-dismiss in ms (default 3000). */
  duration?: number;
}

interface ActiveToast extends ToastInput {
  id: string;
  tier: ToastTier;
  duration: number;
}

interface ToastContextValue {
  showToast: (input: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_VISIBLE = 3;
const DEFAULT_DURATION = 3000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const handle = timers.current.get(id);
    if (handle) {
      clearTimeout(handle);
      timers.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    (input: ToastInput) => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;
      const tier = input.tier ?? "neutral";
      const duration = input.duration ?? DEFAULT_DURATION;
      const next: ActiveToast = { ...input, id, tier, duration };

      setToasts((list) => {
        const trimmed = list.length >= MAX_VISIBLE ? list.slice(1) : list;
        return [...trimmed, next];
      });

      const handle = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, handle);
    },
    [dismiss],
  );

  useEffect(
    () => () => {
      const handles = Array.from(timers.current.values());
      timers.current.clear();
      handles.forEach((h) => clearTimeout(h));
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast() must be used inside <ToastProvider>");
  }
  return ctx;
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ActiveToast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      className="pointer-events-none fixed bottom-8 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2"
      role="region"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

const TIER_ICON_COLOR: Record<ToastTier, string> = {
  success: "text-positive",
  danger: "text-negative",
  warning: "text-[#cf821a]",
  info: "text-text-faint",
  neutral: "",
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ActiveToast;
  onDismiss: () => void;
}) {
  const Icon = iconForTier(toast.tier);
  return (
    <div
      role={toast.tier === "danger" ? "alert" : "status"}
      className={cn(
        "pointer-events-auto flex max-w-[480px] items-center gap-2.5 rounded-xl bg-text-primary px-4 py-3",
        "font-sans text-[13px] font-medium text-brand-cream shadow-[0_8px_24px_-6px_rgba(0,0,0,0.32)]",
        "transition-all duration-200 ease-out",
      )}
    >
      {Icon && (
        <Icon
          className={cn("size-4 shrink-0", TIER_ICON_COLOR[toast.tier])}
          strokeWidth={2}
        />
      )}
      <p className="min-w-0 flex-1">{toast.message}</p>
      {toast.tier === "danger" && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="flex shrink-0 items-center justify-center rounded text-brand-cream/60 transition-colors duration-150 hover:text-brand-cream"
        >
          <X className="size-3.5" strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

function iconForTier(tier: ToastTier) {
  switch (tier) {
    case "success":
      return Check;
    case "danger":
      return X;
    case "warning":
      return AlertTriangle;
    case "info":
      return Info;
    default:
      return null;
  }
}
