import type { APIRoute } from "astro";
import { checkAuth } from "@/lib/auth.ts";
import type { Bindings } from "@/lib/types.ts";

export const DELETE: APIRoute = async ({ request, locals, params }) => {
  const env = locals.runtime.env as Bindings;
  if (!checkAuth(request, env.API_TOKEN)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const id = params.id;
  await env.CACHE.delete(`share:${id}`);
  return Response.json({ deleted: id });
};
