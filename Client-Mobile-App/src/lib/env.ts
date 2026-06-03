interface KeycloakEnv {
  url: string;
  realm: string;
  clientId: string;
  clientSecret?: string;
}

interface AppEnv {
  apiBaseUrl: string;
  healthUrl: string;
  keycloak: KeycloakEnv;
}

function req(key: string, value: string | undefined): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required env var "${key}". Copy .env.example to .env and set it.`);
  }
  return value;
}

// EXPO_PUBLIC_* values are inlined at bundle time, so process.env reads are static.
export const env: AppEnv = {
  apiBaseUrl: req("EXPO_PUBLIC_API_BASE_URL", process.env.EXPO_PUBLIC_API_BASE_URL),
  healthUrl: req("EXPO_PUBLIC_HEALTH_URL", process.env.EXPO_PUBLIC_HEALTH_URL),
  keycloak: {
    url: req("EXPO_PUBLIC_KEYCLOAK_URL", process.env.EXPO_PUBLIC_KEYCLOAK_URL),
    realm: req("EXPO_PUBLIC_KEYCLOAK_REALM", process.env.EXPO_PUBLIC_KEYCLOAK_REALM),
    clientId: req("EXPO_PUBLIC_KEYCLOAK_CLIENT_ID", process.env.EXPO_PUBLIC_KEYCLOAK_CLIENT_ID),
    clientSecret: process.env.EXPO_PUBLIC_KEYCLOAK_CLIENT_SECRET || undefined,
  },
};
