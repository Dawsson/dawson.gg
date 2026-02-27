import { Hono } from "hono";
import type { Bindings, ShareLink, VaultNote } from "./types.ts";
import {
  fetchAllNotes,
  fetchNoteByPath,
  fetchPublicNotes,
} from "./github.ts";
import { buildIndex, searchNotes } from "./search.ts";
import { renderMarkdown } from "./render.ts";
import { PROFILE, PROJECTS, TECHNOLOGIES, CATEGORY_LABELS } from "./data.ts";

export function createApp() {
  const app = new Hono<{ Bindings: Bindings }>();

  // ─── Portfolio home ───

  app.get("/", async (c) => {
    const notes = await getPublicNotesWithCache(c.env);
    const recentNotes = notes.slice(0, 5);

    return c.html(
      portfolioLayout(
        "Dawson — Software Engineer",
        `
        ${heroSection()}
        ${projectsSection()}
        ${technologiesSection()}
        ${recentPostsSection(recentNotes)}
        `,
      ),
    );
  });

  // ─── Technology vector search (public — only searches technologies) ───

  app.get("/api/tech-search", async (c) => {
    const q = c.req.query("q") ?? "";
    if (!q.trim()) return c.json({ results: [] });

    // Check KV cache first (24h TTL — tech list rarely changes)
    const cacheKey = `tech-search:${q.trim().toLowerCase()}`;
    const cached = await c.env.CACHE.get(cacheKey);
    if (cached) return c.json(JSON.parse(cached));

    // Search without filter, then post-filter to technologies only
    const results = await searchNotes(c.env, q, 50);
    const techResults = results
      .filter((r) => r.contentType === "technology" && r.score >= 0.68)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    const response = {
      results: techResults.map((r) => ({
        slug: r.path.replace("tech:", ""),
        title: r.title,
        score: r.score,
      })),
    };

    // Cache for 24 hours
    await c.env.CACHE.put(cacheKey, JSON.stringify(response), {
      expirationTtl: 86400,
    });

    return c.json(response);
  });

  // ─── Blog listing ───

  app.get("/posts", async (c) => {
    const notes = await getPublicNotesWithCache(c.env);
    const noteList = notes
      .map(
        (n) =>
          `<li><a href="/p/${encodeURIComponent(n.path)}">${n.title}</a></li>`,
      )
      .join("\n");

    return c.html(
      blogLayout(
        "Posts",
        `
        <nav class="nav">
          <a href="/" class="nav-home">dawson.gg</a>
          <a href="/posts" class="nav-link">Posts</a>
        </nav>
        <div class="home-header">
          <h1>Posts</h1>
          <p>Notes, ideas, and things worth writing down.</p>
        </div>
        <ul class="note-list">${noteList}</ul>
      `,
      ),
    );
  });

  // ─── View a public note ───

  app.get("/p/*", async (c) => {
    const path = c.req.path.replace("/p/", "");
    const decoded = decodeURIComponent(path);

    if (!decoded.startsWith("Public/")) {
      return c.html(
        blogLayout("Not Found", errorPage("404", "This note doesn't exist.")),
        404,
      );
    }

    const notes = await getPublicNotesWithCache(c.env);
    const note = notes.find((n) => n.path === decoded);
    if (!note)
      return c.html(
        blogLayout("Not Found", errorPage("404", "This note doesn't exist.")),
        404,
      );

    return c.html(noteLayout(note));
  });

  // ─── Share link ───

  app.get("/note/:id", async (c) => {
    const id = c.req.param("id");
    const raw = await c.env.CACHE.get(`share:${id}`);
    if (!raw)
      return c.html(
        blogLayout(
          "Not Found",
          errorPage("404", "This link doesn't exist or has expired."),
        ),
        404,
      );

    const share = JSON.parse(raw) as ShareLink;
    const note = await fetchNoteByPath(c.env, share.path);
    if (!note)
      return c.html(
        blogLayout("Not Found", errorPage("404", "This note doesn't exist.")),
        404,
      );

    return c.html(noteLayout(note));
  });

  // ─── Authenticated API (agents + you) ───

  const api = new Hono<{ Bindings: Bindings }>();

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

  api.get("/search", async (c) => {
    const q = c.req.query("q") ?? "";
    const limit = parseInt(c.req.query("limit") ?? "10");
    if (!q.trim()) return c.json({ results: [] });
    const results = await searchNotes(c.env, q, limit);
    return c.json({ results });
  });

  api.post("/reindex", async (c) => {
    const notes = await fetchAllNotes(c.env);
    const result = await buildIndex(c.env, notes);
    return c.json({ indexed: result.indexed });
  });

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

  api.get("/shares", async (c) => {
    const list = await c.env.CACHE.list({ prefix: "share:" });
    const shares: ShareLink[] = [];
    for (const key of list.keys) {
      const raw = await c.env.CACHE.get(key.name);
      if (raw) shares.push(JSON.parse(raw) as ShareLink);
    }
    return c.json({ shares });
  });

  api.delete("/share/:id", async (c) => {
    const id = c.req.param("id");
    await c.env.CACHE.delete(`share:${id}`);
    return c.json({ deleted: id });
  });

  api.get("/note", async (c) => {
    const path = c.req.query("path") ?? "";
    if (!path) return c.json({ error: "path required" }, 400);
    const note = await fetchNoteByPath(c.env, path);
    if (!note) return c.json({ error: "not found" }, 404);
    return c.json(note);
  });

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

// ─── Section renderers ───

function heroSection(): string {
  const links = PROFILE.links
    .map(
      (l) =>
        `<a href="${l.url}" class="hero-link" target="_blank" rel="noopener">${l.label}</a>`,
    )
    .join("");

  return `
    <nav class="nav">
      <a href="/" class="nav-home">dawson.gg</a>
      <a href="/posts" class="nav-link">Posts</a>
    </nav>
    <section class="hero">
      <h1 class="hero-name">${PROFILE.name}</h1>
      <p class="hero-intro">${PROFILE.intro}</p>
      <div class="hero-links">${links}</div>
    </section>
  `;
}

function projectsSection(): string {
  const featured = PROJECTS.filter((p) => p.featured);
  const cards = featured
    .map((p) => {
      const techPills = p.technologies
        .map((t) => `<span class="pill">${t}</span>`)
        .join("");
      const projectLinks = [
        p.url
          ? `<a href="${p.url}" target="_blank" rel="noopener">View</a>`
          : "",
        p.github
          ? `<a href="${p.github}" target="_blank" rel="noopener">GitHub</a>`
          : "",
      ]
        .filter(Boolean)
        .join("");
      return `
        <div class="project-card">
          <h3>${p.title}</h3>
          <p>${p.description}</p>
          <div class="project-tech">${techPills}</div>
          ${projectLinks ? `<div class="project-links">${projectLinks}</div>` : ""}
        </div>
      `;
    })
    .join("");

  return `
    <section class="section" id="projects">
      <h2 class="section-label">Projects</h2>
      <div class="projects-grid">${cards}</div>
    </section>
  `;
}

function technologiesSection(): string {
  const categories = Object.entries(CATEGORY_LABELS).map(([key, label]) => ({ key, label }));

  const allItems = TECHNOLOGIES.map(
    (t) =>
      `<div class="tech-item" data-name="${t.name.toLowerCase()}" data-cat="${t.category}" data-featured="${t.featured}" title="${t.name} — ${t.description}" style="${t.featured ? "" : "display:none"}">
        <span class="tech-name">${t.name}</span>
        <span class="tech-cat">${CATEGORY_LABELS[t.category]}</span>
      </div>`,
  ).join("");

  const categoryButtons = categories
    .map(
      (cat) =>
        `<button class="cat-btn" data-cat="${cat.key}" onclick="filterCat('${cat.key}')">${cat.label}</button>`,
    )
    .join("");

  const featuredCount = TECHNOLOGIES.filter((t) => t.featured).length;
  const totalCount = TECHNOLOGIES.length;

  return `
    <section class="section" id="technologies">
      <h2 class="section-label">Technologies</h2>
      <div class="tech-controls">
        <div class="tech-controls-top">
          <input type="text" id="tech-filter" class="tech-filter-input" placeholder="Search ${totalCount} technologies..." />
          <button class="tech-toggle" id="tech-toggle" onclick="toggleAll()">Show all ${totalCount}</button>
          <span class="tech-count" id="tech-count">${featuredCount} featured</span>
        </div>
        <div class="cat-buttons">
          <button class="cat-btn active" data-cat="all" onclick="filterCat('all')">All</button>
          ${categoryButtons}
        </div>
      </div>
      <div class="tech-grid" id="tech-grid">${allItems}</div>
    </section>
    <script>
      var activeCat = 'all';
      var showAll = false;
      var vectorTimer = null;
      var vectorMatches = null;
      function filterCat(cat) {
        activeCat = cat;
        document.querySelectorAll('.cat-btn').forEach(function(b) {
          b.classList.toggle('active', b.getAttribute('data-cat') === cat);
        });
        applyFilter();
      }
      function toggleAll() {
        showAll = !showAll;
        var btn = document.getElementById('tech-toggle');
        btn.textContent = showAll ? 'Show featured' : 'Show all ${totalCount}';
        applyFilter();
      }
      function applyFilter() {
        var q = (document.getElementById('tech-filter').value || '').toLowerCase();
        var hasQuery = q.length > 0;
        var visible = 0;
        var items = document.querySelectorAll('.tech-item');
        // Build score map from vector results
        var scoreMap = {};
        if (vectorMatches && hasQuery) {
          vectorMatches.forEach(function(m) { scoreMap[m.title.toLowerCase()] = m.score; });
        }
        // Collect items with scores for sorting
        var scored = [];
        items.forEach(function(el) {
          var name = el.getAttribute('data-name') || '';
          var cat = el.getAttribute('data-cat') || '';
          var featured = el.getAttribute('data-featured') === 'true';
          var matchName = !hasQuery || name.includes(q) || cat.includes(q);
          var matchVector = hasQuery && scoreMap[name] !== undefined;
          var matchCat = activeCat === 'all' || cat === activeCat;
          var matchVisibility = showAll || hasQuery || featured;
          var show = (matchName || matchVector) && matchCat && matchVisibility;
          scored.push({ el: el, show: show, score: scoreMap[name] || 0, name: name });
        });
        // Sort by vector score when searching
        if (hasQuery && vectorMatches) {
          scored.sort(function(a, b) { return b.score - a.score; });
          var grid = document.getElementById('tech-grid');
          scored.forEach(function(s) { grid.appendChild(s.el); });
        }
        scored.forEach(function(s) {
          s.el.style.display = s.show ? '' : 'none';
          if (s.show) visible++;
        });
        document.getElementById('tech-count').textContent = visible + ' shown';
      }
      function onInput() {
        applyFilter();
        var q = document.getElementById('tech-filter').value || '';
        if (q.length < 2) { vectorMatches = null; return; }
        clearTimeout(vectorTimer);
        vectorTimer = setTimeout(function() {
          fetch('/api/tech-search?q=' + encodeURIComponent(q))
            .then(function(r) { return r.json(); })
            .then(function(data) {
              vectorMatches = data.results;
              applyFilter();
            })
            .catch(function() {});
        }, 250);
      }
      document.getElementById('tech-filter').addEventListener('input', onInput);
    </script>
  `;
}

function recentPostsSection(notes: VaultNote[]): string {
  if (notes.length === 0) return "";
  const items = notes
    .map(
      (n) =>
        `<li><a href="/p/${encodeURIComponent(n.path)}">${n.title}</a></li>`,
    )
    .join("");

  return `
    <section class="section" id="posts">
      <h2 class="section-label">Recent Posts</h2>
      <ul class="note-list">${items}</ul>
      <a href="/posts" class="see-all">All posts &rarr;</a>
    </section>
  `;
}

function errorPage(code: string, message: string): string {
  return `
    <nav class="nav">
      <a href="/" class="nav-home">dawson.gg</a>
      <a href="/posts" class="nav-link">Posts</a>
    </nav>
    <div class="error-page">
      <h1>${code}</h1>
      <p>${message}</p>
      <a href="/">Go home</a>
    </div>
  `;
}

// ─── Helpers ───

async function getPublicNotesWithCache(env: Bindings): Promise<VaultNote[]> {
  const cached = await env.CACHE.get("vault:public-notes");
  if (cached) return JSON.parse(cached) as VaultNote[];

  const notes = await fetchPublicNotes(env);
  await env.CACHE.put("vault:public-notes", JSON.stringify(notes), {
    expirationTtl: 300,
  });
  return notes;
}


function noteLayout(note: VaultNote): string {
  const body = stripLeadingH1(note.content);
  return blogLayout(
    note.title,
    `
    <nav class="nav">
      <a href="/" class="nav-home">dawson.gg</a>
      <a href="/posts" class="nav-link">Posts</a>
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

// ─── Layouts ───

const SHARED_HEAD = `
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&display=swap" rel="stylesheet">
`;

const SHARED_CSS = `
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

  :root {
    --font-display: 'Instrument Serif', Georgia, serif;
    --font-body: 'Plus Jakarta Sans', -apple-system, sans-serif;
    --font-mono: 'JetBrains Mono', 'SF Mono', SFMono-Regular, Menlo, monospace;

    --bg: #faf9f7;
    --bg-elevated: #fff;
    --bg-card: #fff;
    --text: #1c1917;
    --text-secondary: #78716c;
    --text-faint: #a8a29e;
    --accent: #c2410c;
    --accent-dim: #fed7aa;
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
      --bg-card: #1c1917;
      --text: #fafaf9;
      --text-secondary: #a8a29e;
      --text-faint: #78716c;
      --accent: #fb923c;
      --accent-dim: #431407;
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

  .nav-link {
    font-size: 0.875rem;
    color: var(--text-secondary);
    text-decoration: none;
    transition: color 0.15s ease;
  }
  .nav-link:hover { color: var(--accent); }

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
`;

function portfolioLayout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${SHARED_HEAD}
  <title>${title} — dawson.gg</title>
  <style>
    ${SHARED_CSS}

    body {
      max-width: 960px;
      margin: 0 auto;
      padding: 2.5rem 1.5rem 4rem;
    }

    /* ─── Hero ─── */

    .hero {
      margin-bottom: 4rem;
      padding-bottom: 3rem;
      border-bottom: 1px solid var(--border);
    }

    .hero-name {
      font-family: var(--font-display);
      font-size: 3.5rem;
      font-weight: 400;
      font-style: italic;
      letter-spacing: -0.03em;
      line-height: 1.1;
      margin-bottom: 1rem;
    }

    .hero-intro {
      font-size: 1.0625rem;
      color: var(--text-secondary);
      max-width: 580px;
      line-height: 1.7;
      margin-bottom: 1.5rem;
    }

    .hero-links {
      display: flex;
      gap: 1rem;
    }

    .hero-link {
      font-size: 0.8125rem;
      color: var(--text-secondary);
      text-decoration: none;
      padding: 0.4rem 0.875rem;
      border: 1px solid var(--border);
      border-radius: 6px;
      transition: all 0.15s ease;
    }
    .hero-link:hover {
      color: var(--accent);
      border-color: var(--accent);
    }

    /* ─── Sections ─── */

    .section {
      margin-bottom: 4rem;
    }

    .section-label {
      font-family: var(--font-display);
      font-size: 1.75rem;
      font-style: italic;
      font-weight: 400;
      margin-bottom: 1.5rem;
      margin-top: 0;
    }

    /* ─── Projects ─── */

    .projects-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
    }
    @media (max-width: 640px) {
      .projects-grid { grid-template-columns: 1fr; }
    }

    .project-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1.5rem;
      transition: border-color 0.2s ease;
    }
    .project-card:hover {
      border-color: var(--accent);
    }

    .project-card h3 {
      font-family: var(--font-body);
      font-size: 1rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
      margin-top: 0;
    }

    .project-card p {
      font-size: 0.8125rem;
      color: var(--text-secondary);
      line-height: 1.6;
      margin-bottom: 1rem;
    }

    .project-tech {
      display: flex;
      flex-wrap: wrap;
      gap: 0.375rem;
      margin-bottom: 0.75rem;
    }

    .pill {
      font-size: 0.6875rem;
      color: var(--accent);
      background: var(--accent-dim);
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-weight: 500;
    }

    .project-links {
      display: flex;
      gap: 1rem;
    }
    .project-links a {
      font-size: 0.75rem;
      color: var(--text-secondary);
      text-decoration: none;
    }
    .project-links a:hover {
      color: var(--accent);
    }

    /* ─── Technologies ─── */

    .tech-controls {
      margin-bottom: 1rem;
    }

    .tech-filter-input {
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--bg-elevated);
      color: var(--text);
      font-family: var(--font-body);
      font-size: 0.8125rem;
      outline: none;
      transition: border-color 0.15s ease;
    }
    .tech-filter-input:focus { border-color: var(--accent); }
    .tech-filter-input::placeholder { color: var(--text-faint); }

    .cat-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 0.375rem;
    }

    .cat-btn {
      font-family: var(--font-body);
      font-size: 0.75rem;
      color: var(--text-faint);
      background: none;
      border: 1px solid var(--border);
      border-radius: 5px;
      padding: 0.3rem 0.625rem;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .cat-btn:hover {
      color: var(--text);
      border-color: var(--text-faint);
    }
    .cat-btn.active {
      color: var(--accent);
      border-color: var(--accent);
    }

    .tech-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 0.625rem;
    }

    .tech-item {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 0.5rem;
      padding: 0.625rem 0.875rem;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--bg-card);
      transition: border-color 0.15s ease;
      overflow: hidden;
    }
    .tech-item:hover {
      border-color: var(--accent);
    }

    .tech-name {
      font-weight: 600;
      font-size: 0.875rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .tech-cat {
      font-size: 0.6875rem;
      color: var(--text-faint);
      white-space: nowrap;
      flex-shrink: 0;
    }

    .tech-controls-top {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.75rem;
    }

    .tech-filter-input {
      flex: 1;
      max-width: 300px;
    }

    .tech-toggle {
      font-family: var(--font-body);
      font-size: 0.8125rem;
      color: var(--text-secondary);
      background: none;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.4rem 0.875rem;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .tech-toggle:hover {
      color: var(--accent);
      border-color: var(--accent);
    }

    .tech-count {
      font-size: 0.75rem;
      color: var(--text-faint);
    }

    /* ─── Recent Posts ─── */

    .note-list {
      list-style: none;
      padding-left: 0;
    }
    .note-list li { margin-bottom: 0; }
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

    .see-all {
      display: inline-block;
      margin-top: 1rem;
      font-size: 0.8125rem;
      color: var(--text-secondary);
      text-decoration: none;
    }
    .see-all:hover { color: var(--accent); }

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

function blogLayout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${SHARED_HEAD}
  <title>${title} — dawson.gg</title>
  <style>
    ${SHARED_CSS}

    body {
      max-width: 640px;
      margin: 0 auto;
      padding: 2.5rem 1.5rem 4rem;
    }

    article { margin-top: 0; }

    .note-header { margin-bottom: 2rem; }
    .note-header h1 { margin-bottom: 0.5rem; }
    .note-header time {
      display: block;
      font-size: 0.8125rem;
      color: var(--text-faint);
      font-variant-numeric: tabular-nums;
    }

    .home-header {
      margin-bottom: 2.5rem;
    }
    .home-header h1 {
      font-size: 2.25rem;
      font-style: italic;
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
    .note-list li { margin-bottom: 0; }
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
