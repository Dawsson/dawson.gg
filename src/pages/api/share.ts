import type { APIRoute } from "astro";
import { checkAuth } from "@/lib/auth.ts";
import { fetchNoteByPath } from "@/lib/github.ts";
import type { Bindings, ShareLink } from "@/lib/types.ts";

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as Bindings;
  if (!checkAuth(request, env.API_TOKEN)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { path } = (await request.json()) as { path: string };
  if (!path) return Response.json({ error: "path required" }, { status: 400 });

  const note = await fetchNoteByPath(env, path);
  if (!note) return Response.json({ error: "note not found" }, { status: 404 });

  const id = crypto.randomUUID();
  const share: ShareLink = { id, path, createdAt: new Date().toISOString() };
  await env.CACHE.put(`share:${id}`, JSON.stringify(share));

  const url = new URL(`/note/${id}`, request.url);
  return Response.json({ id, url: url.toString(), path });
};
