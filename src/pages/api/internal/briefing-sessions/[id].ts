import type { APIRoute } from "astro";
import { getBriefingSession, publicBriefingSession } from "@/lib/briefing-sessions.ts";
import { hasBearerToken } from "@/lib/internal-auth.ts";
import type { Bindings } from "@/lib/types.ts";
import { getVoiceSession } from "@/lib/voice-sessions.ts";

export const GET: APIRoute = async ({ request, locals, params }) => {
  const env = locals.runtime.env as Bindings;
  if (!(await hasBearerToken(request, env.HERMES_INTERNAL_TOKEN))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const voiceSession = params.id ? await getVoiceSession(env.VOICE_DB, params.id) : null;
  const session = voiceSession ? await getBriefingSession(env.VOICE_DB, voiceSession) : null;
  return session
    ? Response.json(publicBriefingSession(session))
    : Response.json({ error: "not found" }, { status: 404 });
};
