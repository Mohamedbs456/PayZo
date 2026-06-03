import { useQuery } from "@tanstack/react-query";
import { getProfile, type ClientProfile } from "@/features/me/api";
import { useAuthStore } from "@/store/authStore";

export function useMe() {
  const authed = useAuthStore((s) => s.authed);
  const userId = useAuthStore((s) => s.userId);
  const q = useQuery({
    queryKey: ["me", userId],
    queryFn: getProfile,
    enabled: authed && !!userId,
    staleTime: 60_000,
  });
  return { me: q.data ?? null, loading: q.isLoading, error: q.error, refetch: q.refetch };
}

export function deriveInitials(me: ClientProfile | null): string {
  if (!me) return "?";
  const f = me.firstName?.trim()[0];
  const l = me.lastName?.trim()[0];
  if (f && l) return (f + l).toUpperCase();
  if (f) return f.toUpperCase();
  return (me.username ?? "?").slice(0, 2).toUpperCase();
}
