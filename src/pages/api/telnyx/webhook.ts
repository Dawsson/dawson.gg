import type { APIRoute } from "astro";
import {
  decodeVoiceClientState,
  hangupCall,
  isHumanAnsweringMachineResult,
  parseTelnyxCallEvent,
  startVoiceAssistant,
  verifyTelnyxWebhook,
} from "@/lib/telnyx.ts";
import type { Bindings } from "@/lib/types.ts";
import {
  getVoiceSession,
  recordVoiceSessionEvent,
  updateVoiceSession,
} from "@/lib/voice-sessions.ts";

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as Bindings;
  const rawBody = await request.text();

  if (env.TELNYX_PUBLIC_KEY) {
    const isValid = await verifyTelnyxWebhook(
      rawBody,
      request.headers.get("telnyx-signature-ed25519"),
      request.headers.get("telnyx-timestamp"),
      env.TELNYX_PUBLIC_KEY,
    );
    if (!isValid) return new Response("Invalid webhook signature", { status: 403 });
  } else if (env.NODE_ENV === "production") {
    console.error("Telnyx webhook rejected: TELNYX_PUBLIC_KEY is not configured");
    return new Response("Webhook verification is not configured", { status: 503 });
  } else {
    console.warn("Telnyx webhook signature verification bypassed in development");
  }

  const event = parseTelnyxCallEvent(rawBody);
  if (!event) return new Response("Invalid webhook payload", { status: 400 });

  const { event_type: eventType, id: eventId, payload } = event.data;
  console.info("Telnyx voice event", {
    eventType,
    eventId,
    callSessionId: payload.call_session_id,
  });

  const clientState = decodeVoiceClientState(payload.client_state);
  if (!clientState) return new Response(null, { status: 204 });
  const session = await getVoiceSession(env.VOICE_DB, clientState.voiceSessionId);
  if (!session) return new Response(null, { status: 204 });

  const isNew = await recordVoiceSessionEvent(
    env.VOICE_DB,
    session.id,
    eventId,
    eventType,
    event.data.occurred_at ?? new Date().toISOString(),
  );
  if (!isNew) return new Response(null, { status: 204 });

  if (eventType === "call.initiated") {
    await updateVoiceSession(env.VOICE_DB, session.id, {
      status: "calling",
      telnyxCallControlId: payload.call_control_id,
      telnyxCallSessionId: payload.call_session_id,
    });
  } else if (
    eventType === "call.machine.detection.ended" &&
    payload.call_control_id &&
    isHumanAnsweringMachineResult(payload.result)
  ) {
    locals.runtime.ctx.waitUntil(
      startVoiceAssistant(payload.call_control_id, env)
        .then((conversationId) =>
          updateVoiceSession(env.VOICE_DB, session.id, {
            status: "in_progress",
            telnyxConversationId: conversationId,
            telnyxCallControlId: payload.call_control_id,
            telnyxCallSessionId: payload.call_session_id,
          }),
        )
        .catch((error) => {
          const message = error instanceof Error ? error.message : "unknown error";
          console.error("Telnyx voice assistant failed", { sessionId: session.id, message });
          return updateVoiceSession(env.VOICE_DB, session.id, { status: "failed", error: message });
        }),
    );
  } else if (
    eventType === "call.machine.detection.ended" &&
    payload.call_control_id &&
    env.TELNYX_API_KEY
  ) {
    await updateVoiceSession(env.VOICE_DB, session.id, {
      status: "failed",
      error: "machine_answered",
    });
    locals.runtime.ctx.waitUntil(
      hangupCall(payload.call_control_id, `${eventId}-machine-hangup`, env.TELNYX_API_KEY).catch(
        (error) => {
          console.error("Telnyx machine-answer hangup failed", {
            sessionId: session.id,
            message: error instanceof Error ? error.message : "unknown error",
          });
        },
      ),
    );
  } else if (eventType === "call.hangup" && session.status !== "completed") {
    await updateVoiceSession(env.VOICE_DB, session.id, {
      status: session.status === "in_progress" ? "completed" : "failed",
    });
  }

  return new Response(null, { status: 204 });
};
