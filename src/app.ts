import { Hono } from "hono";
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

  // Home — list public notes
  app.get("/", async (c) => {
    const notes = await getPublicNotesWithCache(c.env);
    const noteList = notes
      .map(
        (n) =>
          `<li><a href="/p/${encodeURIComponent(n.path)}">${n.title}</a></li>`,
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
        <ul class="note-list">${noteList}</ul>
      `,
      ),
    );
  });

  // View a public note by path (only Public/ folder)
  app.get("/p/*", async (c) => {
    const path = c.req.path.replace("/p/", "");
    const decoded = decodeURIComponent(path);

    if (!decoded.startsWith("Public/")) {
      return c.html(layout("Not Found", "<h1>Note not found</h1>"), 404);
    }

    const notes = await getPublicNotesWithCache(c.env);
    const note = notes.find((n) => n.path === decoded);
    if (!note)
      return c.html(layout("Not Found", "<h1>Note not found</h1>"), 404);

    return c.html(
      noteLayout(note),
    );
  });

  // View any note by UUID (the UUID is the secret — no other auth needed)
  app.get("/note/:id", async (c) => {
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

    return c.html(noteLayout(note));
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
                <a href="/p/${encodeURIComponent(r.path)}">${r.title}</a>
                <p class="snippet">${r.snippet}</p>
              </li>`,
          )
          .join("\n")
      : "<li>No results found.</li>";

    return c.html(
      layout(
        `Search: ${q}`,
        `
        <a href="/" class="back-link">&larr; Back</a>
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

  // Create a share link for any note → returns /note/<uuid> URL
  api.post("/share", async (c) => {
    const { path } = await c.req.json<{ path: string }>();
    if (!path) return c.json({ error: "path required" }, 400);

    const note = await fetchNoteByPath(c.env, path);
    if (!note) return c.json({ error: "note not found" }, 404);

    const id = crypto.randomUUID();
    const share: ShareLink = { id, path, createdAt: new Date().toISOString() };
    await c.env.CACHE.put(`share:${id}`, JSON.stringify(share));

    const url = new URL(`/note/${id}`, c.req.url);
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

function noteLayout(note: VaultNote): string {
  const body = stripLeadingH1(note.content);
  return layout(
    note.title,
    `
    <nav><a href="/" class="back-link">&larr; Back</a></nav>
    <article>
      <h1>${note.title}</h1>
      ${renderMarkdown(body)}
    </article>
    `,
  );
}

function stripLeadingH1(md: string): string {
  return md.replace(/^# .+\n*/m, "");
}

function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=STIX+Two+Text:ital,wght@0,400;0,600;0,700;1,400&display=swap');

    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --bg: #fff;
      --text: #111;
      --text-secondary: #737373;
      --text-faint: #a3a3a3;
      --link: #111;
      --link-decoration: #a3a3a3;
      --border: #e5e5e5;
      --code-bg: #f5f5f5;
      --inline-code-bg: #f5f5f5;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #111;
        --text: #fafafa;
        --text-secondary: #a3a3a3;
        --text-faint: #737373;
        --link: #fafafa;
        --link-decoration: #525252;
        --border: #262626;
        --code-bg: #1a1a1a;
        --inline-code-bg: #262626;
      }
    }

    html { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }

    body {
      font-family: 'STIX Two Text', Georgia, 'Times New Roman', serif;
      max-width: 640px;
      margin: 0 auto;
      padding: 3rem 1.5rem;
      line-height: 1.3;
      color: var(--text);
      background: var(--bg);
      font-size: 1rem;
    }

    a {
      color: var(--link);
      text-decoration: underline;
      text-decoration-color: var(--link-decoration);
      text-decoration-thickness: 1px;
      text-underline-offset: 2.5px;
    }
    a:hover { text-decoration-color: var(--text); }

    h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 1.25rem; letter-spacing: -0.02em; }
    h2 { font-size: 1.25rem; font-weight: 600; margin-top: 2rem; margin-bottom: 0.75rem; }
    h3 { font-size: 1.1rem; font-weight: 600; margin-top: 1.5rem; margin-bottom: 0.5rem; }

    p { margin-bottom: 1.25rem; }

    ul, ol { padding-left: 1.5rem; margin-bottom: 1.25rem; }
    li { margin-bottom: 0.5rem; }
    ol { list-style-type: decimal; }
    ul { list-style-type: disc; }

    strong { font-weight: 600; }

    code {
      font-family: 'SF Mono', SFMono-Regular, Menlo, monospace;
      font-size: 0.85em;
      background: var(--inline-code-bg);
      padding: 0.15em 0.35em;
      border-radius: 4px;
    }

    pre {
      background: var(--code-bg);
      border-radius: 6px;
      padding: 1rem;
      overflow-x: auto;
      margin-bottom: 1.25rem;
      line-height: 1.5;
    }
    pre code {
      background: none;
      padding: 0;
      font-size: 0.85rem;
    }

    hr {
      border: none;
      border-top: 1px solid var(--border);
      margin: 2rem 0;
    }

    blockquote {
      border-left: 2px solid var(--border);
      padding-left: 1rem;
      color: var(--text-secondary);
      margin-bottom: 1.25rem;
    }

    article { margin-top: 0.5rem; }

    .back-link {
      display: inline-block;
      margin-bottom: 2rem;
      color: var(--text-secondary);
      text-decoration: none;
      font-size: 0.9rem;
    }
    .back-link:hover { color: var(--text); }

    .note-list { list-style: none; padding-left: 0; }
    .note-list li { margin-bottom: 0.75rem; }
    .note-list a { font-size: 1rem; }

    .search-form {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 2rem;
    }
    .search-form input {
      flex: 1;
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--bg);
      color: var(--text);
      font-family: inherit;
      font-size: 0.95rem;
    }
    .search-form input::placeholder { color: var(--text-faint); }
    .search-form button {
      padding: 0.5rem 1rem;
      background: var(--text);
      color: var(--bg);
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-family: inherit;
      font-size: 0.95rem;
    }

    .search-results { list-style: none; padding-left: 0; }
    .search-results li { margin-bottom: 1.25rem; }
    .search-results a { font-weight: 600; }
    .snippet { color: var(--text-secondary); font-size: 0.9rem; margin-top: 0.25rem; }
  </style>
</head>
<body>${body}</body>
</html>`;
}
