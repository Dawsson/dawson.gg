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
        <nav class="nav">
          <a href="/" class="nav-home">dawson.gg</a>
        </nav>
        <div class="home-header">
          <h1>Vault</h1>
          <p>Notes, ideas, and things worth writing down.</p>
        </div>
        <form action="/search" method="get" class="search-form">
          <input type="text" name="q" placeholder="Search notes..." />
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
      return c.html(layout("Not Found", '<div class="error-page"><h1>404</h1><p>This note doesn\'t exist.</p><a href="/">Go home</a></div>'), 404);
    }

    const notes = await getPublicNotesWithCache(c.env);
    const note = notes.find((n) => n.path === decoded);
    if (!note)
      return c.html(layout("Not Found", '<div class="error-page"><h1>404</h1><p>This note doesn\'t exist.</p><a href="/">Go home</a></div>'), 404);

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
        layout("Not Found", '<div class="error-page"><h1>404</h1><p>This link doesn\'t exist or has expired.</p><a href="/">Go home</a></div>'),
        404,
      );

    const share = JSON.parse(raw) as ShareLink;
    const note = await fetchNoteByPath(c.env, share.path);
    if (!note)
      return c.html(layout("Not Found", '<div class="error-page"><h1>404</h1><p>This note doesn\'t exist.</p><a href="/">Go home</a></div>'), 404);

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
        <nav class="nav">
          <a href="/" class="nav-home">dawson.gg</a>
        </nav>
        <h1>Search: ${escapeHtml(q)}</h1>
        <form action="/search" method="get" class="search-form">
          <input type="text" name="q" value="${escapeHtml(q)}" placeholder="Search notes..." />
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
    <nav class="nav">
      <a href="/" class="nav-home">dawson.gg</a>
    </nav>
    <article>
      <header class="note-header">
        <h1>${note.title}</h1>
        ${note.frontmatter.created ? `<time>${note.frontmatter.created}</time>` : ""}
      </header>
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
  <title>${title} — dawson.gg</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --font-display: 'Instrument Serif', Georgia, serif;
      --font-body: 'Plus Jakarta Sans', -apple-system, sans-serif;
      --font-mono: 'JetBrains Mono', 'SF Mono', SFMono-Regular, Menlo, monospace;

      --bg: #faf9f7;
      --bg-elevated: #fff;
      --text: #1c1917;
      --text-secondary: #78716c;
      --text-faint: #a8a29e;
      --accent: #c2410c;
      --link: #1c1917;
      --link-hover: #c2410c;
      --border: #e7e5e4;
      --code-bg: #f5f5f4;
      --code-border: #e7e5e4;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0c0a09;
        --bg-elevated: #1c1917;
        --text: #fafaf9;
        --text-secondary: #a8a29e;
        --text-faint: #78716c;
        --accent: #fb923c;
        --link: #fafaf9;
        --link-hover: #fb923c;
        --border: #292524;
        --code-bg: #1c1917;
        --code-border: #292524;
      }
    }

    html {
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
    }

    body {
      font-family: var(--font-body);
      max-width: 640px;
      margin: 0 auto;
      padding: 2.5rem 1.5rem 4rem;
      line-height: 1.65;
      color: var(--text);
      background: var(--bg);
      font-size: 0.9375rem;
      font-weight: 400;
    }

    /* ─── Navigation ─── */

    .nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 3rem;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid var(--border);
    }

    .nav-home {
      font-family: var(--font-display);
      font-size: 1.25rem;
      font-style: italic;
      color: var(--text);
      text-decoration: none;
      letter-spacing: -0.01em;
    }
    .nav-home:hover { color: var(--accent); }

    /* ─── Typography ─── */

    a {
      color: var(--link);
      text-decoration: underline;
      text-decoration-color: var(--border);
      text-decoration-thickness: 1px;
      text-underline-offset: 3px;
      transition: text-decoration-color 0.15s ease;
    }
    a:hover {
      text-decoration-color: var(--link-hover);
      color: var(--link-hover);
    }

    h1, h2, h3 {
      font-family: var(--font-display);
      font-weight: 400;
      letter-spacing: -0.02em;
    }

    h1 { font-size: 2rem; line-height: 1.2; margin-bottom: 0.5rem; }
    h2 { font-size: 1.5rem; margin-top: 2.5rem; margin-bottom: 0.75rem; }
    h3 { font-size: 1.2rem; margin-top: 2rem; margin-bottom: 0.5rem; }

    p { margin-bottom: 1.25rem; }
    p:last-child { margin-bottom: 0; }

    ul, ol { padding-left: 1.5rem; margin-bottom: 1.25rem; }
    li { margin-bottom: 0.4rem; }
    li::marker { color: var(--text-faint); }

    strong { font-weight: 600; }
    em { font-style: italic; }

    /* ─── Note header ─── */

    .note-header { margin-bottom: 2rem; }
    .note-header h1 { margin-bottom: 0.5rem; }
    .note-header time {
      display: block;
      font-size: 0.8125rem;
      color: var(--text-faint);
      font-variant-numeric: tabular-nums;
    }

    /* ─── Code ─── */

    code {
      font-family: var(--font-mono);
      font-size: 0.8125em;
      background: var(--code-bg);
      border: 1px solid var(--code-border);
      padding: 0.125em 0.375em;
      border-radius: 4px;
    }

    pre {
      background: var(--code-bg);
      border: 1px solid var(--code-border);
      border-radius: 8px;
      padding: 1.25rem;
      overflow-x: auto;
      margin-bottom: 1.5rem;
      line-height: 1.6;
    }
    pre code {
      background: none;
      border: none;
      padding: 0;
      font-size: 0.8125rem;
    }

    /* ─── Elements ─── */

    hr {
      border: none;
      border-top: 1px solid var(--border);
      margin: 2.5rem 0;
    }

    blockquote {
      border-left: 2px solid var(--accent);
      padding-left: 1.25rem;
      color: var(--text-secondary);
      margin-bottom: 1.25rem;
      font-style: italic;
    }

    img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      margin: 1rem 0;
    }

    article { margin-top: 0; }

    /* ─── Home page ─── */

    .home-header {
      margin-bottom: 2.5rem;
    }
    .home-header h1 {
      font-size: 2.25rem;
      margin-bottom: 0.25rem;
    }
    .home-header p {
      color: var(--text-secondary);
      font-size: 0.9375rem;
      margin-bottom: 0;
    }

    .note-list {
      list-style: none;
      padding-left: 0;
    }
    .note-list li {
      margin-bottom: 0;
    }
    .note-list a {
      display: block;
      padding: 0.75rem 0;
      border-bottom: 1px solid var(--border);
      text-decoration: none;
      color: var(--text);
      transition: color 0.15s ease;
    }
    .note-list li:first-child a { border-top: 1px solid var(--border); }
    .note-list a:hover { color: var(--accent); }

    /* ─── Search ─── */

    .search-form {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 2rem;
    }
    .search-form input {
      flex: 1;
      padding: 0.625rem 0.875rem;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--bg-elevated);
      color: var(--text);
      font-family: var(--font-body);
      font-size: 0.875rem;
      outline: none;
      transition: border-color 0.15s ease;
    }
    .search-form input:focus { border-color: var(--accent); }
    .search-form input::placeholder { color: var(--text-faint); }
    .search-form button {
      padding: 0.625rem 1.25rem;
      background: var(--text);
      color: var(--bg);
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-family: var(--font-body);
      font-size: 0.875rem;
      font-weight: 500;
      transition: opacity 0.15s ease;
    }
    .search-form button:hover { opacity: 0.85; }

    .search-results { list-style: none; padding-left: 0; }
    .search-results li {
      padding: 1rem 0;
      border-bottom: 1px solid var(--border);
    }
    .search-results a { font-weight: 500; }
    .snippet {
      color: var(--text-secondary);
      font-size: 0.8125rem;
      margin-top: 0.25rem;
      line-height: 1.5;
    }

    /* ─── 404 ─── */
    .error-page {
      text-align: center;
      padding-top: 4rem;
    }
    .error-page h1 {
      font-size: 3rem;
      margin-bottom: 0.5rem;
    }
    .error-page p {
      color: var(--text-secondary);
    }
  </style>
</head>
<body>${body}</body>
</html>`;
}
