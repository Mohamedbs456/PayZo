import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Search, SlidersHorizontal, X } from "lucide-react-native";
import { TopBar } from "@/components/layout/TopBar";
import { useColorScheme } from "@/hooks/useColorScheme";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/api/error";
import { useAuthStore } from "@/store/authStore";
import { getAccounts, type ClientTransaction } from "@/features/dashboard/api";
import { listTransactions } from "@/features/transactions/api";
import { TransactionRow } from "@/features/transactions/TransactionRow";

type TypeSeg = "ALL" | "SENT" | "RECEIVED" | "INTERNAL";
type StatusFilter = "ALL" | "APPROVED" | "PENDING" | "REJECTED" | "CANCELLED";
type OriginFilter = "ALL" | "PAYZO" | "EXTERNAL";
type PeriodFilter = "today" | "7d" | "30d" | "90d" | "all";

const TYPE_SEGMENTS: { value: TypeSeg; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "SENT", label: "Sent" },
  { value: "RECEIVED", label: "Received" },
  { value: "INTERNAL", label: "Internal" },
];
const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "APPROVED", label: "Approved" },
  { value: "PENDING", label: "Pending" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
];
const ORIGIN_OPTIONS: { value: OriginFilter; label: string }[] = [
  { value: "ALL", label: "All sources" },
  { value: "PAYZO", label: "PayZo" },
  { value: "EXTERNAL", label: "External" },
];
const PERIOD_OPTIONS: { value: PeriodFilter; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "all", label: "All time" },
];

const PAGE_SIZE = 20;

type Row = { kind: "header"; label: string } | { kind: "tx"; tx: ClientTransaction };

export default function TransactionsScreen() {
  const { colors } = useColorScheme();
  const authed = useAuthStore((s) => s.authed);
  const params = useLocalSearchParams<{ account?: string; ref?: string }>();
  const accountParam = typeof params.account === "string" ? params.account : undefined;
  const refParam = typeof params.ref === "string" ? params.ref : undefined;

  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [type, setType] = useState<TypeSeg>("ALL");
  const [bank, setBank] = useState("ALL");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [origin, setOrigin] = useState<OriginFilter>("ALL");
  const [period, setPeriod] = useState<PeriodFilter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [items, setItems] = useState<ClientTransaction[] | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingNext, setLoadingNext] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const listRef = useRef<FlatList<Row>>(null);

  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: getAccounts, enabled: authed });

  const bankOptions = useMemo(() => {
    const set = new Set<string>();
    (accountsQ.data ?? []).forEach((a) => set.add(a.bankCode));
    (items ?? []).forEach((t) => {
      if (t.sourceBankCode) set.add(t.sourceBankCode);
      if (t.destBankCode) set.add(t.destBankCode);
    });
    return Array.from(set).sort();
  }, [accountsQ.data, items]);

  const fetchPage = useCallback(
    (pageIdx: number) =>
      listTransactions({
        page: pageIdx,
        size: PAGE_SIZE,
        q: q.trim() || undefined,
        type,
        status,
        bank,
        period,
        origin,
        account: accountParam,
      }),
    [q, type, status, bank, period, origin, accountParam],
  );

  // Refetch from page 0 whenever a filter changes.
  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setPage(0);
    setHasMore(true);
    void (async () => {
      try {
        const res = await fetchPage(0);
        if (cancelled) return;
        setItems(res.content);
        setHasMore(res.content.length >= PAGE_SIZE);
      } catch (err) {
        if (cancelled) return;
        if (!(err instanceof ApiError)) throw err;
        setItems([]);
        setHasMore(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  async function loadNext() {
    if (loadingNext || !hasMore || items === null) return;
    setLoadingNext(true);
    const next = page + 1;
    try {
      const res = await fetchPage(next);
      if (res.content.length === 0) setHasMore(false);
      else {
        setItems((prev) => [...(prev ?? []), ...res.content]);
        setPage(next);
        setHasMore(res.content.length >= PAGE_SIZE);
      }
    } catch {
      setHasMore(false);
    } finally {
      setLoadingNext(false);
    }
  }

  const rows = useMemo<Row[]>(() => buildRows(items ?? []), [items]);

  // Auto-expand + scroll to the deep-linked ref row.
  useEffect(() => {
    if (!refParam || !items) return;
    const match = items.find((t) => t.reference === refParam);
    if (!match) return;
    setExpandedId(match.id);
    const idx = rows.findIndex((r) => r.kind === "tx" && r.tx.id === match.id);
    if (idx >= 0) {
      const handle = setTimeout(() => {
        listRef.current?.scrollToIndex({ index: idx, viewPosition: 0.3, animated: true });
      }, 150);
      return () => clearTimeout(handle);
    }
  }, [refParam, items, rows]);

  const activeFilterCount =
    (bank !== "ALL" ? 1 : 0) + (status !== "ALL" ? 1 : 0) + (origin !== "ALL" ? 1 : 0) + (period !== "all" ? 1 : 0);

  return (
    <View className="flex-1 bg-surface-soft">
      <TopBar title="History" />

      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(r, i) => (r.kind === "header" ? `h-${r.label}` : `t-${r.tx.id}-${i}`)}
        onEndReached={loadNext}
        onEndReachedThreshold={0.4}
        onScrollToIndexFailed={() => {}}
        ListHeaderComponent={
          <View className="gap-3 px-4 pb-2 pt-3">
            <View className="h-[44px] flex-row items-center gap-2.5 rounded-xl bg-positive-soft px-4">
              <Search size={18} color={colors.textMuted} strokeWidth={2} />
              <TextInput
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={() => setQ(draft)}
                returnKeyType="search"
                placeholder="Search reference, account, or name"
                placeholderTextColor={colors.textMuted}
                className="min-w-0 flex-1 p-0 font-sans text-[13px] text-text-primary"
              />
              {draft ? (
                <Pressable
                  onPress={() => {
                    setDraft("");
                    setQ("");
                  }}
                  accessibilityLabel="Clear search"
                  hitSlop={6}
                >
                  <X size={16} color={colors.textMuted} strokeWidth={2} />
                </Pressable>
              ) : null}
            </View>

            <View className="flex-row items-center gap-2">
              <View className="flex-1 flex-row gap-1 rounded-xl bg-surface-raised p-1">
                {TYPE_SEGMENTS.map((seg) => {
                  const active = seg.value === type;
                  return (
                    <Pressable
                      key={seg.value}
                      onPress={() => setType(seg.value)}
                      className={cn("h-8 flex-1 items-center justify-center rounded-lg", active && "bg-surface-card")}
                    >
                      <Text
                        className={cn(
                          "text-[12px]",
                          active ? "font-sans-semibold text-text-primary" : "font-sans-medium text-text-secondary",
                        )}
                      >
                        {seg.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Pressable
                onPress={() => setFiltersOpen((v) => !v)}
                accessibilityLabel="More filters"
                className={cn(
                  "size-10 items-center justify-center rounded-xl border",
                  activeFilterCount > 0 ? "border-accent bg-accent-soft" : "border-border-soft bg-surface-card",
                )}
              >
                <SlidersHorizontal
                  size={18}
                  color={activeFilterCount > 0 ? colors.accent : colors.textSecondary}
                  strokeWidth={2}
                />
              </Pressable>
            </View>

            {filtersOpen ? (
              <View className="gap-3 rounded-xl border border-border-soft bg-surface-card p-3">
                <FilterGroup
                  label="Bank"
                  value={bank}
                  options={[{ value: "ALL", label: "All banks" }, ...bankOptions.map((b) => ({ value: b, label: b }))]}
                  onChange={setBank}
                />
                <FilterGroup
                  label="Status"
                  value={status}
                  options={STATUS_OPTIONS}
                  onChange={(v) => setStatus(v as StatusFilter)}
                />
                <FilterGroup
                  label="Source"
                  value={origin}
                  options={ORIGIN_OPTIONS}
                  onChange={(v) => setOrigin(v as OriginFilter)}
                />
                <FilterGroup
                  label="Period"
                  value={period}
                  options={PERIOD_OPTIONS}
                  onChange={(v) => setPeriod(v as PeriodFilter)}
                />
              </View>
            ) : null}

            {accountParam ? (
              <Text className="font-sans text-[12px] text-text-secondary">
                Filtered to account ••{accountParam.slice(-4)}
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) =>
          item.kind === "header" ? (
            <View className="bg-surface-soft px-4 pb-1.5 pt-3">
              <Text className="font-sans-bold text-[11px] uppercase tracking-[0.08em] text-text-secondary">
                {item.label}
              </Text>
            </View>
          ) : (
            <View className="px-4">
              <View className="overflow-hidden rounded-[14px] border border-border-soft">
                <TransactionRow
                  tx={item.tx}
                  expanded={expandedId === item.tx.id}
                  onToggle={() => setExpandedId((cur) => (cur === item.tx.id ? null : item.tx.id))}
                />
              </View>
            </View>
          )
        }
        ItemSeparatorComponent={() => <View className="h-1.5" />}
        ListEmptyComponent={
          items === null ? (
            <View className="items-center py-16">
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : (
            <View className="items-center gap-2 px-6 py-16">
              <Text className="font-sans-semibold text-[15px] text-text-primary">
                No transactions match these filters.
              </Text>
              <Text className="text-center font-sans text-[13px] text-text-secondary">
                Adjust the filters or clear the search to see more.
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          items !== null && items.length > 0 ? (
            <View className="items-center py-5">
              {loadingNext ? (
                <ActivityIndicator color={colors.textMuted} />
              ) : hasMore ? (
                <Text className="font-sans text-[12px] text-text-muted">Scroll for more</Text>
              ) : (
                <Text className="font-sans text-[12px] text-text-muted">No more transactions to load.</Text>
              )}
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: 96 }}
      />
    </View>
  );
}

function FilterGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <View className="gap-1.5">
      <Text className="font-sans-bold text-[10px] uppercase tracking-[0.08em] text-text-muted">{label}</Text>
      <View className="flex-row flex-wrap gap-1.5">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(o.value)}
              className={cn(
                "h-8 items-center justify-center rounded-full border px-3",
                active ? "border-accent bg-accent" : "border-border-soft bg-surface-card",
              )}
            >
              <Text
                className={cn(
                  "text-[12px]",
                  active ? "font-sans-semibold text-accent-foreground" : "font-sans-medium text-text-secondary",
                )}
              >
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function buildRows(transactions: ClientTransaction[]): Row[] {
  const out: Row[] = [];
  let lastKey = "";
  for (const tx of transactions) {
    const d = new Date(tx.timestamp);
    d.setHours(0, 0, 0, 0);
    const key = String(d.getTime());
    if (key !== lastKey) {
      out.push({ kind: "header", label: dateGroupLabel(d) });
      lastKey = key;
    }
    out.push({ kind: "tx", tx });
  }
  return out;
}

function dateGroupLabel(d: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const formatted = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  if (d.getTime() === today.getTime()) return `TODAY · ${formatted}`;
  if (d.getTime() === yesterday.getTime()) return `YESTERDAY · ${formatted}`;
  return formatted.toUpperCase();
}
