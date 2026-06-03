import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Languages, LogOut, Moon, Sun, X } from "lucide-react-native";
import { cn } from "@/lib/cn";
import { AlertDialog } from "@/components/ui/AlertDialog";
import { Avatar } from "@/components/ui/Avatar";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useMe, deriveInitials } from "@/hooks/useMe";
import { useAuthStore } from "@/store/authStore";
import { type AppLocale, getLocale, setDarkModePref, setLocalePref } from "@/lib/clientPrefs";
import { unregisterPush } from "@/lib/push/registration";

export default function ProfileMenuModal() {
  const insets = useSafeAreaInsets();
  const { scheme, colors, setColorScheme } = useColorScheme();
  const { me } = useMe();
  const queryClient = useQueryClient();

  const [locale, setLocale] = useState<AppLocale>("en");
  useEffect(() => {
    void getLocale().then(setLocale);
  }, []);

  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);

  function setTheme(t: "light" | "dark") {
    setColorScheme(t);
    void setDarkModePref(t === "dark");
  }
  function chooseLocale(l: AppLocale) {
    setLocale(l);
    void setLocalePref(l);
  }

  async function doLogout() {
    setLogoutBusy(true);
    try {
      await unregisterPush();
    } catch {}
    try {
      await useAuthStore.getState().logout();
    } catch {}
    queryClient.clear();
    setLogoutBusy(false);
    setLogoutOpen(false);
    router.replace("/login");
  }

  return (
    <View className="flex-1 bg-surface-soft" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-4 py-3">
        <Text className="font-display-bold text-[18px] text-text-primary">Profile</Text>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/dashboard"))} accessibilityLabel="Close" hitSlop={8} className="size-9 items-center justify-center rounded-full">
          <X size={22} color={colors.textPrimary} strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 16 }}>
        <Pressable
          onPress={() => router.push("/profile")}
          accessibilityRole="button"
          className="flex-row items-center gap-3 rounded-[16px] border border-border-soft bg-surface-card p-4"
        >
          <Avatar url={me?.profilePictureUrl ?? null} initials={deriveInitials(me)} size={56} />
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="font-sans-bold text-[16px] text-text-primary">
              {me ? `${me.firstName} ${me.lastName}` : "—"}
            </Text>
            {me ? (
              <Text className="font-sans text-[12px] text-text-secondary">
                @{me.username} · Trust {me.trustScore}
              </Text>
            ) : null}
          </View>
          <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} />
        </Pressable>

        <View className="overflow-hidden rounded-[16px] border border-border-soft bg-surface-card">
          <SegmentRow
            icon={
              scheme === "dark" ? (
                <Moon size={18} color={colors.textSecondary} strokeWidth={2} />
              ) : (
                <Sun size={18} color={colors.textSecondary} strokeWidth={2} />
              )
            }
            label="Theme"
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
            value={scheme}
            onChange={(v) => setTheme(v as "light" | "dark")}
          />
          <Divider />
          <SegmentRow
            icon={<Languages size={18} color={colors.textSecondary} strokeWidth={2} />}
            label="Language"
            options={[
              { value: "en", label: "EN" },
              { value: "fr", label: "FR" },
            ]}
            value={locale}
            onChange={(v) => chooseLocale(v as AppLocale)}
          />
        </View>

        <Pressable
          onPress={() => setLogoutOpen(true)}
          accessibilityRole="button"
          className="flex-row items-center justify-center gap-2 rounded-[14px] border border-border bg-surface-card py-4"
        >
          <LogOut size={18} color={colors.negative} strokeWidth={2} />
          <Text className="font-sans-semibold text-[14px] text-negative">Log out</Text>
        </Pressable>
      </ScrollView>

      <AlertDialog
        open={logoutOpen}
        variant="warning"
        title="Sign out of PayZo?"
        message="You'll need to log in again with your password and a one-time code."
        confirmLabel="Sign out"
        cancelLabel="Stay signed in"
        busy={logoutBusy}
        onConfirm={doLogout}
        onCancel={() => setLogoutOpen(false)}
      />
    </View>
  );
}

function SegmentRow({
  icon,
  label,
  options,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View className="flex-row items-center gap-3 px-4 py-3">
      {icon}
      <Text className="flex-1 font-sans-semibold text-[14px] text-text-primary">{label}</Text>
      <View className="flex-row gap-1 rounded-lg bg-surface-soft p-1">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(o.value)}
              className={cn("h-7 items-center justify-center rounded-md px-3", active && "bg-surface-card")}
            >
              <Text className={cn("text-[12px]", active ? "font-sans-semibold text-text-primary" : "font-sans-medium text-text-secondary")}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Divider() {
  return <View className="h-px bg-border-soft" />;
}
