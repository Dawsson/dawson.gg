import type { APIRoute } from "astro";
import { getBriefingSession, publicBriefingSession } from "@/lib/briefing-sessions.ts";
import { hasBearerToken } from "@/lib/internal-auth.ts";
import type { Bindings } from "@/lib/types.ts";
import { getWakeTask } from "@/lib/wake-tasks.ts";

export const GET: APIRoute = async ({ request, locals, params }) => {
  const env = locals.runtime.env as Bindings;
  if (!(await hasBearerToken(request, env.HERMES_INTERNAL_WAKE_TOKEN))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const task = params.id ? await getWakeTask(env.WAKE_DB, params.id) : null;
  const session = task ? await getBriefingSession(env.WAKE_DB, task) : null;
  return session
    ? Response.json(publicBriefingSession(session))
    : Response.json({ error: "not found" }, { status: 404 });
};
