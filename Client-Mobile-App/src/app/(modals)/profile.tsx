import { useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AtSign,
  Calendar,
  Check,
  ChevronRight,
  KeyRound,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  X,
} from "lucide-react-native";
import { cn } from "@/lib/cn";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useToast } from "@/components/ui/Toast";
import { useMe, deriveInitials } from "@/hooks/useMe";
import { useAuthStore } from "@/store/authStore";
import { angleToStartEnd, gradients } from "@/lib/tokens";
import { resolveBackendUrl } from "@/lib/backendUrl";
import { usePhotoVersion, withPhotoVersion } from "@/store/photoVersion";
import { getAccounts, type ClientAccount } from "@/features/dashboard/api";
import { type ClientProfile, setDefaultAccount, uploadProfilePicture } from "@/features/me/api";

export default function ProfileModal() {
  const insets = useSafeAreaInsets();
  const { scheme, colors } = useColorScheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { me } = useMe();
  const authed = useAuthStore((s) => s.authed);
  const userId = useAuthStore((s) => s.userId);

  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: getAccounts, enabled: authed });

  function patchMe(updates: Partial<ClientProfile>) {
    queryClient.setQueryData<ClientProfile>(["me", userId], (old) => (old ? { ...old, ...updates } : old));
  }

  const dob = me?.dateOfBirth
    ? new Date(me.dateOfBirth).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "—";

  return (
    <View className="flex-1 bg-surface-soft" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-4 py-3">
        <Text className="font-display-bold text-[18px] text-text-primary">Personal info</Text>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/dashboard"))} accessibilityLabel="Close" hitSlop={8} className="size-9 items-center justify-center rounded-full">
          <X size={22} color={colors.textPrimary} strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 16 }}>
        <View className="items-center gap-3">
          <AvatarUploader
            me={me}
            colors={colors}
            scheme={scheme}
            onUploaded={(url) => patchMe({ profilePictureUrl: url })}
          />
          <Text className="font-sans-semibold text-[18px] text-text-primary">
            {me ? `${me.firstName} ${me.lastName}` : "Welcome"}
          </Text>
          {me ? <Text className="font-mono text-[12px] text-text-muted">CIN · {me.cin}</Text> : null}
        </View>

        <Section title="Identity">
          <InfoRow label="Full name" value={me ? `${me.firstName} ${me.lastName}` : "—"} />
          <InfoRow label="CIN" value={me?.cin ?? "—"} mono />
          <InfoRow label="Date of birth" value={dob} icon={<Calendar size={14} color={colors.textSecondary} strokeWidth={2} />} />
        </Section>

        <Section title="Contact">
          <InfoRow label="Email" value={me?.email ?? "—"} icon={<Mail size={14} color={colors.textSecondary} strokeWidth={2} />} />
          <InfoRow label="Phone" value={me?.phone ?? "—"} mono icon={<Phone size={14} color={colors.textSecondary} strokeWidth={2} />} />
        </Section>

        <Section title="Address">
          <InfoRow label="Address" value={me?.address ?? "—"} icon={<MapPin size={14} color={colors.textSecondary} strokeWidth={2} />} />
          <InfoRow label="Governorate" value={me?.governorate ?? "—"} />
        </Section>

        <Section title="PayZo">
          <Pressable
            onPress={() => router.push("/change-username")}
            accessibilityRole="button"
            className="flex-row items-center justify-between gap-3 bg-surface-card px-4 py-3"
          >
            <Text className="font-sans text-[12px] text-text-secondary">Username</Text>
            <View className="flex-row items-center gap-1.5">
              <Text className="font-sans-semibold text-[13px] text-text-primary">@{me?.username ?? "—"}</Text>
              <Pencil size={14} color={colors.textMuted} strokeWidth={2} />
            </View>
          </Pressable>
          <DefaultAccountRow
            value={me?.defaultAccountId ?? null}
            accounts={accountsQ.data ?? null}
            loading={accountsQ.isLoading}
            colors={colors}
            onSaved={(accountNumber) => patchMe({ defaultAccountId: accountNumber })}
          />
          <InfoRow label="Trust score" value={typeof me?.trustScore === "number" ? `${me.trustScore} / 100` : "—"} />
        </Section>

        <Text className="px-1 font-sans text-[12px] leading-5 text-text-muted">
          Need to update your phone, address, or other details? They sync from your bank. Contact them and
          the changes appear here on your next sign-in.
        </Text>

        <View className="overflow-hidden rounded-[14px] border border-border-soft bg-surface-card">
          <MenuRow
            icon={<KeyRound size={18} color={colors.textSecondary} strokeWidth={2} />}
            label="Reset password"
            onPress={() => router.push("/change-password")}
            chevron
          />
        </View>
      </ScrollView>
    </View>
  );
}

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

function AvatarUploader({
  me,
  colors,
  scheme,
  onUploaded,
}: {
  me: ClientProfile | null;
  colors: ReturnType<typeof useColorScheme>["colors"];
  scheme: "light" | "dark";
  onUploaded: (url: string) => void;
}) {
  const toast = useToast();
  const photoVersion = usePhotoVersion((s) => s.version);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  const display = imgError ? null : preview ?? withPhotoVersion(resolveBackendUrl(me?.profilePictureUrl), photoVersion);
  const grad = scheme === "dark" ? gradients.avatarDark : gradients.avatar;
  const { start, end } = angleToStartEnd(grad.angle);

  async function pick() {
    if (busy) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const type = asset.mimeType ?? "image/jpeg";
    if (!ALLOWED.includes(type)) {
      toast.showToast({ tier: "danger", message: "Choose a JPG, PNG, or WEBP image." });
      return;
    }
    setImgError(false);
    setPreview(asset.uri);
    setBusy(true);
    try {
      const url = await uploadProfilePicture({
        uri: asset.uri,
        name: asset.fileName ?? "profile.jpg",
        type,
      });
      onUploaded(url);
      usePhotoVersion.getState().bump();
      setPreview(null);
      toast.showToast({ tier: "success", message: "Profile picture updated." });
    } catch (err) {
      setPreview(null);
      toast.showToast({
        tier: "danger",
        message: err instanceof Error && err.message ? err.message : "Unable to upload the picture. Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pressable onPress={pick} disabled={busy} accessibilityLabel="Change profile picture" className="size-[120px]">
      <LinearGradient
        colors={grad.colors}
        locations={grad.locations}
        start={start}
        end={end}
        style={{ width: 120, height: 120, borderRadius: 60, overflow: "hidden" }}
      >
        {display ? (
          <Image
            source={{ uri: display }}
            className="size-full"
            resizeMode="cover"
            onError={() => setImgError(true)}
          />
        ) : null}
        <View className="absolute inset-0 items-center justify-center">
          {busy ? (
            <View className="size-full items-center justify-center bg-black/35">
              <Loader2 size={28} color="#ffffff" strokeWidth={2} />
            </View>
          ) : !display ? (
            <Text className="font-display-bold text-[34px] text-text-on-inverse">{deriveInitials(me)}</Text>
          ) : null}
        </View>
        <View className="absolute bottom-1 right-1 size-7 items-center justify-center rounded-full bg-surface-card">
          <Pencil size={14} color={colors.textPrimary} strokeWidth={2} />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function DefaultAccountRow({
  value,
  accounts,
  loading,
  colors,
  onSaved,
}: {
  value: string | null;
  accounts: ClientAccount[] | null;
  loading: boolean;
  colors: ReturnType<typeof useColorScheme>["colors"];
  onSaved: (accountNumber: string) => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const selected = (accounts ?? []).find((a) => a.accountNumber === value) ?? null;

  async function choose(accountNumber: string) {
    if (accountNumber === value) {
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      await setDefaultAccount(accountNumber);
      onSaved(accountNumber);
      toast.showToast({ tier: "success", message: "Default account updated." });
      setOpen(false);
    } catch (err) {
      toast.showToast({
        tier: "danger",
        message: err instanceof Error && err.message ? err.message : "Unable to update your default account. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <View className="bg-surface-card">
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        className="flex-row items-center justify-between gap-3 px-4 py-3"
      >
        <Text className="font-sans text-[12px] text-text-secondary">Default account</Text>
        <View className="flex-row items-center gap-1.5">
          {loading ? (
            <ActivityIndicator size="small" color={colors.textMuted} />
          ) : (
            <Text className="font-mono text-[13px] text-text-primary">
              {selected ? `${selected.bankCode} ••${selected.accountNumber.slice(-4)}` : "Choose one"}
            </Text>
          )}
          {saving ? <Loader2 size={14} color={colors.textMuted} strokeWidth={2} /> : <ChevronRight size={14} color={colors.textMuted} strokeWidth={2} style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }} />}
        </View>
      </Pressable>
      {open && accounts && accounts.length > 0 ? (
        <View className="gap-1 px-3 pb-3">
          {accounts.map((a) => {
            const active = a.accountNumber === value;
            return (
              <Pressable
                key={a.accountNumber}
                onPress={() => choose(a.accountNumber)}
                disabled={saving}
                className={cn(
                  "flex-row items-center justify-between rounded-lg border px-3 py-2.5",
                  active ? "border-accent bg-accent-soft" : "border-border-soft",
                )}
              >
                <Text className="font-mono text-[12px] text-text-primary">
                  {a.bankCode} · {a.type} · ••{a.accountNumber.slice(-4)}
                </Text>
                {active ? <Check size={16} color={colors.accent} strokeWidth={2.4} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <Text className="px-4 pb-3 font-sans text-[11px] text-text-muted">
        Incoming transfers from other PayZo users arrive here.
      </Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="px-1 font-sans-bold text-[10px] uppercase tracking-[0.1em] text-text-muted">{title}</Text>
      <View className="overflow-hidden rounded-[12px] border border-border-soft">{children}</View>
    </View>
  );
}

function InfoRow({
  label,
  value,
  mono,
  icon,
}: {
  label: string;
  value: string;
  mono?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3 border-b border-border-soft bg-surface-card px-4 py-3">
      <View className="flex-row items-center gap-2">
        {icon}
        <Text className="font-sans text-[12px] text-text-secondary">{label}</Text>
      </View>
      <Text numberOfLines={1} className={cn("max-w-[60%] text-right text-[13px] text-text-primary", mono ? "font-mono" : "font-sans-semibold")}>
        {value}
      </Text>
    </View>
  );
}

function MenuRow({
  icon,
  label,
  onPress,
  chevron,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  chevron?: boolean;
}) {
  const { colors } = useColorScheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="flex-row items-center gap-3 px-4 py-3.5">
      {icon}
      <Text className="flex-1 font-sans-semibold text-[14px] text-text-primary">{label}</Text>
      {chevron ? <ChevronRight size={16} color={colors.textMuted} strokeWidth={2} /> : null}
    </Pressable>
  );
}

