import type { APIRoute } from "astro";
import { checkAuth } from "@/lib/auth.ts";
import { fetchAllNotes } from "@/lib/github.ts";
import { buildIndex } from "@/lib/search.ts";
import type { Bindings } from "@/lib/types.ts";

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as Bindings;
  if (!checkAuth(request, env.API_TOKEN)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const notes = await fetchAllNotes(env);
  const result = await buildIndex(env, notes);
  return Response.json({ indexed: result.indexed });
};
