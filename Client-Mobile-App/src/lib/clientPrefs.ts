import AsyncStorage from "@react-native-async-storage/async-storage";

// Same storage keys as the web client for cross-codebase consistency (pitfall 18).
const DARK_KEY = "payzo.client.darkMode";
const LOCALE_KEY = "payzo.client.locale";

export type AppLocale = "en" | "fr";

export async function getStoredTheme(): Promise<"dark" | "light" | null> {
  const v = await AsyncStorage.getItem(DARK_KEY);
  return v === "1" ? "dark" : v === "0" ? "light" : null;
}

export async function setDarkModePref(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(DARK_KEY, enabled ? "1" : "0");
}

export async function getLocale(): Promise<AppLocale> {
  const v = await AsyncStorage.getItem(LOCALE_KEY);
  return v === "fr" ? "fr" : "en";
}

export async function setLocalePref(locale: AppLocale): Promise<void> {
  await AsyncStorage.setItem(LOCALE_KEY, locale);
}
