import type { APIRoute } from "astro";
import { hasBearerToken } from "@/lib/internal-auth.ts";
import type { Bindings } from "@/lib/types.ts";
import { getWhoopSnapshot } from "@/lib/whoop-oauth.ts";

type StoredWhoopEvent = {
  type: string;
  resource_id: string;
  received_at: string;
};

export const GET: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as Bindings;
  if (!(await hasBearerToken(request, env.HERMES_INTERNAL_TOKEN))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const listed = await env.CACHE.list({ prefix: "whoop:webhook:", limit: 50 });
  const events = (
    await Promise.all(
      listed.keys.map(async ({ name }) => {
        const event = await env.CACHE.get<StoredWhoopEvent>(name, "json");
        return event;
      }),
    )
  )
    .filter((event): event is StoredWhoopEvent => event !== null)
    .sort((left, right) => right.received_at.localeCompare(left.received_at));

  let snapshot: Record<string, unknown> | null = null;
  let statsError: "reconnect_required" | undefined;
  try {
    snapshot = await getWhoopSnapshot(env.CACHE, env);
  } catch {
    statsError = "reconnect_required";
  }
  return Response.json({
    events,
    source: "whoop_webhook",
    stats_available: snapshot !== null,
    snapshot,
    ...(statsError ? { stats_error: statsError } : {}),
    note: snapshot
      ? "WHOOP metrics fetched through Dawson's OAuth grant."
      : "WHOOP webhooks identify changed resources; health metrics require OAuth API access.",
  });
};

export const POST: APIRoute = async () => new Response("Method not allowed", { status: 405 });
