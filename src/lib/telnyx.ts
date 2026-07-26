import type { Bindings } from "./types.ts";
import type { VoiceSession } from "./voice-sessions.ts";

const TELNYX_API_BASE = "https://api.telnyx.com/v2";
const MAX_WEBHOOK_AGE_SECONDS = 5 * 60;

export interface TelnyxCallEvent {
  data: {
    id: string;
    event_type: string;
    occurred_at?: string;
    payload: {
      call_control_id?: string;
      call_leg_id?: string;
      call_session_id?: string;
      [key: string]: unknown;
    };
    record_type?: string;
  };
}

type Fetch = typeof fetch;

export interface VoiceClientState {
  version: 1;
  voiceSessionId: string;
}

function decodeBase64(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function decodePublicKey(publicKey: string): { format: "raw" | "spki"; bytes: ArrayBuffer } {
  const trimmed = publicKey.trim();
  if (trimmed.includes("BEGIN PUBLIC KEY")) {
    const encoded = trimmed.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, "");
    return { format: "spki", bytes: decodeBase64(encoded) };
  }

  if (/^[\da-f]{64}$/i.test(trimmed)) {
    const bytes = new Uint8Array(new ArrayBuffer(32));
    for (let index = 0; index < bytes.length; index++) {
      bytes[index] = Number.parseInt(trimmed.slice(index * 2, index * 2 + 2), 16);
    }
    return {
      format: "raw",
      bytes: bytes.buffer,
    };
  }

  const bytes = decodeBase64(trimmed);
  return { format: bytes.byteLength === 32 ? "raw" : "spki", bytes };
}

export async function verifyTelnyxWebhook(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  publicKey: string,
  now = Date.now(),
): Promise<boolean> {
  if (!signature || !timestamp || !/^\d+$/.test(timestamp)) return false;

  const timestampSeconds = Number(timestamp);
  if (
    !Number.isSafeInteger(timestampSeconds) ||
    Math.abs(Math.floor(now / 1000) - timestampSeconds) > MAX_WEBHOOK_AGE_SECONDS
  ) {
    return false;
  }

  try {
    const keyData = decodePublicKey(publicKey);
    const key = await crypto.subtle.importKey(
      keyData.format,
      keyData.bytes,
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    const signedPayload = new TextEncoder().encode(`${timestamp}|${rawBody}`);
    return await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      decodeBase64(signature),
      signedPayload,
    );
  } catch {
    return false;
  }
}

export function parseTelnyxCallEvent(rawBody: string): TelnyxCallEvent | null {
  try {
    const event = JSON.parse(rawBody) as Partial<TelnyxCallEvent>;
    if (
      typeof event.data?.id !== "string" ||
      typeof event.data.event_type !== "string" ||
      !event.data.payload ||
      typeof event.data.payload !== "object"
    ) {
      return null;
    }
    return event as TelnyxCallEvent;
  } catch {
    return null;
  }
}

async function telnyxRequest(
  path: string,
  apiKey: string,
  body: Record<string, unknown>,
  fetcher: Fetch,
): Promise<unknown> {
  const response = await fetcher(`${TELNYX_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let detail = "";
    try {
      const payload = (await response.json()) as {
        errors?: Array<{ code?: string; detail?: string; title?: string }>;
      };
      const error = payload.errors?.[0];
      detail = [error?.code, error?.title, error?.detail]
        .filter((value): value is string => typeof value === "string" && value.length > 0)
        .join(": ")
        .slice(0, 500);
    } catch {
      // Telnyx can return a non-JSON proxy response. Never include that raw body.
    }
    throw new Error(
      `Telnyx API request failed with status ${response.status}${detail ? `: ${detail}` : ""}`,
    );
  }

  return response.json();
}

export function encodeVoiceClientState(voiceSessionId: string): string {
  return btoa(JSON.stringify({ version: 1, voiceSessionId } satisfies VoiceClientState));
}

export function decodeVoiceClientState(value: unknown): VoiceClientState | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(atob(value)) as Partial<VoiceClientState>;
    return parsed.version === 1 && typeof parsed.voiceSessionId === "string"
      ? { version: 1, voiceSessionId: parsed.voiceSessionId }
      : null;
  } catch {
    return null;
  }
}

export async function initiateVoiceSessionCall(
  env: Pick<
    Bindings,
    "TELNYX_API_KEY" | "TELNYX_CONNECTION_ID" | "TELNYX_FROM_NUMBER" | "HERMES_TO_NUMBER"
  >,
  session: Pick<VoiceSession, "id" | "maxDurationSeconds">,
  fetcher: Fetch = fetch,
): Promise<{
  callControlId: string;
  callSessionId: string;
}> {
  const required = {
    TELNYX_API_KEY: env.TELNYX_API_KEY,
    TELNYX_CONNECTION_ID: env.TELNYX_CONNECTION_ID,
    TELNYX_FROM_NUMBER: env.TELNYX_FROM_NUMBER,
    HERMES_TO_NUMBER: env.HERMES_TO_NUMBER,
  };
  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`Missing required Telnyx configuration: ${missing.join(", ")}`);
  }
  const response = (await telnyxRequest(
    "/calls",
    required.TELNYX_API_KEY!,
    {
      connection_id: required.TELNYX_CONNECTION_ID,
      from: required.TELNYX_FROM_NUMBER,
      to: required.HERMES_TO_NUMBER,
      command_id: session.id,
      client_state: encodeVoiceClientState(session.id),
      time_limit_secs: session.maxDurationSeconds,
    },
    fetcher,
  )) as { data?: { call_control_id?: string; call_session_id?: string } };
  if (!response.data?.call_control_id || !response.data.call_session_id) {
    throw new Error("Telnyx dial response did not include call identifiers");
  }
  return {
    callControlId: response.data.call_control_id,
    callSessionId: response.data.call_session_id,
  };
}

export async function startVoiceAssistant(
  callControlId: string,
  env: Pick<Bindings, "TELNYX_API_KEY" | "TELNYX_AI_ASSISTANT_ID">,
  fetcher: Fetch = fetch,
): Promise<string> {
  if (!env.TELNYX_API_KEY || !env.TELNYX_AI_ASSISTANT_ID) {
    throw new Error("Missing required Telnyx AI Assistant configuration");
  }
  const response = (await telnyxRequest(
    `/calls/${encodeURIComponent(callControlId)}/actions/ai_assistant_start`,
    env.TELNYX_API_KEY,
    {
      assistant: { id: env.TELNYX_AI_ASSISTANT_ID },
    },
    fetcher,
  )) as { data?: { conversation_id?: string } };
  if (!response.data?.conversation_id) {
    throw new Error("Telnyx AI Assistant response did not include a conversation ID");
  }
  return response.data.conversation_id;
}
