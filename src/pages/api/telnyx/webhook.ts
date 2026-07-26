import type { APIRoute } from "astro";
import { parseTelnyxCallEvent, speakWakeUpMessage, verifyTelnyxWebhook } from "@/lib/telnyx.ts";
import type { Bindings } from "@/lib/types.ts";

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

  switch (eventType) {
    case "call.initiated":
    case "call.hangup":
      break;
    case "call.answered": {
      if (!payload.call_control_id || !env.TELNYX_API_KEY) {
        console.error("Telnyx wake-up speech skipped: required call configuration is missing");
        break;
      }
      locals.runtime.ctx.waitUntil(
        speakWakeUpMessage(payload.call_control_id, eventId, env.TELNYX_API_KEY).catch((error) => {
          console.error(
            "Telnyx wake-up speech failed",
            error instanceof Error ? error.message : "unknown error",
          );
        }),
      );
      break;
    }
    default:
      break;
  }

  return new Response(null, { status: 204 });
};
