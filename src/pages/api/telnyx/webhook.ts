import type { APIRoute } from "astro";
import {
  decodeWakeClientState,
  fetchConversationMessages,
  parseTelnyxCallEvent,
  speakWakeUpMessage,
  startWakeAssistant,
  verifyTelnyxWebhook,
} from "@/lib/telnyx.ts";
import type { Bindings } from "@/lib/types.ts";
import {
  classifyConversationMessages,
  getWakeTask,
  recordWakeTaskEvent,
  updateWakeTask,
} from "@/lib/wake-tasks.ts";

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
  console.info("Telnyx Call Control event", {
    eventType,
    eventId,
    callSessionId: payload.call_session_id,
  });

  const clientState = decodeWakeClientState(payload.client_state);
  if (!clientState) {
    if (eventType === "call.answered" && payload.call_control_id && env.TELNYX_API_KEY) {
      locals.runtime.ctx.waitUntil(
        speakWakeUpMessage(payload.call_control_id, eventId, env.TELNYX_API_KEY).catch((error) => {
          console.error(
            "Telnyx wake-up speech failed",
            error instanceof Error ? error.message : "unknown error",
          );
        }),
      );
    }
    return new Response(null, { status: 204 });
  }

  const task = await getWakeTask(env.WAKE_DB, clientState.wakeTaskId);
  if (!task) {
    console.error("Telnyx wake task event ignored: task not found", {
      eventType,
      eventId,
      taskId: clientState.wakeTaskId,
    });
    return new Response(null, { status: 204 });
  }
  const isNewEvent = await recordWakeTaskEvent(
    env.WAKE_DB,
    task.id,
    eventId,
    eventType,
    event.data.occurred_at ?? new Date().toISOString(),
  );
  if (!isNewEvent) return new Response(null, { status: 204 });

  switch (eventType) {
    case "call.initiated":
      await updateWakeTask(env.WAKE_DB, task.id, {
        status: "calling",
        telnyxCallControlId: payload.call_control_id,
        telnyxCallSessionId: payload.call_session_id,
      });
      break;
    case "call.answered": {
      if (!payload.call_control_id) {
        console.error("Telnyx wake assistant skipped: call control ID is missing", {
          taskId: task.id,
        });
        break;
      }
      locals.runtime.ctx.waitUntil(
        startWakeAssistant(payload.call_control_id, eventId, task, env)
          .then((conversationId) =>
            updateWakeTask(env.WAKE_DB, task.id, {
              status: "in_progress",
              telnyxConversationId: conversationId,
              telnyxCallControlId: payload.call_control_id,
              telnyxCallSessionId: payload.call_session_id,
            }),
          )
          .catch(async (error) => {
            const message = error instanceof Error ? error.message : "unknown error";
            console.error("Telnyx wake assistant failed; using speech fallback", {
              taskId: task.id,
              message,
            });
            if (env.TELNYX_API_KEY) {
              await speakWakeUpMessage(
                payload.call_control_id as string,
                `${eventId}-fallback`,
                env.TELNYX_API_KEY,
              );
            }
            await updateWakeTask(env.WAKE_DB, task.id, {
              status: "failed",
              result: "unclear",
              error: message,
              summary: "AI assistant failed; fixed wake-up message was played.",
            });
          }),
      );
      break;
    }
    case "call.hangup":
      if (task.status === "calling") {
        await updateWakeTask(env.WAKE_DB, task.id, {
          status: "not_confirmed",
          result: "no_answer",
          confidence: 0.95,
          summary: "The call ended before a wake confirmation was received.",
        });
      }
      break;
    case "call.conversation.ended": {
      if (
        ["awake_confirmed", "not_confirmed", "failed", "expired"].includes(task.status) ||
        !env.TELNYX_API_KEY
      ) {
        break;
      }
      const conversationId =
        typeof payload.conversation_id === "string"
          ? payload.conversation_id
          : task.telnyxConversationId;
      if (!conversationId) break;
      locals.runtime.ctx.waitUntil(
        fetchConversationMessages(conversationId, env.TELNYX_API_KEY)
          .then(async (messages) => {
            const classification = classifyConversationMessages(messages);
            await updateWakeTask(env.WAKE_DB, task.id, {
              status:
                classification.result === "awake_confirmed" ? "awake_confirmed" : "not_confirmed",
              result: classification.result,
              confidence: classification.confidence,
              evidence: classification.evidence,
              summary:
                classification.result === "awake_confirmed"
                  ? "Dawson explicitly confirmed he is awake and getting up."
                  : "The conversation ended without an explicit wake confirmation.",
            });
          })
          .catch((error) => {
            console.error("Telnyx conversation fallback classification failed", {
              taskId: task.id,
              message: error instanceof Error ? error.message : "unknown error",
            });
          }),
      );
      break;
    }
    default:
      break;
  }

  return new Response(null, { status: 204 });
};
