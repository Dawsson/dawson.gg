import { Hono } from "hono";
import { cache } from "hono/cache";
import type { Bindings, VaultNote } from "./types.ts";
import { fetchPublicNotes } from "./github.ts";
import { buildIndex, searchNotes } from "./search.ts";
import { renderMarkdown } from "./render.ts";

export function createApp() {
  const app = new Hono<{ Bindings: Bindings }>();

  // Cache public pages for 5 min
  app.use(
    "/note/*",
    cache({ cacheName: "vault-site", cacheControl: "max-age=300" }),
  );

  // Home — list all public notes
  app.get("/", async (c) => {
    const notes = await getNotesWithCache(c.env);
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
          <input type="text" name="q" placeholder="Search notes..." />
          <button type="submit">Search</button>
        </form>
        <ul>${noteList}</ul>
      `,
      ),
    );
  });

  // View a note
  app.get("/note/*", async (c) => {
    const path = c.req.path.replace("/note/", "");
    const decoded = decodeURIComponent(path);
    const notes = await getNotesWithCache(c.env);
    const note = notes.find((n) => n.path === decoded);

    if (!note) return c.html(layout("Not Found", "<h1>Note not found</h1>"), 404);

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

  // Search
  app.get("/search", async (c) => {
    const q = c.req.query("q") ?? "";
    if (!q.trim()) return c.redirect("/");

    const results = await searchNotes(c.env, q);
    const resultHtml = results.length
      ? results
          .map(
            (r) =>
              `<li>
                <a href="/note/${encodeURIComponent(r.path)}">${r.title}</a>
                <p class="snippet">${r.snippet}</p>
                <span class="score">${(r.score * 100).toFixed(1)}%</span>
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
          <input type="text" name="q" value="${q}" placeholder="Search notes..." />
          <button type="submit">Search</button>
        </form>
        <ul class="search-results">${resultHtml}</ul>
      `,
      ),
    );
  });

  // API: trigger re-index
  app.post("/api/reindex", async (c) => {
    const notes = await fetchPublicNotes(c.env);
    await buildIndex(c.env, notes);
    return c.json({ indexed: notes.length });
  });

  // API: search (JSON)
  app.get("/api/search", async (c) => {
    const q = c.req.query("q") ?? "";
    if (!q.trim()) return c.json({ results: [] });
    const results = await searchNotes(c.env, q);
    return c.json({ results });
  });

  return app;
}

async function getNotesWithCache(env: Bindings): Promise<VaultNote[]> {
  const cached = await env.CACHE.get("vault:notes");
  if (cached) return JSON.parse(cached) as VaultNote[];

  const notes = await fetchPublicNotes(env);
  await env.CACHE.put("vault:notes", JSON.stringify(notes), {
    expirationTtl: 300,
  });
  return notes;
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
    .score { color: #999; font-size: 0.8em; }
  </style>
</head>
<body>${body}</body>
</html>`;
}
