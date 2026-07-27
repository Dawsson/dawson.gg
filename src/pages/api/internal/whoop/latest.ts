import type { APIRoute } from "astro";
import { hasBearerToken } from "@/lib/internal-auth.ts";
import type { Bindings } from "@/lib/types.ts";
import { getStoredWhoopEvents } from "@/lib/whoop-events.ts";
import { buildWhoopLatest } from "@/lib/whoop-latest.ts";
import { getWhoopSnapshot } from "@/lib/whoop-oauth.ts";

export const GET: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as Bindings;
  if (!(await hasBearerToken(request, env.HERMES_INTERNAL_TOKEN))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const events = await getStoredWhoopEvents(env.CACHE, 10);
  try {
    const snapshot = await getWhoopSnapshot(env.CACHE, env);
    if (snapshot) return Response.json(buildWhoopLatest(snapshot, events));
    return Response.json({
      fetched_at: new Date().toISOString(),
      events,
      current_cycle: null,
      latest_sleep: null,
      latest_recovery: null,
      latest_workout: null,
      stats_available: false,
      note: "WHOOP authorization is required.",
    });
  } catch {
    return Response.json({
      fetched_at: new Date().toISOString(),
      events,
      current_cycle: null,
      latest_sleep: null,
      latest_recovery: null,
      latest_workout: null,
      stats_available: false,
      error: "whoop_unavailable",
      note: "WHOOP metrics could not be refreshed.",
    });
  }
};

export const POST: APIRoute = async () => new Response("Method not allowed", { status: 405 });
