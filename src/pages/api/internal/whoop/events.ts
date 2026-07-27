import type { APIRoute } from "astro";
import { hasBearerToken } from "@/lib/internal-auth.ts";
import type { Bindings } from "@/lib/types.ts";
import { getStoredWhoopEvents } from "@/lib/whoop-events.ts";
import { getWhoopSnapshot } from "@/lib/whoop-oauth.ts";

export const GET: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as Bindings;
  if (!(await hasBearerToken(request, env.HERMES_INTERNAL_TOKEN))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const events = await getStoredWhoopEvents(env.CACHE);

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
