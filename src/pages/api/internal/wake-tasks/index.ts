import type { APIRoute } from "astro";
import { createBriefingSession, getBriefingSession } from "@/lib/briefing-sessions.ts";
import { hasBearerToken } from "@/lib/internal-auth.ts";
import { initiateVoiceSessionCall } from "@/lib/telnyx.ts";
import type { Bindings } from "@/lib/types.ts";
import { parseWakeBridgeInput, publicWakeBridge } from "@/lib/wake-bridge.ts";
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
  let input;
  try {
    input = parseWakeBridgeInput(await request.json());
  } catch {
    input = null;
  }
  if (!input) return Response.json({ error: "invalid wake task" }, { status: 400 });

  const { session, created } = await createVoiceSession(
    env.VOICE_DB,
    input.maxDurationSeconds,
    key,
  );
  if (!created) {
    const briefing = await getBriefingSession(env.VOICE_DB, session);
    return briefing
      ? Response.json(publicWakeBridge(briefing))
      : Response.json({ error: "wake task unavailable" }, { status: 409 });
  }
  await createBriefingSession(env.VOICE_DB, session.id, "Wake Dawson", [
    {
      id: "wake-confirmation",
      kind: "reminder",
      title: "Wake Dawson",
      summary: input.goal,
      source: "hermes-wake",
      requiresResponse: true,
      details: [
        `Severity: ${input.severity}.`,
        `Success condition: ${input.successCondition}`,
        "Be brief and firm. Ask Dawson to say exactly: I am awake and getting up.",
        "Do not accept silence, voicemail, mumbling, or vague speech.",
        "Only after the exact confirmation, call record_action once with type=note, status=approved,",
        'and content exactly "Dawson explicitly confirmed: I am awake and getting up."',
        "Then call finish_briefing and hang up.",
      ].join(" "),
    },
  ]);

  try {
    const call = await initiateVoiceSessionCall(env, session);
    const updated = await updateVoiceSession(env.VOICE_DB, session.id, {
      status: "calling",
      telnyxCallControlId: call.callControlId,
      telnyxCallSessionId: call.callSessionId,
    });
    const briefing = await getBriefingSession(env.VOICE_DB, updated ?? session);
    return briefing
      ? Response.json(publicWakeBridge(briefing), { status: 201 })
      : Response.json({ error: "wake task unavailable" }, { status: 500 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Wake call failed";
    const updated = await updateVoiceSession(env.VOICE_DB, session.id, {
      status: "failed",
      error: message,
    });
    console.error("Telnyx wake bridge dial failed", { sessionId: session.id, message });
    const briefing = await getBriefingSession(env.VOICE_DB, updated ?? session);
    return briefing
      ? Response.json(publicWakeBridge(briefing), { status: 502 })
      : Response.json({ error: "call failed" }, { status: 502 });
  }
};

export const GET: APIRoute = async () => new Response("Method not allowed", { status: 405 });
