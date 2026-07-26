import type { APIRoute } from "astro";
import { createBriefingSession, BRIEFING_ITEM_KINDS } from "@/lib/briefing-sessions.ts";
import { hasBearerToken } from "@/lib/internal-auth.ts";
import { initiateVoiceSessionCall } from "@/lib/telnyx.ts";
import type { Bindings } from "@/lib/types.ts";
import { createVoiceSession, updateVoiceSession } from "@/lib/voice-sessions.ts";

const IDEMPOTENCY_KEY = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as Bindings;
  if (!(await hasBearerToken(request, env.HERMES_INTERNAL_TOKEN))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const key = request.headers.get("Idempotency-Key");
  if (!key || !IDEMPOTENCY_KEY.test(key)) {
    return Response.json({ error: "valid Idempotency-Key required" }, { status: 400 });
  }
  let input: Record<string, unknown>;
  try {
    input = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  if ("to" in input || "phone" in input || "phone_number" in input || "destination" in input) {
    return Response.json({ error: "invalid briefing" }, { status: 400 });
  }
  const rawItems = Array.isArray(input.items) ? input.items : [];
  if (
    typeof input.title !== "string" ||
    input.title.length < 1 ||
    input.title.length > 160 ||
    rawItems.length > 40
  ) {
    return Response.json({ error: "invalid briefing" }, { status: 400 });
  }
  const items = rawItems.flatMap((value, index) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    if (
      !BRIEFING_ITEM_KINDS.includes(item.kind as never) ||
      typeof item.title !== "string" ||
      typeof item.summary !== "string" ||
      item.title.length > 160 ||
      item.summary.length > 1000
    ) {
      return [];
    }
    return [
      {
        id: typeof item.id === "string" ? item.id.slice(0, 100) : `item-${index + 1}`,
        kind: item.kind as (typeof BRIEFING_ITEM_KINDS)[number],
        title: item.title,
        summary: item.summary,
        source: typeof item.source === "string" ? item.source.slice(0, 80) : undefined,
        requiresResponse: item.requires_response === true,
        details: typeof item.details === "string" ? item.details.slice(0, 2000) : undefined,
      },
    ];
  });
  if (items.length !== rawItems.length) {
    return Response.json({ error: "invalid briefing item" }, { status: 400 });
  }

  const maxDurationSeconds =
    Number.isInteger(input.max_duration_seconds) &&
    Number(input.max_duration_seconds) >= 60 &&
    Number(input.max_duration_seconds) <= 600
      ? Number(input.max_duration_seconds)
      : 300;
  const { session, created } = await createVoiceSession(env.VOICE_DB, maxDurationSeconds, key);
  if (!created) {
    return Response.json({ id: session.id, status: session.status, item_count: items.length });
  }
  await createBriefingSession(env.VOICE_DB, session.id, input.title, items);
  try {
    const call = await initiateVoiceSessionCall(env, session);
    const updated = await updateVoiceSession(env.VOICE_DB, session.id, {
      status: "calling",
      telnyxCallControlId: call.callControlId,
      telnyxCallSessionId: call.callSessionId,
    });
    return Response.json(
      { id: session.id, status: updated?.status ?? session.status, item_count: items.length },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Briefing call failed";
    await updateVoiceSession(env.VOICE_DB, session.id, { status: "failed", error: message });
    return Response.json({ error: "call failed", id: session.id }, { status: 502 });
  }
};
