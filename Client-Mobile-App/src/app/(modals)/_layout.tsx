import { Stack } from "expo-router";

export default function ModalsLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: "fade_from_bottom", animationDuration: 240 }} />;
}
