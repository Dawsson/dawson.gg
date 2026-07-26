const WHOOP_EVENT_TYPES = [
  "workout.updated",
  "workout.deleted",
  "sleep.updated",
  "sleep.deleted",
  "recovery.updated",
  "recovery.deleted",
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;

export type WhoopWebhookEvent = {
  userId: string;
  resourceId: string;
  type: (typeof WHOOP_EVENT_TYPES)[number];
  traceId: string;
};

function decodeBase64(value: string): Uint8Array | null {
  try {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export async function verifyWhoopWebhook(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  clientSecret: string,
  now = Date.now(),
): Promise<boolean> {
  if (!signature || !timestamp || !clientSecret || !/^\d+$/.test(timestamp)) return false;
  const timestampMs = Number(timestamp);
  if (!Number.isSafeInteger(timestampMs) || Math.abs(now - timestampMs) > MAX_SIGNATURE_AGE_MS) {
    return false;
  }

  const received = decodeBase64(signature);
  if (!received) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(clientSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const calculated = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(timestamp + rawBody)),
  );
  return constantTimeEqual(calculated, received);
}

export function parseWhoopWebhook(rawBody: string): WhoopWebhookEvent | null {
  try {
    const input = JSON.parse(rawBody) as Record<string, unknown>;
    const userId =
      typeof input.user_id === "number" && Number.isSafeInteger(input.user_id) && input.user_id > 0
        ? String(input.user_id)
        : null;
    if (
      !userId ||
      typeof input.id !== "string" ||
      !UUID.test(input.id) ||
      typeof input.type !== "string" ||
      !WHOOP_EVENT_TYPES.includes(input.type as WhoopWebhookEvent["type"]) ||
      typeof input.trace_id !== "string" ||
      !UUID.test(input.trace_id)
    ) {
      return null;
    }
    return {
      userId,
      resourceId: input.id,
      type: input.type as WhoopWebhookEvent["type"],
      traceId: input.trace_id,
    };
  } catch {
    return null;
  }
}
