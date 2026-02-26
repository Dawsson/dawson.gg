import { Hono } from "hono";
import { cache } from "hono/cache";
import type { Bindings, ShareLink, VaultNote } from "./types.ts";
import {
  fetchAllNotes,
  fetchNoteByPath,
  fetchPublicNotes,
} from "./github.ts";
import { buildIndex, searchNotes } from "./search.ts";
import { renderMarkdown } from "./render.ts";

export function createApp() {
  const app = new Hono<{ Bindings: Bindings }>();

  // ─── Public routes ───

  app.use(
    "/note/*",
    cache({ cacheName: "vault-site", cacheControl: "max-age=300" }),
  );

  // Home — list public notes
  app.get("/", async (c) => {
    const notes = await getPublicNotesWithCache(c.env);
    const noteList = notes
      .map(
        (n) =>
          `<li><a href="/note/${encodeURIComponent(n.path)}">${n.title}</a></li>`,
      )
      .join("\n");

    return c.html(
      layout(
        "Vault",
        `
        <h1>Vault</h1>
        <form action="/search" method="get" class="search-form">
          <input type="text" name="q" placeholder="Search public notes..." />
          <button type="submit">Search</button>
        </form>
        <ul>${noteList}</ul>
      `,
      ),
    );
  });

  // View a note — public notes work without auth, private notes need ?token=
  app.get("/note/*", async (c) => {
    const path = c.req.path.replace("/note/", "");
    const decoded = decodeURIComponent(path);
    const isPublic = decoded.startsWith("Public/");

    // Private notes require token
    if (!isPublic) {
      const token = c.req.query("token");
      if (token !== c.env.API_TOKEN) {
        return c.html(layout("Unauthorized", "<h1>This note requires authentication</h1><p>Append <code>?token=...</code> to the URL.</p>"), 401);
      }
    }

    const note = isPublic
      ? (await getPublicNotesWithCache(c.env)).find((n) => n.path === decoded)
      : await fetchNoteByPath(c.env, decoded);

    if (!note)
      return c.html(layout("Not Found", "<h1>Note not found</h1>"), 404);

    return c.html(
      layout(
        note.title,
        `
        <a href="/">&larr; Back</a>
        <article>
          <h1>${note.title}</h1>
          ${renderMarkdown(note.content)}
        </article>
      `,
      ),
    );
  });

  // Public search (only searches public notes)
  app.get("/search", async (c) => {
    const q = c.req.query("q") ?? "";
    if (!q.trim()) return c.redirect("/");

    const results = (await searchNotes(c.env, q)).filter((r) =>
      r.path.startsWith("Public/"),
    );
    const resultHtml = results.length
      ? results
          .map(
            (r) =>
              `<li>
                <a href="/note/${encodeURIComponent(r.path)}">${r.title}</a>
                <p class="snippet">${r.snippet}</p>
              </li>`,
          )
          .join("\n")
      : "<li>No results found.</li>";

    return c.html(
      layout(
        `Search: ${q}`,
        `
        <a href="/">&larr; Back</a>
        <h1>Search: ${q}</h1>
        <form action="/search" method="get" class="search-form">
          <input type="text" name="q" value="${escapeHtml(q)}" placeholder="Search public notes..." />
          <button type="submit">Search</button>
        </form>
        <ul class="search-results">${resultHtml}</ul>
      `,
      ),
    );
  });

  // ─── Shared links ───

  // View a shared note via secret UUID
  app.get("/s/:id", async (c) => {
    const id = c.req.param("id");
    const raw = await c.env.CACHE.get(`share:${id}`);
    if (!raw)
      return c.html(
        layout("Not Found", "<h1>This link doesn't exist or has expired</h1>"),
        404,
      );

    const share = JSON.parse(raw) as ShareLink;
    const note = await fetchNoteByPath(c.env, share.path);
    if (!note)
      return c.html(layout("Not Found", "<h1>Note not found</h1>"), 404);

    return c.html(
      layout(
        note.title,
        `
        <article>
          <h1>${note.title}</h1>
          ${renderMarkdown(note.content)}
        </article>
      `,
      ),
    );
  });

  // ─── Authenticated API (agents + you) ───

  const api = new Hono<{ Bindings: Bindings }>();

  // Auth middleware — Bearer token or ?token= query param
  api.use("*", async (c, next) => {
    const header = c.req.header("Authorization");
    const query = c.req.query("token");
    const valid =
      header === `Bearer ${c.env.API_TOKEN}` || query === c.env.API_TOKEN;
    if (!valid) {
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
  });

  // Search all vault content (private + public)
  api.get("/search", async (c) => {
    const q = c.req.query("q") ?? "";
    const limit = parseInt(c.req.query("limit") ?? "10");
    if (!q.trim()) return c.json({ results: [] });
    const results = await searchNotes(c.env, q, limit);
    return c.json({ results });
  });

  // Re-index all vault content
  api.post("/reindex", async (c) => {
    const notes = await fetchAllNotes(c.env);
    await buildIndex(c.env, notes);
    return c.json({ indexed: notes.length });
  });

  // Create a share link for any note
  api.post("/share", async (c) => {
    const { path } = await c.req.json<{ path: string }>();
    if (!path) return c.json({ error: "path required" }, 400);

    // Verify note exists
    const note = await fetchNoteByPath(c.env, path);
    if (!note) return c.json({ error: "note not found" }, 404);

    const id = crypto.randomUUID();
    const share: ShareLink = { id, path, createdAt: new Date().toISOString() };

    // Store forever (no TTL) — can add expiry later if needed
    await c.env.CACHE.put(`share:${id}`, JSON.stringify(share));

    const url = new URL(`/s/${id}`, c.req.url);
    return c.json({ id, url: url.toString(), path });
  });

  // List all share links
  api.get("/shares", async (c) => {
    const list = await c.env.CACHE.list({ prefix: "share:" });
    const shares: ShareLink[] = [];
    for (const key of list.keys) {
      const raw = await c.env.CACHE.get(key.name);
      if (raw) shares.push(JSON.parse(raw) as ShareLink);
    }
    return c.json({ shares });
  });

  // Delete a share link
  api.delete("/share/:id", async (c) => {
    const id = c.req.param("id");
    await c.env.CACHE.delete(`share:${id}`);
    return c.json({ deleted: id });
  });

  // Get a specific note (raw content)
  api.get("/note", async (c) => {
    const path = c.req.query("path") ?? "";
    if (!path) return c.json({ error: "path required" }, 400);
    const note = await fetchNoteByPath(c.env, path);
    if (!note) return c.json({ error: "not found" }, 404);
    return c.json(note);
  });

  // List all notes in the vault
  api.get("/notes", async (c) => {
    const notes = await fetchAllNotes(c.env);
    return c.json({
      notes: notes.map((n) => ({
        path: n.path,
        title: n.title,
        frontmatter: n.frontmatter,
      })),
    });
  });

  app.route("/api", api);

  return app;
}

async function getPublicNotesWithCache(env: Bindings): Promise<VaultNote[]> {
  const cached = await env.CACHE.get("vault:public-notes");
  if (cached) return JSON.parse(cached) as VaultNote[];

  const notes = await fetchPublicNotes(env);
  await env.CACHE.put("vault:public-notes", JSON.stringify(notes), {
    expirationTtl: 300,
  });
  return notes;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 720px; margin: 0 auto; padding: 2rem 1rem; line-height: 1.6; color: #1a1a1a; }
    a { color: #0066cc; text-decoration: none; }
    a:hover { text-decoration: underline; }
    h1 { margin-bottom: 1rem; }
    h2, h3, h4 { margin-top: 1.5rem; margin-bottom: 0.5rem; }
    ul { padding-left: 1.5rem; }
    li { margin-bottom: 0.5rem; }
    article { margin-top: 1rem; }
    article p { margin-bottom: 1rem; }
    code { background: #f4f4f4; padding: 0.15em 0.4em; border-radius: 3px; font-size: 0.9em; }
    hr { margin: 2rem 0; border: none; border-top: 1px solid #e0e0e0; }
    .search-form { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; }
    .search-form input { flex: 1; padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; font-size: 1rem; }
    .search-form button { padding: 0.5rem 1rem; background: #0066cc; color: white; border: none; border-radius: 4px; cursor: pointer; }
    .snippet { color: #666; font-size: 0.9em; margin-top: 0.25rem; }
  </style>
</head>
<body>${body}</body>
</html>`;
}
