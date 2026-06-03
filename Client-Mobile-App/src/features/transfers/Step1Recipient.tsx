import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import {
  ArrowRight,
  AtSign,
  Check,
  Loader2,
  QrCode,
  Star,
  Trash2,
  Users,
  X,
} from "lucide-react-native";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/api/error";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  formatRibDisplay,
  formatRibInputLive,
  isValidRib,
  normalizeRib,
} from "@/lib/rib";
import { resolveBackendUrl } from "@/lib/backendUrl";
import { relativeTime } from "@/lib/format";
import {
  type RibResolveResponse,
  type UsernameResolveResponse,
  resolveRib,
  resolveUsername,
  verifyName,
} from "@/features/transfers/api";
import {
  type BeneficiaryResponse,
  deleteBeneficiary,
  listBeneficiaries,
  toggleBeneficiaryFavorite,
} from "@/features/transfers/beneficiariesApi";
import { useTransferFlow } from "@/store/transferFlow";
import { RecipientConfirmationCard } from "@/features/transfers/components/RecipientConfirmationCard";

export interface ManualSelection {
  rib: string;
  firstName: string;
  lastName: string;
  saveBeneficiary: boolean;
  beneficiaryNickname: string;
  resolved: RibResolveResponse;
}

export interface UsernameSelection {
  username: string;
  resolved: UsernameResolveResponse;
}

type Tab = "rib" | "username" | "saved";

interface Step1Props {
  busy: boolean;
  onContinueManual: (sel: ManualSelection) => void;
  onContinueFromSaved: (b: BeneficiaryResponse) => void;
  onContinueFromUsername: (sel: UsernameSelection) => void;
}

export function Step1Recipient({
  busy,
  onContinueManual,
  onContinueFromSaved,
  onContinueFromUsername,
}: Step1Props) {
  const [tab, setTab] = useState<Tab>("rib");
  const scannedRib = useTransferFlow((s) => s.scannedRib);
  const scannedUsername = useTransferFlow((s) => s.scannedUsername);

  // The QR scanner auto-detects the shape; route to the matching tab, which
  // then consumes the scanned value on focus.
  useEffect(() => {
    if (scannedUsername) setTab("username");
    else if (scannedRib) setTab("rib");
  }, [scannedRib, scannedUsername]);

  return (
    <View className="flex-1 gap-4">
      <TabSwitcher tab={tab} onChange={setTab} />
      {tab === "rib" ? (
        <RibTab busy={busy} onContinue={onContinueManual} />
      ) : tab === "username" ? (
        <UsernameTab busy={busy} onContinue={onContinueFromUsername} />
      ) : (
        <SavedTab busy={busy} onChoose={onContinueFromSaved} />
      )}
    </View>
  );
}

function TabSwitcher({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const tabs: { value: Tab; label: string }[] = [
    { value: "rib", label: "RIB" },
    { value: "username", label: "@username" },
    { value: "saved", label: "Saved" },
  ];
  return (
    <View className="flex-row self-start rounded-xl bg-surface-raised p-1">
      {tabs.map((t) => {
        const active = t.value === tab;
        return (
          <Pressable
            key={t.value}
            onPress={() => onChange(t.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            className={cn("h-9 justify-center rounded-lg px-4", active && "bg-surface-card")}
          >
            <Text
              className={cn(
                "text-[13px]",
                active ? "font-sans-semibold text-text-primary" : "font-sans-medium text-text-muted",
              )}
            >
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ── RIB tab ─────────────────────────────────────────────────────────────── */

type NameStatus = "idle" | "verifying" | "matched" | "mismatch" | "blocked";

function RibTab({
  busy,
  onContinue,
}: {
  busy: boolean;
  onContinue: (sel: ManualSelection) => void;
}) {
  const { colors } = useColorScheme();
  const toast = useToast();
  const consumeScannedRib = useTransferFlow((s) => s.consumeScannedRib);

  const [ribInput, setRibInput] = useState("");
  const [ribError, setRibError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<RibResolveResponse | null>(null);
  const [resolving, setResolving] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nameStatus, setNameStatus] = useState<NameStatus>("idle");
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [saveBeneficiary, setSaveBeneficiary] = useState(false);
  const [nickname, setNickname] = useState("");

  const resolveSeq = useRef(0);
  const verifySeq = useRef(0);

  const runResolve = useCallback(
    async (normalized: string) => {
      const seq = ++resolveSeq.current;
      setResolving(true);
      try {
        const res = await resolveRib(normalized);
        if (resolveSeq.current !== seq) return;
        setResolved(res);
        setResolving(false);
        setRibError(null);
      } catch (err) {
        if (resolveSeq.current !== seq) return;
        setResolving(false);
        setResolved(null);
        setRibError(ribResolveErrorMessage(err));
      }
    },
    [],
  );

  // Pre-fill from the QR scanner when it hands a RIB back.
  useFocusEffect(
    useCallback(() => {
      const scanned = consumeScannedRib();
      if (!scanned) return;
      const live = formatRibInputLive(scanned);
      setRibInput(live);
      setRibError(null);
      setResolved(null);
      setNameStatus("idle");
      setAttemptsRemaining(null);
      const normalized = normalizeRib(scanned);
      if (normalized.length === 20 && isValidRib(normalized)) void runResolve(normalized);
    }, [consumeScannedRib, runResolve]),
  );

  function handleRibChange(next: string) {
    const live = formatRibInputLive(next);
    const normalized = normalizeRib(live);
    setRibInput(live);
    setRibError(null);
    setResolved(null);
    setNameStatus("idle");
    setAttemptsRemaining(null);
    if (normalized.length === 20) {
      if (!isValidRib(normalized)) {
        setRibError("Invalid RIB checksum.");
        return;
      }
      void runResolve(normalized);
    }
  }

  async function runVerify(): Promise<boolean> {
    if (!resolved) return false;
    if (nameStatus === "matched") return true;
    if (nameStatus === "blocked") return false;
    const fn = firstName.trim();
    const ln = lastName.trim();
    if (!fn || !ln) return false;
    const seq = ++verifySeq.current;
    setNameStatus("verifying");
    try {
      const res = await verifyName(normalizeRib(ribInput), fn, ln);
      if (verifySeq.current !== seq) return false;
      setNameStatus(res.matched ? "matched" : "mismatch");
      setAttemptsRemaining(res.attemptsRemaining);
      if (!res.matched && res.attemptsRemaining <= 2) {
        toast.showToast({
          tier: "warning",
          message:
            res.attemptsRemaining === 0
              ? "No attempts remaining. Please try again in an hour."
              : `${res.attemptsRemaining} attempt${res.attemptsRemaining === 1 ? "" : "s"} remaining.`,
        });
      }
      return res.matched;
    } catch (err) {
      if (verifySeq.current !== seq) return false;
      if (err instanceof ApiError && err.status === 409) {
        setNameStatus("blocked");
        setAttemptsRemaining(0);
        toast.showToast({ tier: "danger", message: "Too many name attempts. Please try again in an hour." });
        return false;
      }
      toast.showToast({
        tier: "danger",
        message:
          err instanceof ApiError && err.message ? err.message : "Unable to verify the name. Please try again.",
      });
      setNameStatus("idle");
      return false;
    }
  }

  // Enabled once a valid RIB resolves and both names are entered; the match is
  // verified on press (and the backend re-verifies on the actual transfer).
  const namesEntered = !!firstName.trim() && !!lastName.trim();
  const canContinue =
    !!resolved && namesEntered && !busy && nameStatus !== "verifying" && nameStatus !== "blocked" && isValidRib(normalizeRib(ribInput));

  async function submit() {
    if (!canContinue || !resolved) return;
    if (nameStatus !== "matched") {
      const matched = await runVerify();
      if (!matched) return;
    }
    onContinue({
      rib: normalizeRib(ribInput),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      saveBeneficiary,
      beneficiaryNickname: saveBeneficiary ? nickname.trim() : "",
      resolved,
    });
  }

  const nameBorder = (s: NameStatus) =>
    s === "matched" ? "border-positive" : s === "mismatch" || s === "blocked" ? "border-negative" : "border-border";

  return (
    <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 18, paddingBottom: 16 }}>
      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="font-sans-bold text-[11px] uppercase tracking-[0.06em] text-text-secondary">
            Recipient RIB (20 digits)
          </Text>
          <Pressable
            onPress={() => router.push("/qr-scan")}
            accessibilityLabel="Scan a RIB QR code"
            className="flex-row items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5"
          >
            <QrCode size={14} color={colors.accent} strokeWidth={2.2} />
            <Text className="font-sans-semibold text-[12px] text-accent">Scan QR</Text>
          </Pressable>
        </View>
        <View
          className={cn(
            "h-[60px] flex-row items-center gap-2 rounded-xl border bg-surface-card px-4",
            ribError ? "border-negative" : "border-border",
          )}
        >
          <TextInput
            value={ribInput}
            onChangeText={handleRibChange}
            keyboardType="number-pad"
            placeholder="BB AAA NNNNNNNNNNNNN CC"
            placeholderTextColor={colors.textMuted}
            editable={!busy}
            className="min-w-0 flex-1 p-0 font-mono text-[16px] tracking-[0.04em] text-text-primary"
          />
          {resolving ? <Loader2 size={16} color={colors.textMuted} strokeWidth={2.4} /> : null}
        </View>
        {ribError ? <Text className="font-sans text-[12px] text-negative">{ribError}</Text> : null}
        {resolved && !ribError ? (
          <View className="flex-row flex-wrap items-center gap-2 rounded-[10px] bg-positive-soft px-3 py-2">
            <Check size={16} color={colors.positive} strokeWidth={2.4} />
            <Text className="flex-1 font-sans text-[12px] text-text-primary">
              <Text className="font-sans-semibold">
                {resolved.bankName} ({resolved.bankCode})
              </Text>
              <Text className="text-text-secondary">
                {" · holder "}
                {resolved.firstNameMasked} {resolved.lastNameMasked}
              </Text>
            </Text>
            {resolved.isPayZoUser ? (
              <View className="rounded-full bg-accent px-2 py-0.5">
                <Text className="font-sans-bold text-[10px] text-accent-foreground">PayZo user</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {resolved ? (
        <View className="gap-3">
          <NameField
            label="First name"
            value={firstName}
            placeholder={resolved.firstNameMasked}
            status={nameStatus}
            borderClass={nameBorder(nameStatus)}
            editable={!busy && nameStatus !== "blocked"}
            onChangeText={(v) => {
              setFirstName(v);
              if (nameStatus === "matched" || nameStatus === "mismatch") setNameStatus("idle");
            }}
          />
          <NameField
            label="Last name"
            value={lastName}
            placeholder={resolved.lastNameMasked}
            status={nameStatus}
            borderClass={nameBorder(nameStatus)}
            editable={!busy && nameStatus !== "blocked"}
            onChangeText={(v) => {
              setLastName(v);
              if (nameStatus === "matched" || nameStatus === "mismatch") setNameStatus("idle");
            }}
            onBlur={() => void runVerify()}
          />

          {nameStatus === "mismatch" ? (
            <View className="flex-row items-start gap-2 rounded-[10px] bg-negative-soft px-3 py-2">
              <X size={16} color={colors.negative} strokeWidth={2.4} />
              <Text className="flex-1 font-sans text-[12px] text-text-primary">
                This does not match the bank's records for this RIB.
                {attemptsRemaining !== null
                  ? ` ${attemptsRemaining} attempt${attemptsRemaining === 1 ? "" : "s"} remaining.`
                  : ""}
              </Text>
            </View>
          ) : null}
          {nameStatus === "blocked" ? (
            <View className="flex-row items-start gap-2 rounded-[10px] bg-negative-soft px-3 py-2">
              <X size={16} color={colors.negative} strokeWidth={2.4} />
              <Text className="flex-1 font-sans text-[12px] text-text-primary">
                Too many name attempts on this RIB. Please try again in an hour.
              </Text>
            </View>
          ) : null}

          {nameStatus === "matched" ? (
            <View className="gap-2 rounded-[10px] border border-border-soft bg-surface-card px-4 py-3">
              <Pressable
                onPress={() => setSaveBeneficiary((v) => !v)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: saveBeneficiary }}
                className="flex-row items-center gap-2.5"
              >
                <View
                  className={cn(
                    "size-5 items-center justify-center rounded border",
                    saveBeneficiary ? "border-accent bg-accent" : "border-border bg-surface-card",
                  )}
                >
                  {saveBeneficiary ? <Check size={13} color={colors.accentForeground} strokeWidth={3} /> : null}
                </View>
                <Text className="font-sans-semibold text-[13px] text-text-primary">Save as a beneficiary</Text>
              </Pressable>
              {saveBeneficiary ? (
                <TextInput
                  value={nickname}
                  onChangeText={(v) => setNickname(v.slice(0, 60))}
                  placeholder="Nickname (optional, e.g. Sis, Karim B.)"
                  placeholderTextColor={colors.textMuted}
                  className="h-10 rounded-lg border border-border-soft bg-accent-soft px-3 font-sans text-[13px] text-text-primary"
                />
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      <Pressable
        onPress={submit}
        disabled={!canContinue}
        accessibilityRole="button"
        className={cn(
          "h-12 flex-row items-center justify-center gap-2 rounded-xl bg-accent",
          !canContinue && "opacity-50",
        )}
      >
        <Text className="font-sans-semibold text-[14px] text-accent-foreground">Continue</Text>
        <ArrowRight size={16} color={colors.accentForeground} strokeWidth={2.4} />
      </Pressable>
    </ScrollView>
  );
}

function NameField({
  label,
  value,
  placeholder,
  status,
  borderClass,
  editable,
  onChangeText,
  onBlur,
}: {
  label: string;
  value: string;
  placeholder: string;
  status: NameStatus;
  borderClass: string;
  editable: boolean;
  onChangeText: (v: string) => void;
  onBlur?: () => void;
}) {
  const { colors } = useColorScheme();
  return (
    <View className="gap-1">
      <Text className="font-sans-bold text-[10px] uppercase tracking-[0.08em] text-text-muted">{label}</Text>
      <View className={cn("h-[52px] flex-row items-center gap-2 rounded-[10px] border bg-surface-card px-3.5", borderClass)}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onBlur={onBlur}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          editable={editable}
          autoCapitalize="words"
          className="min-w-0 flex-1 p-0 font-sans text-[14px] text-text-primary"
        />
        {status === "verifying" ? <Loader2 size={16} color={colors.textMuted} strokeWidth={2.4} /> : null}
        {status === "matched" ? <Check size={16} color={colors.positive} strokeWidth={2.6} /> : null}
        {status === "mismatch" || status === "blocked" ? <X size={16} color={colors.negative} strokeWidth={2.6} /> : null}
      </View>
    </View>
  );
}

function ribResolveErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return "Unable to reach PayZo. Please try again.";
  switch (err.errorCode) {
    case "INVALID_RIB":
      return "This RIB fails the checksum.";
    case "CANNOT_TRANSFER_TO_SELF":
      return "You cannot transfer to your own account here.";
    case "BANK_NOT_REGISTERED":
      return "Transfers to this bank are not supported.";
    case "BANK_INACTIVE":
      return "Transfers to this bank are temporarily paused.";
    case "CLIENT_NOT_FOUND_IN_CBS":
      return "No account was found at the bank for this RIB.";
    default:
      return err.message ?? "Unable to look up that RIB. Please try again.";
  }
}

/* ── @username tab ───────────────────────────────────────────────────────── */

function UsernameTab({
  busy,
  onContinue,
}: {
  busy: boolean;
  onContinue: (sel: UsernameSelection) => void;
}) {
  const { colors } = useColorScheme();
  const consumeScannedUsername = useTransferFlow((s) => s.consumeScannedUsername);
  const [input, setInput] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState<UsernameResolveResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const runFind = useCallback(async (rawValue: string) => {
    const trimmed = rawValue.trim().replace(/^@+/, "");
    if (!trimmed) return;
    const mySeq = ++seq.current;
    setResolving(true);
    setError(null);
    setResolved(null);
    try {
      const res = await resolveUsername(trimmed);
      if (seq.current !== mySeq) return;
      setResolved(res);
      setResolving(false);
    } catch (err) {
      if (seq.current !== mySeq) return;
      setResolving(false);
      setError(usernameResolveErrorMessage(err));
    }
  }, []);

  function find() {
    if (resolving || busy) return;
    void runFind(input);
  }

  // Prefill + auto-resolve a username handed back from the QR scanner.
  useFocusEffect(
    useCallback(() => {
      const scanned = consumeScannedUsername();
      if (scanned) {
        setInput(scanned);
        void runFind(scanned);
      }
    }, [consumeScannedUsername, runFind]),
  );

  if (resolved) {
    return (
      <RecipientConfirmationCard
        firstName={resolved.firstName}
        lastName={resolved.lastName}
        username={resolved.username}
        profilePictureUrl={resolved.profilePictureUrl}
        trustScore={resolved.trustScore}
        busy={busy}
        onConfirm={() => onContinue({ username: resolved.username, resolved })}
        onReject={() => setResolved(null)}
      />
    );
  }

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text className="font-sans-bold text-[11px] uppercase tracking-[0.06em] text-text-secondary">
          PayZo username
        </Text>
        <Pressable
          onPress={() => router.push("/qr-scan")}
          accessibilityLabel="Scan a QR code"
          className="flex-row items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5"
        >
          <QrCode size={14} color={colors.accent} strokeWidth={2.2} />
          <Text className="font-sans-semibold text-[12px] text-accent">Scan QR</Text>
        </Pressable>
      </View>
      <View
        className={cn(
          "h-[60px] flex-row items-center gap-2 rounded-xl border bg-surface-card px-4",
          error ? "border-negative" : "border-border",
        )}
      >
        <AtSign size={16} color={colors.textMuted} strokeWidth={2.4} />
        <TextInput
          value={input}
          onChangeText={(v) => {
            setInput(v);
            if (error) setError(null);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="username"
          placeholderTextColor={colors.textMuted}
          editable={!busy && !resolving}
          onSubmitEditing={find}
          returnKeyType="search"
          className="min-w-0 flex-1 p-0 font-sans text-[16px] text-text-primary"
        />
        <Pressable
          onPress={find}
          disabled={busy || resolving || !input.trim()}
          accessibilityLabel="Find user"
          className={cn(
            "h-10 flex-row items-center gap-1.5 rounded-[10px] bg-accent px-4",
            (busy || resolving || !input.trim()) && "opacity-50",
          )}
        >
          {resolving ? (
            <Loader2 size={16} color={colors.accentForeground} strokeWidth={2.4} />
          ) : (
            <>
              <Text className="font-sans-semibold text-[13px] text-accent-foreground">Find</Text>
              <ArrowRight size={16} color={colors.accentForeground} strokeWidth={2.4} />
            </>
          )}
        </Pressable>
      </View>
      {error ? <Text className="font-sans text-[12px] text-negative">{error}</Text> : null}
    </View>
  );
}

function usernameResolveErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return "Unable to look up that username. Please try again.";
  switch (err.errorCode) {
    case "RESOURCE_NOT_FOUND":
      return "No PayZo user matches this username.";
    case "CANNOT_TRANSFER_TO_SELF":
      return "This is your own account.";
    case "RECIPIENT_NO_DEFAULT_ACCOUNT":
      return "This recipient has no default account.";
    case "BANK_NOT_REGISTERED":
    case "BANK_INACTIVE":
      return "This bank is not supported.";
    case "RESOLVE_USERNAME_RATE_LIMIT":
      return "Too many attempts. Please try again in an hour.";
    default:
      return "Unable to look up that username. Please try again.";
  }
}

/* ── Saved tab ───────────────────────────────────────────────────────────── */

function SavedTab({
  busy,
  onChoose,
}: {
  busy: boolean;
  onChoose: (b: BeneficiaryResponse) => void;
}) {
  const { colors } = useColorScheme();
  const toast = useToast();
  const [items, setItems] = useState<BeneficiaryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BeneficiaryResponse | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await listBeneficiaries(0, 50);
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

  if (loading) {
    return (
      <View className="items-center justify-center py-16">
        <Loader2 size={20} color={colors.textMuted} strokeWidth={2.4} />
      </View>
    );
  }
  if (error) {
    return (
      <View className="items-center justify-center gap-3 py-12">
        <Text className="font-sans text-[13px] text-negative">{error}</Text>
        <Pressable onPress={() => setReloadTick((t) => t + 1)} className="rounded-lg bg-surface-raised px-3 py-1.5">
          <Text className="font-sans-semibold text-[12px] text-text-secondary">Retry</Text>
        </Pressable>
      </View>
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No saved recipients yet"
        message="Save someone the next time you send. They'll show up here for one-tap transfers."
      />
    );
  }

  const favorites = items.filter((b) => b.favorite);

  return (
    <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10, paddingBottom: 16 }}>
      {favorites.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingVertical: 4 }}>
          {favorites.map((b) => (
            <Pressable
              key={b.id}
              onPress={() => onChoose(b)}
              disabled={busy || actionBusy}
              accessibilityLabel={`Send money to ${b.displayName}`}
              className="w-16 items-center gap-1.5"
            >
              <View className="size-14 items-center justify-center overflow-hidden rounded-full border-2 border-accent">
                <View className="size-full items-center justify-center bg-accent">
                  <Text className="font-sans-semibold text-[16px] text-accent-foreground">{b.initials}</Text>
                </View>
              </View>
              <Text numberOfLines={1} className="max-w-16 font-sans-medium text-[11px] text-text-primary">
                {b.nickname?.trim() || b.displayName.split(/\s+/)[0]}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {items.map((b) => (
        <View
          key={b.id}
          className="flex-row items-center gap-3 rounded-xl border border-border-soft bg-surface-card px-3.5 py-3"
        >
          <Pressable
            onPress={() => onChoose(b)}
            disabled={busy || actionBusy}
            accessibilityLabel={`Send money to ${b.displayName}`}
            className="min-w-0 flex-1 flex-row items-center gap-3"
          >
            <View className="size-11 items-center justify-center rounded-full bg-accent">
              <Text className="font-sans-bold text-[14px] text-accent-foreground">{b.initials}</Text>
            </View>
            <View className="min-w-0 flex-1 gap-0.5">
              <View className="flex-row items-center gap-2">
                <Text numberOfLines={1} className="font-sans-bold text-[14px] text-text-primary">
                  {b.displayName}
                </Text>
                {b.favorite ? <Star size={14} color={colors.warning} fill={colors.warning} strokeWidth={2} /> : null}
              </View>
              <Text numberOfLines={1} className="font-mono text-[11px] text-text-secondary">
                {b.bankCode ? `${b.bankCode} · ` : ""}
                {formatRibDisplay(b.accountNumber)}
              </Text>
              {b.lastUsedAt ? (
                <Text className="font-sans text-[11px] text-text-muted">
                  Used {relativeTime(b.lastUsedAt)} · {b.transferCount} transfer{b.transferCount === 1 ? "" : "s"}
                </Text>
              ) : null}
            </View>
          </Pressable>
          <Pressable
            onPress={() => toggleFavorite(b)}
            disabled={actionBusy}
            accessibilityLabel={b.favorite ? "Unfavorite" : "Favorite"}
            hitSlop={6}
            className="size-8 items-center justify-center rounded-full"
          >
            <Star
              size={16}
              color={b.favorite ? colors.warning : colors.textMuted}
              fill={b.favorite ? colors.warning : "transparent"}
              strokeWidth={2}
            />
          </Pressable>
          <Pressable
            onPress={() => setDeleteTarget(b)}
            disabled={actionBusy}
            accessibilityLabel="Remove beneficiary"
            hitSlop={6}
            className="size-8 items-center justify-center rounded-full"
          >
            <Trash2 size={16} color={colors.textMuted} strokeWidth={2} />
          </Pressable>
        </View>
      ))}

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
    </ScrollView>
  );
}
