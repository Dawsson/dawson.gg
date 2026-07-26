import type { APIRoute } from "astro";
import { hasBearerToken } from "@/lib/internal-auth.ts";
import type { Bindings } from "@/lib/types.ts";
import { createWhoopAuthorizationUrl } from "@/lib/whoop-oauth.ts";

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as Bindings;
  if (!(await hasBearerToken(request, env.HERMES_INTERNAL_TOKEN))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return Response.json({ authorization_url: await createWhoopAuthorizationUrl(env.CACHE, env) });
  } catch {
    return Response.json({ error: "WHOOP OAuth is not configured" }, { status: 503 });
  }
};

export const GET: APIRoute = async () => new Response("Method not allowed", { status: 405 });
