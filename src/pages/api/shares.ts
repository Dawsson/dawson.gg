import type { APIRoute } from "astro";
import { checkAuth } from "@/lib/auth.ts";
import type { Bindings, ShareLink } from "@/lib/types.ts";

export const GET: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as Bindings;
  if (!checkAuth(request, env.API_TOKEN)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const list = await env.CACHE.list({ prefix: "share:" });
  const shares: ShareLink[] = [];
  for (const key of list.keys) {
    const val = await env.CACHE.get(key.name);
    if (val) shares.push(JSON.parse(val) as ShareLink);
  }
  return Response.json({ shares });
};
