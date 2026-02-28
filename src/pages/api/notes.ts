import type { APIRoute } from "astro";
import { checkAuth } from "@/lib/auth.ts";
import { fetchAllNotes } from "@/lib/github.ts";
import type { Bindings } from "@/lib/types.ts";

export const GET: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as Bindings;
  if (!checkAuth(request, env.API_TOKEN)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const notes = await fetchAllNotes(env);
  return Response.json({
    notes: notes.map((n) => ({
      path: n.path,
      title: n.title,
      frontmatter: n.frontmatter,
    })),
  });
};
