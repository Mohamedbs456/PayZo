import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@/lib/api/client";

const TOKEN_KEY = "payzo.client.pushToken";
const DENIED_KEY = "payzo.client.pushDenied";
const ANDROID_CHANNEL = "default";

let registering = false;

async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
    name: "Account activity",
    importance: Notifications.AndroidImportance.DEFAULT,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
}

// POST /clients/me/devices is a pending backend dependency (BACKEND_DEPENDENCIES.md).
// The call self-heals: it 404s today and is swallowed, and starts working the
// moment the partner ships the endpoint — no mobile change needed.
async function sendDeviceToken(token: string) {
  try {
    await api.post("/clients/me/devices", { token, platform: "android" });
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } catch (err) {
    if (__DEV__) console.log("[push] device registration deferred:", message(err));
  }
}

async function deleteDeviceToken(token: string) {
  try {
    await api.delete(`/clients/me/devices/${encodeURIComponent(token)}`);
  } catch (err) {
    if (__DEV__) console.log("[push] device unregister deferred:", message(err));
  }
}

export async function registerForPush() {
  if (registering || !Device.isDevice) return;
  registering = true;
  try {
    await ensureAndroidChannel();

    if ((await AsyncStorage.getItem(DENIED_KEY)) === "1") return;

    const current = await Notifications.getPermissionsAsync();
    let granted = current.granted;
    if (!granted && current.canAskAgain) {
      const asked = await Notifications.requestPermissionsAsync();
      granted = asked.granted;
    }
    if (!granted) {
      await AsyncStorage.setItem(DENIED_KEY, "1");
      return;
    }

    const { data: token } = await Notifications.getDevicePushTokenAsync();
    console.log("[push] FCM device token:", token);
    const lastSent = await AsyncStorage.getItem(TOKEN_KEY);
    if (token && token !== lastSent) await sendDeviceToken(token);
  } catch (err) {
    if (__DEV__) console.log("[push] registration skipped:", message(err));
  } finally {
    registering = false;
  }
}

export async function unregisterPush() {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (token) await deleteDeviceToken(token);
  await AsyncStorage.removeItem(TOKEN_KEY);
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
