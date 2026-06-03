import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pencil, Plus, Search, Send, Star, Trash2, Users, X } from "lucide-react-native";
import { cn } from "@/lib/cn";
import { useColorScheme } from "@/hooks/useColorScheme";
import { ApiError } from "@/lib/api/error";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatRibDisplay } from "@/lib/rib";
import { relativeTime } from "@/lib/format";
import {
  type BeneficiaryResponse,
  deleteBeneficiary,
  listBeneficiaries,
  toggleBeneficiaryFavorite,
  updateBeneficiaryNickname,
} from "@/features/transfers/beneficiariesApi";
import { useTransferFlow } from "@/store/transferFlow";

type SortKey = "recent" | "alpha" | "uses";

export default function BeneficiariesModal() {
  const insets = useSafeAreaInsets();
  const { colors } = useColorScheme();
  const toast = useToast();

  const [items, setItems] = useState<BeneficiaryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BeneficiaryResponse | null>(null);
  const [renameTarget, setRenameTarget] = useState<BeneficiaryResponse | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await listBeneficiaries(0, 100);
        if (!cancelled) setItems(res.content);
      } catch (err) {
        if (cancelled) return;
        setItems([]);
        setError(err instanceof ApiError && err.message ? err.message : "Unable to load your beneficiaries. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = items;
    if (q) {
      out = out.filter(
        (b) =>
          b.displayName.toLowerCase().includes(q) ||
          (b.bankCode ?? "").toLowerCase().includes(q) ||
          b.accountNumber.includes(q),
      );
    }
    return out.slice().sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      switch (sort) {
        case "alpha":
          return a.displayName.localeCompare(b.displayName);
        case "uses":
          return b.transferCount - a.transferCount;
        default: {
          const at = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
          const bt = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
          return bt - at;
        }
      }
    });
  }, [items, search, sort]);

  async function toggleFavorite(b: BeneficiaryResponse) {
    if (actionBusy) return;
    setActionBusy(true);
    const previous = items;
    setItems((prev) => prev.map((x) => (x.id === b.id ? { ...x, favorite: !x.favorite } : x)));
    try {
      const updated = await toggleBeneficiaryFavorite(b.id);
      setItems((prev) => prev.map((x) => (x.id === b.id ? { ...x, ...updated } : x)));
    } catch (err) {
      setItems(previous);
      toast.showToast({
        tier: "danger",
        message: err instanceof ApiError && err.message ? err.message : "Unable to update the favorite. Please try again.",
      });
    } finally {
      setActionBusy(false);
    }
  }

  function send(b: BeneficiaryResponse) {
    useTransferFlow.getState().startWithBeneficiary(b);
    router.replace("/(tabs)/transfer");
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setActionBusy(true);
    const previous = items;
    setItems((prev) => prev.filter((x) => x.id !== deleteTarget.id));
    try {
      await deleteBeneficiary(deleteTarget.id);
      toast.showToast({ tier: "success", message: "Beneficiary removed." });
    } catch (err) {
      setItems(previous);
      toast.showToast({
        tier: "danger",
        message: err instanceof ApiError && err.message ? err.message : "Unable to remove the beneficiary. Please try again.",
      });
    } finally {
      setActionBusy(false);
      setDeleteTarget(null);
    }
  }

  async function saveNickname(value: string) {
    if (!renameTarget) return;
    setActionBusy(true);
    try {
      const next = value.trim();
      const updated = await updateBeneficiaryNickname(renameTarget.id, { nickname: next || undefined });
      setItems((prev) => prev.map((x) => (x.id === renameTarget.id ? updated : x)));
      toast.showToast({ tier: "success", message: "Nickname updated." });
      setRenameTarget(null);
    } catch (err) {
      toast.showToast({
        tier: "danger",
        message: err instanceof ApiError && err.message ? err.message : "Unable to update the nickname. Please try again.",
      });
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <View className="flex-1 bg-surface-soft" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-4 py-3">
        <Text className="font-display-bold text-[18px] text-text-primary">Beneficiaries</Text>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/dashboard"))} accessibilityLabel="Close" hitSlop={8} className="size-9 items-center justify-center rounded-full">
          <X size={22} color={colors.textPrimary} strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 14 }}>
        <View className="gap-1">
          <Text className="font-display-bold text-[22px] text-text-primary">Your saved recipients</Text>
          <Text className="font-sans text-[12px] text-text-secondary">Send again with one tap — no re-typing the RIB.</Text>
        </View>

        <Pressable
          onPress={() => router.replace("/(tabs)/transfer")}
          accessibilityRole="button"
          className="h-11 flex-row items-center justify-center gap-1.5 self-start rounded-[10px] bg-accent px-4"
        >
          <Plus size={16} color={colors.accentForeground} strokeWidth={2.4} />
          <Text className="font-sans-bold text-[13px] text-accent-foreground">Add via send money</Text>
        </Pressable>

        <View className="h-11 flex-row items-center gap-2 rounded-xl border border-border-soft bg-surface-card px-3.5">
          <Search size={16} color={colors.textMuted} strokeWidth={2} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name, bank, or RIB digits"
            placeholderTextColor={colors.textMuted}
            className="min-w-0 flex-1 p-0 font-sans text-[13px] text-text-primary"
          />
          {search ? (
            <Pressable onPress={() => setSearch("")} accessibilityLabel="Clear search" hitSlop={6}>
              <X size={16} color={colors.textMuted} strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>

        <View className="flex-row gap-1.5 self-start rounded-lg bg-surface-raised p-1">
          {(["recent", "alpha", "uses"] as const).map((k) => {
            const labels: Record<SortKey, string> = { recent: "Recent", alpha: "A-Z", uses: "Most used" };
            const active = sort === k;
            return (
              <Pressable
                key={k}
                onPress={() => setSort(k)}
                className={cn("h-7 items-center justify-center rounded-md px-3", active && "bg-surface-card")}
              >
                <Text className={cn("text-[12px]", active ? "font-sans-semibold text-text-primary" : "font-sans-medium text-text-secondary")}>
                  {labels[k]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {loading ? (
          <View className="items-center py-16">
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : error ? (
          <View className="items-center gap-3 py-12">
            <Text className="font-sans text-[13px] text-negative">{error}</Text>
            <Pressable onPress={() => setReloadTick((t) => t + 1)} className="rounded-lg bg-surface-raised px-3 py-1.5">
              <Text className="font-sans-semibold text-[12px] text-text-secondary">Retry</Text>
            </Pressable>
          </View>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No saved recipients yet"
            message="Save someone the next time you send. They'll show up here for one-tap transfers."
          />
        ) : visible.length === 0 ? (
          <View className="items-center gap-2 py-16">
            <Text className="font-sans-bold text-[14px] text-text-primary">No matches</Text>
            <Text className="font-sans text-[12px] text-text-secondary">Try a different search term.</Text>
          </View>
        ) : (
          <View className="gap-2.5">
            {visible.map((b) => (
              <View key={b.id} className="gap-3 rounded-[14px] border border-border-soft bg-surface-card p-4">
                <View className="flex-row items-center gap-3">
                  <View className="size-12 items-center justify-center rounded-full bg-accent">
                    <Text className="font-sans-bold text-[15px] text-accent-foreground">{b.initials}</Text>
                  </View>
                  <View className="min-w-0 flex-1 gap-0.5">
                    <View className="flex-row items-center gap-2">
                      <Text numberOfLines={1} className="font-sans-bold text-[15px] text-text-primary">
                        {b.displayName}
                      </Text>
                      {b.favorite ? <Star size={14} color={colors.warning} fill={colors.warning} strokeWidth={2} /> : null}
                    </View>
                    <Text numberOfLines={1} className="font-mono text-[11px] text-text-secondary">
                      {b.bankCode ? `${b.bankCode} · ` : ""}
                      {formatRibDisplay(b.accountNumber)}
                    </Text>
                    <Text className="font-sans text-[11px] text-text-muted">
                      {b.lastUsedAt
                        ? `Last used ${relativeTime(b.lastUsedAt)} · ${b.transferCount} transfer${b.transferCount === 1 ? "" : "s"}`
                        : "Not used yet"}
                    </Text>
                  </View>
                </View>
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-1">
                    <IconAction label={b.favorite ? "Unfavorite" : "Favorite"} disabled={actionBusy} onPress={() => toggleFavorite(b)}>
                      <Star size={16} color={b.favorite ? colors.warning : colors.textMuted} fill={b.favorite ? colors.warning : "transparent"} strokeWidth={2} />
                    </IconAction>
                    <IconAction label="Rename" disabled={actionBusy} onPress={() => setRenameTarget(b)}>
                      <Pencil size={16} color={colors.textMuted} strokeWidth={2} />
                    </IconAction>
                    <IconAction label="Remove" disabled={actionBusy} onPress={() => setDeleteTarget(b)}>
                      <Trash2 size={16} color={colors.textMuted} strokeWidth={2} />
                    </IconAction>
                  </View>
                  <Pressable
                    onPress={() => send(b)}
                    disabled={actionBusy}
                    accessibilityRole="button"
                    className="h-9 flex-row items-center gap-1.5 rounded-lg bg-accent pl-3 pr-4"
                  >
                    <Send size={14} color={colors.accentForeground} strokeWidth={2.4} />
                    <Text className="font-sans-bold text-[12px] text-accent-foreground">Send</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove beneficiary?"
        message={
          deleteTarget
            ? `${deleteTarget.displayName} will no longer appear in your saved list. The transfers you've already sent stay in your history.`
            : ""
        }
        confirmLabel="Remove"
        cancelLabel="Keep"
        variant="danger"
        busy={actionBusy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />

      <NicknameDialog
        target={renameTarget}
        busy={actionBusy}
        colors={colors}
        onCancel={() => setRenameTarget(null)}
        onSave={saveNickname}
      />
    </View>
  );
}

function IconAction({
  label,
  disabled,
  onPress,
  children,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      className="size-9 items-center justify-center rounded-full"
    >
      {children}
    </Pressable>
  );
}

function NicknameDialog({
  target,
  busy,
  colors,
  onCancel,
  onSave,
}: {
  target: BeneficiaryResponse | null;
  busy: boolean;
  colors: ReturnType<typeof useColorScheme>["colors"];
  onCancel: () => void;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  useEffect(() => {
    setValue(target?.nickname ?? "");
  }, [target]);

  if (!target) return null;

  return (
    <Modal transparent animationType="fade" visible={!!target} onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-center bg-black/40 px-6">
        <View className="w-full max-w-md gap-4 rounded-[14px] border border-border-soft bg-surface-card p-5">
          <Text className="font-sans-bold text-[18px] text-text-primary">Rename {target.displayName}</Text>
          <Text className="font-sans text-[12px] text-text-secondary">
            Give them a nickname only you can see — leave blank to use their real name.
          </Text>
          <TextInput
            value={value}
            onChangeText={(v) => setValue(v.slice(0, 60))}
            autoFocus
            placeholder="Nickname"
            placeholderTextColor={colors.textMuted}
            className="h-11 rounded-[10px] border border-border-soft bg-surface-card px-3.5 font-sans text-[14px] text-text-primary"
          />
          <View className="flex-row justify-end gap-2">
            <Pressable onPress={onCancel} disabled={busy} className="h-10 items-center justify-center rounded-lg bg-surface-raised px-4">
              <Text className="font-sans-semibold text-[13px] text-text-secondary">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => onSave(value)}
              disabled={busy}
              className={cn("h-10 items-center justify-center rounded-lg bg-accent px-4", busy && "opacity-60")}
            >
              <Text className="font-sans-bold text-[13px] text-accent-foreground">{busy ? "Saving" : "Save"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
