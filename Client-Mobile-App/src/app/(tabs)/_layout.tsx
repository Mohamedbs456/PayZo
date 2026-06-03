import { Redirect, Tabs } from "expo-router";
import { useAuthStore } from "@/store/authStore";
import { CustomTabBar } from "@/components/layout/CustomTabBar";

export default function TabsLayout() {
  const authed = useAuthStore((s) => s.authed);

  if (!authed) return <Redirect href="/login" />;

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="accounts" options={{ title: "Accounts" }} />
      <Tabs.Screen name="transfer" options={{ title: "Send" }} />
      <Tabs.Screen name="dashboard" options={{ title: "Home" }} />
      <Tabs.Screen name="transactions" options={{ title: "History" }} />
      <Tabs.Screen name="alerts" options={{ title: "Alerts" }} />
    </Tabs>
  );
}
