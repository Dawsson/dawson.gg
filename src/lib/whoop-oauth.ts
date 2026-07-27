import type { Bindings } from "./types.ts";

const WHOOP_AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
const WHOOP_API_BASE = "https://api.prod.whoop.com/developer/v2";
const TOKEN_KEY = "whoop:oauth:tokens";
export const WHOOP_AUTHORIZED_USER_KEY = "whoop:oauth:user-id";
const REDIRECT_URI = "https://dawson.gg/api/whoop/callback";
const SCOPES = [
  "offline",
  "read:profile",
  "read:recovery",
  "read:cycles",
  "read:sleep",
  "read:workout",
  "read:body_measurement",
];

type WhoopTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

export type StoredWhoopTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  expiresIn: number;
  scopes: string[];
};

type WhoopOAuthEnv = Pick<
  Bindings,
  "WHOOP_CLIENT_ID" | "WHOOP_CLIENT_SECRET" | "HERMES_INTERNAL_TOKEN"
>;

export class WhoopOAuthError extends Error {
  constructor(
    public readonly stage:
      | "configuration"
      | "state_validation"
      | "token_exchange"
      | "profile_fetch"
      | "identity_check"
      | "token_storage",
  ) {
    super(`WHOOP OAuth failed during ${stage}`);
  }
}

function requireConfig(env: WhoopOAuthEnv) {
  if (!env.WHOOP_CLIENT_ID || !env.WHOOP_CLIENT_SECRET || !env.HERMES_INTERNAL_TOKEN) {
    throw new WhoopOAuthError("configuration");
  }
  return {
    clientId: env.WHOOP_CLIENT_ID,
    clientSecret: env.WHOOP_CLIENT_SECRET,
    encryptionSecret: `${env.WHOOP_CLIENT_SECRET}:${env.HERMES_INTERNAL_TOKEN}:whoop-oauth-v1`,
  };
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): ArrayBuffer {
  const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function encryptionKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptTokens(tokens: StoredWhoopTokens, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(secret),
    new TextEncoder().encode(JSON.stringify(tokens)),
  );
  return `${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
}

async function decryptTokens(payload: string, secret: string): Promise<StoredWhoopTokens> {
  const [iv, encrypted] = payload.split(".");
  if (!iv || !encrypted) throw new Error("Invalid WHOOP token payload");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) },
    await encryptionKey(secret),
    fromBase64(encrypted),
  );
  return JSON.parse(new TextDecoder().decode(decrypted)) as StoredWhoopTokens;
}

async function tokenRequest(form: URLSearchParams): Promise<WhoopTokenResponse> {
  const response = await fetch(WHOOP_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!response.ok) throw new Error(`WHOOP token request failed with status ${response.status}`);
  return response.json<WhoopTokenResponse>();
}

export async function storeWhoopTokens(
  cache: KVNamespace,
  response: WhoopTokenResponse,
  env: WhoopOAuthEnv,
  fallbackRefreshToken?: string,
  now = Date.now(),
): Promise<void> {
  const config = requireConfig(env);
  if (
    !response.access_token ||
    !Number.isFinite(response.expires_in) ||
    Number(response.expires_in) <= 0
  ) {
    throw new Error("WHOOP token response is incomplete");
  }
  const refreshToken = response.refresh_token ?? fallbackRefreshToken;
  if (!refreshToken) throw new Error("WHOOP refresh token is missing");
  const expiresIn = Number(response.expires_in);
  const tokens: StoredWhoopTokens = {
    accessToken: response.access_token,
    refreshToken,
    expiresAt: now + expiresIn * 1000,
    expiresIn,
    scopes: response.scope?.split(" ").filter(Boolean) ?? SCOPES,
  };
  await cache.put(TOKEN_KEY, await encryptTokens(tokens, config.encryptionSecret));
}

export async function createWhoopAuthorizationUrl(
  cache: KVNamespace,
  env: WhoopOAuthEnv,
): Promise<string> {
  const config = requireConfig(env);
  const state = toBase64(crypto.getRandomValues(new Uint8Array(6)))
    .replaceAll("+", "-")
    .replaceAll("/", "_");
  await cache.put(`whoop:oauth-state:${state}`, "pending", { expirationTtl: 10 * 60 });
  const url = new URL(WHOOP_AUTH_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

export async function completeWhoopAuthorization(
  cache: KVNamespace,
  env: WhoopOAuthEnv,
  code: string,
  state: string,
): Promise<void> {
  const config = requireConfig(env);
  const stateKey = `whoop:oauth-state:${state}`;
  if ((await cache.get(stateKey)) !== "pending") {
    throw new WhoopOAuthError("state_validation");
  }
  await cache.delete(stateKey);

  let tokens: WhoopTokenResponse;
  try {
    tokens = await tokenRequest(
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
    );
  } catch {
    throw new WhoopOAuthError("token_exchange");
  }
  if (!tokens.access_token) throw new WhoopOAuthError("token_exchange");
  const profileResponse = await fetch(`${WHOOP_API_BASE}/user/profile/basic`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profileResponse.ok) {
    throw new WhoopOAuthError("profile_fetch");
  }
  const profile = (await profileResponse.json()) as {
    user_id?: number | string;
    id?: number | string;
    email?: string;
  };
  const profileId = String(profile.user_id ?? profile.id ?? "");
  if (profile.email?.toLowerCase() !== "hello@dawson.gg" || !/^\d+$/.test(profileId)) {
    throw new WhoopOAuthError("identity_check");
  }
  try {
    await storeWhoopTokens(cache, tokens, env);
    await cache.put(WHOOP_AUTHORIZED_USER_KEY, profileId);
  } catch {
    throw new WhoopOAuthError("token_storage");
  }
}

async function loadStoredTokens(
  cache: KVNamespace,
  env: WhoopOAuthEnv,
): Promise<StoredWhoopTokens | null> {
  const config = requireConfig(env);
  const encrypted = await cache.get(TOKEN_KEY);
  if (!encrypted) return null;
  return decryptTokens(encrypted, config.encryptionSecret);
}

async function refreshAccessToken(
  cache: KVNamespace,
  env: WhoopOAuthEnv,
  tokens: StoredWhoopTokens,
): Promise<string> {
  const config = requireConfig(env);
  const refreshed = await tokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: "offline",
    }),
  );
  await storeWhoopTokens(cache, refreshed, env, tokens.refreshToken);
  if (!refreshed.access_token) throw new Error("WHOOP refresh response is incomplete");
  return refreshed.access_token;
}

async function accessToken(
  cache: KVNamespace,
  env: WhoopOAuthEnv,
  forceRefresh = false,
): Promise<string | null> {
  const tokens = await loadStoredTokens(cache, env);
  if (!tokens) return null;
  if (!forceRefresh && tokens.expiresAt > Date.now() + 5 * 60 * 1000) {
    return tokens.accessToken;
  }
  return refreshAccessToken(cache, env, tokens);
}

class WhoopApiUnauthorizedError extends Error {}

async function whoopGet(path: string, token: string, allowNotFound = false): Promise<unknown> {
  const response = await fetch(`${WHOOP_API_BASE}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (allowNotFound && response.status === 404) return null;
  if (response.status === 401) throw new WhoopApiUnauthorizedError("WHOOP access token rejected");
  if (!response.ok) throw new Error(`WHOOP API request failed with status ${response.status}`);
  return response.json();
}

async function fetchWhoopSnapshot(token: string): Promise<Record<string, unknown>> {
  const start = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const query = `?limit=5&start=${encodeURIComponent(start)}`;
  const [profile, recovery, sleeps, cycles, workouts, body] = await Promise.all([
    whoopGet("user/profile/basic", token),
    whoopGet(`recovery${query}`, token),
    whoopGet(`activity/sleep${query}`, token),
    whoopGet(`cycle${query}`, token),
    whoopGet(`activity/workout${query}`, token),
    whoopGet("user/measurement/body", token, true),
  ]);
  return {
    profile,
    recovery,
    sleeps,
    cycles,
    workouts,
    body,
    fetched_at: new Date().toISOString(),
  };
}

export async function getWhoopSnapshot(
  cache: KVNamespace,
  env: WhoopOAuthEnv,
): Promise<Record<string, unknown> | null> {
  const token = await accessToken(cache, env);
  if (!token) return null;
  try {
    return await fetchWhoopSnapshot(token);
  } catch (error) {
    if (!(error instanceof WhoopApiUnauthorizedError)) throw error;
    const refreshedToken = await accessToken(cache, env, true);
    if (!refreshedToken) return null;
    return fetchWhoopSnapshot(refreshedToken);
  }
}
