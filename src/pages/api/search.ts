import type { APIRoute } from "astro";
import { checkAuth } from "@/lib/auth.ts";
import { searchNotes } from "@/lib/search.ts";
import type { Bindings } from "@/lib/types.ts";

export const GET: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as Bindings;
  if (!checkAuth(request, env.API_TOKEN)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const limit = parseInt(url.searchParams.get("limit") ?? "10");

  if (!q.trim()) return Response.json({ results: [] });
  const results = await searchNotes(env, q, limit);
  return Response.json({ results });
};
