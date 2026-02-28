import type { APIRoute } from "astro";
import { checkAuth } from "@/lib/auth.ts";
import { fetchNoteByPath } from "@/lib/github.ts";
import type { Bindings } from "@/lib/types.ts";

export const GET: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as Bindings;
  if (!checkAuth(request, env.API_TOKEN)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const path = url.searchParams.get("path") ?? "";
  if (!path) return Response.json({ error: "path required" }, { status: 400 });

  const note = await fetchNoteByPath(env, path);
  if (!note) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(note);
};
