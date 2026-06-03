import { useEffect, useRef } from "react";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { env } from "@/lib/env";
import { useAuthStore } from "@/store/authStore";

const POLL_MS = 30_000;
const TIMEOUT_MS = 8_000;

// A down backend can drop the connection (no RST), so fetch hangs forever
// without an explicit timeout — the query would stay pending and never trip
// the gate. Abort on either the timeout or the query's own cancellation.
async function probe(querySignal: AbortSignal): Promise<true> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const onCancel = () => ctrl.abort();
  querySignal.addEventListener("abort", onCancel, { once: true });
  try {
    const res = await fetch(env.healthUrl, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`health ${res.status}`);
    const body = (await res.json()) as { status?: string };
    if (body.status !== "UP") throw new Error(`health ${body.status ?? "unknown"}`);
    return true;
  } finally {
    clearTimeout(timer);
    querySignal.removeEventListener("abort", onCancel);
  }
}

// Polls the backend every 30s. Two consecutive failures route to maintenance;
// the first success after a down spell routes back. Mounted once near the root.
export function useHealthCheck() {
  const q = useQuery({
    queryKey: ["health"],
    queryFn: ({ signal }) => probe(signal),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    retry: false,
    gcTime: POLL_MS,
  });

  const failures = useRef(0);
  const down = useRef(false);

  useEffect(() => {
    if (!q.isSuccess) return;
    failures.current = 0;
    if (down.current) {
      down.current = false;
      router.replace(useAuthStore.getState().authed ? "/(tabs)/dashboard" : "/login");
    }
  }, [q.isSuccess, q.dataUpdatedAt]);

  useEffect(() => {
    if (!q.isError) return;
    failures.current += 1;
    if (failures.current >= 2 && !down.current) {
      down.current = true;
      router.replace("/maintenance");
    }
  }, [q.isError, q.errorUpdatedAt]);
}
