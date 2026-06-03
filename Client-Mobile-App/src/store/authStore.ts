import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { decodeJwt, extractClientRoles } from "@/lib/auth/jwt";
import { kcLogout, type RawTokenResponse } from "@/lib/auth/keycloak";
import type { ClientRole } from "@/lib/auth/types";

const REFRESH_KEY = "payzo.refresh";
const REFRESH_BIOMETRIC_KEY = "payzo.refresh.biometric";
const BIOMETRIC_FLAG_KEY = "payzo.client.biometricEnabled";
const LAST_USER_KEY = "payzo.client.lastLoginUserId";

const BIOMETRIC_OPTS: SecureStore.SecureStoreOptions = {
  requireAuthentication: true,
  authenticationPrompt: "Unlock PayZo",
};

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  accessExpiresAt: number;
  refreshExpiresAt: number;
  userId: string | null;
  username: string | null;
  roles: ClientRole[];
  authed: boolean;
  biometricEnabled: boolean;
  lastLoginUserId: string | null;
  hydrated: boolean;

  hydrateFlags: () => Promise<void>;
  applyTokens: (raw: RawTokenResponse) => void;
  persistRefresh: () => Promise<void>;
  loadRefreshFromStore: () => Promise<string | null>;
  loadBiometricRefresh: () => Promise<string | null>;
  enableBiometric: () => Promise<void>;
  refreshExpired: () => boolean;
  clearSession: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  refreshToken: null,
  accessExpiresAt: 0,
  refreshExpiresAt: 0,
  userId: null,
  username: null,
  roles: [],
  authed: false,
  biometricEnabled: false,
  lastLoginUserId: null,
  hydrated: false,

  hydrateFlags: async () => {
    const [bio, last] = await Promise.all([
      AsyncStorage.getItem(BIOMETRIC_FLAG_KEY),
      AsyncStorage.getItem(LAST_USER_KEY),
    ]);
    set({ biometricEnabled: bio === "1", lastLoginUserId: last, hydrated: true });
  },

  // Holds tokens in memory and derives identity from the access token. Does not
  // persist — login persists only after the OTP step confirms the session.
  applyTokens: (raw) => {
    const now = Date.now();
    const claims = decodeJwt(raw.access_token);
    set({
      accessToken: raw.access_token,
      refreshToken: raw.refresh_token,
      accessExpiresAt: now + raw.expires_in * 1000,
      refreshExpiresAt: now + raw.refresh_expires_in * 1000,
      userId: claims.sub,
      username: claims.preferred_username ?? claims.sub,
      roles: extractClientRoles(claims),
      authed: true,
    });
  },

  persistRefresh: async () => {
    const { refreshToken, userId, biometricEnabled } = get();
    if (!refreshToken) return;
    if (biometricEnabled) {
      await SecureStore.setItemAsync(REFRESH_BIOMETRIC_KEY, refreshToken, BIOMETRIC_OPTS);
    } else {
      await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
    }
    if (userId) {
      await AsyncStorage.setItem(LAST_USER_KEY, userId);
      set({ lastLoginUserId: userId });
    }
  },

  loadRefreshFromStore: async () => {
    const token = await SecureStore.getItemAsync(REFRESH_KEY);
    if (token) set({ refreshToken: token });
    return token;
  },

  // Triggers the biometric prompt (the only read of this key). Hold the token
  // in memory after this so later refreshes never re-prompt (pitfall 6).
  loadBiometricRefresh: async () => {
    const token = await SecureStore.getItemAsync(REFRESH_BIOMETRIC_KEY, BIOMETRIC_OPTS);
    if (token) set({ refreshToken: token });
    return token;
  },

  enableBiometric: async () => {
    const { refreshToken } = get();
    if (!refreshToken) return;
    await SecureStore.setItemAsync(REFRESH_BIOMETRIC_KEY, refreshToken, BIOMETRIC_OPTS);
    await SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => {});
    await AsyncStorage.setItem(BIOMETRIC_FLAG_KEY, "1");
    set({ biometricEnabled: true });
  },

  refreshExpired: () => get().refreshExpiresAt <= Date.now(),

  clearSession: async () => {
    set({
      accessToken: null,
      refreshToken: null,
      accessExpiresAt: 0,
      refreshExpiresAt: 0,
      userId: null,
      username: null,
      roles: [],
      authed: false,
      biometricEnabled: false,
    });
    await Promise.all([
      SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => {}),
      SecureStore.deleteItemAsync(REFRESH_BIOMETRIC_KEY).catch(() => {}),
      AsyncStorage.removeItem(BIOMETRIC_FLAG_KEY),
    ]);
  },

  logout: async () => {
    const token = get().refreshToken;
    if (token) await kcLogout(token);
    await get().clearSession();
  },
}));
