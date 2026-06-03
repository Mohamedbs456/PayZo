import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Bell } from "lucide-react-native";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Avatar } from "@/components/ui/Avatar";

interface TopBarProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  me?: { initials: string; trustScore?: number; profilePictureUrl?: string | null } | null;
  onAvatarPress?: () => void;
  onBellPress?: () => void;
  unreadCount?: number;
}

export function TopBar({
  title,
  subtitle,
  showBack = false,
  me,
  onAvatarPress,
  onBellPress,
  unreadCount = 0,
}: TopBarProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useColorScheme();
  return (
    <View style={{ paddingTop: insets.top }} className="border-b border-border-soft bg-surface-card">
      <View className="flex-row items-center gap-3 px-4 py-3">
        {showBack ? (
          <Pressable onPress={() => router.back()} accessibilityLabel="Back" hitSlop={8}>
            <ArrowLeft size={22} color={colors.textPrimary} strokeWidth={2} />
          </Pressable>
        ) : null}

        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="font-display-bold text-[18px] text-text-primary">
            {title}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} className="font-sans text-[12px] text-text-secondary">
              {subtitle}
            </Text>
          ) : null}
        </View>

        {onBellPress ? (
          <Pressable
            onPress={onBellPress}
            accessibilityLabel="Notifications"
            hitSlop={8}
            className="size-10 items-center justify-center rounded-full"
          >
            <Bell size={22} color={colors.textPrimary} strokeWidth={1.8} />
            {unreadCount > 0 ? (
              <View className="absolute right-2 top-2 size-2 rounded-full bg-negative" />
            ) : null}
          </Pressable>
        ) : null}

        {me ? (
          <Pressable onPress={onAvatarPress} accessibilityLabel="Profile">
            <Avatar url={me.profilePictureUrl} initials={me.initials} size={40} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
