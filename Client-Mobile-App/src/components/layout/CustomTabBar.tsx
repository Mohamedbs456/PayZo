import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import {
  ArrowLeftRight,
  Home,
  Receipt,
  ShieldAlert,
  Wallet,
  type LucideIcon,
} from "lucide-react-native";
import { useColorScheme } from "@/hooks/useColorScheme";
import { motion } from "@/lib/tokens";

const ICONS: Record<string, LucideIcon> = {
  accounts: Wallet,
  transfer: ArrowLeftRight,
  dashboard: Home,
  transactions: Receipt,
  alerts: ShieldAlert,
};

export function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors } = useColorScheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{ paddingBottom: insets.bottom + 6 }}
      className="flex-row border-t border-border-soft bg-surface-card pt-2.5"
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const { options } = descriptors[route.key];
        const label = (options.title ?? route.name) as string;
        const Icon = ICONS[route.name] ?? Home;

        const onPress = () => {
          void Haptics.selectionAsync();
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        return (
          <TabItem
            key={route.key}
            focused={focused}
            label={label}
            Icon={Icon}
            onPress={onPress}
            activeIcon={colors.accentForeground}
            inactiveIcon={colors.textMuted}
          />
        );
      })}
    </View>
  );
}

function TabItem({
  focused,
  label,
  Icon,
  onPress,
  activeIcon,
  inactiveIcon,
}: {
  focused: boolean;
  label: string;
  Icon: LucideIcon;
  onPress: () => void;
  activeIcon: string;
  inactiveIcon: string;
}) {
  const reduced = useReducedMotion();
  const p = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    p.value = reduced
      ? focused
        ? 1
        : 0
      : withTiming(focused ? 1 : 0, {
          duration: motion.medium,
          easing: Easing.bezier(...motion.easeOut),
        });
  }, [focused, reduced, p]);

  const raiseStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -p.value * 16 }] }));
  const circleStyle = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ scale: 0.5 + p.value * 0.5 }],
  }));
  const labelStyle = useAnimatedStyle(() => ({ opacity: 1 - p.value }));

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      className="flex-1 items-center justify-center"
      style={{ height: 52 }}
    >
      <Animated.View style={raiseStyle} className="items-center justify-center">
        <View className="items-center justify-center">
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                width: 48,
                height: 48,
                borderRadius: 24,
                top: -12,
                left: -12,
                shadowColor: "#0e1b2c",
                shadowOpacity: 0.3,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 4 },
                elevation: 6,
              },
              circleStyle,
            ]}
            className="bg-accent"
          />
          <Icon size={24} color={focused ? activeIcon : inactiveIcon} strokeWidth={2} />
        </View>
      </Animated.View>
      <Animated.View style={labelStyle} className="mt-1">
        <Text className="font-sans-medium text-[10px] text-text-muted">{label}</Text>
      </Animated.View>
    </Pressable>
  );
}
