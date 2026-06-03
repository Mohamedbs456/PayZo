interface KeycloakEnv {
  url: string;
  realm: string;
  clientId: string;
  /** Only set for confidential clients. Public PKCE clients leave this undefined. */
  clientSecret?: string;
}

interface AppEnv {
  apiBaseUrl: string;
  healthUrl: string;
  keycloak: KeycloakEnv;
}

function readEnv(key: keyof ImportMetaEnv): string {
  const value = import.meta.env[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `Missing required env var "${key}". Copy .env.example to .env and set it.`,
    );
  }
  return value;
}

function readOptionalEnv(key: keyof ImportMetaEnv): string | undefined {
  const value = import.meta.env[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export const env: AppEnv = {
  apiBaseUrl: readEnv("VITE_API_BASE_URL"),
  healthUrl: readEnv("VITE_HEALTH_URL"),
  keycloak: {
    url: readEnv("VITE_KEYCLOAK_URL"),
    realm: readEnv("VITE_KEYCLOAK_REALM"),
    clientId: readEnv("VITE_KEYCLOAK_CLIENT_ID"),
    clientSecret: readOptionalEnv("VITE_KEYCLOAK_CLIENT_SECRET"),
  },
};

// Loud warning if a client secret has been baked into the bundle in a
// production build. Anything in `import.meta.env.VITE_*` ships to every
// visitor's DevTools — the Keycloak client for this app MUST be configured
// as PUBLIC (no secret). If you need a confidential client, that auth
// flow has to live behind a backend-for-frontend, not in the browser.
if (env.keycloak.clientSecret && !import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.error(
    "[payzo] VITE_KEYCLOAK_CLIENT_SECRET is set in a production build — " +
      "the secret ships to every browser. Configure the Keycloak client as " +
      "public + PKCE, or move auth behind a BFF.",
  );
}
