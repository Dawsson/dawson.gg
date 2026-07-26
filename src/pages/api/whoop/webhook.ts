import type { APIRoute } from "astro";
import { parseWhoopWebhook, verifyWhoopWebhook } from "@/lib/whoop.ts";
import type { Bindings } from "@/lib/types.ts";

const EVENT_TTL_SECONDS = 30 * 24 * 60 * 60;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as Bindings;
  if (!env.WHOOP_CLIENT_SECRET || !env.WHOOP_USER_ID) {
    console.error("WHOOP webhook rejected: production configuration is incomplete");
    return new Response("Webhook verification is not configured", { status: 503 });
  }

  const rawBody = await request.text();
  const isValid = await verifyWhoopWebhook(
    rawBody,
    request.headers.get("x-whoop-signature"),
    request.headers.get("x-whoop-signature-timestamp"),
    env.WHOOP_CLIENT_SECRET,
  );
  if (!isValid) return new Response("Invalid webhook signature", { status: 403 });

  const event = parseWhoopWebhook(rawBody);
  if (!event) return new Response("Invalid webhook payload", { status: 400 });
  if (event.userId !== env.WHOOP_USER_ID) return new Response(null, { status: 204 });

  console.info("WHOOP event", { eventType: event.type, traceId: event.traceId });
  locals.runtime.ctx.waitUntil(
    env.CACHE.put(
      `whoop:webhook:${event.traceId}`,
      JSON.stringify({
        type: event.type,
        resource_id: event.resourceId,
        received_at: new Date().toISOString(),
      }),
      { expirationTtl: EVENT_TTL_SECONDS },
    ),
  );
  return new Response(null, { status: 204 });
};

export const GET: APIRoute = async () => new Response("Method not allowed", { status: 405 });
