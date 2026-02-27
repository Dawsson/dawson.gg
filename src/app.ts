import { Hono } from "hono";
import type { Bindings, ShareLink, VaultNote } from "./types.ts";
import {
  fetchAllNotes,
  fetchNoteByPath,
  fetchPublicNotes,
} from "./github.ts";
import { buildIndex, searchNotes } from "./search.ts";
import { renderMarkdown } from "./render.ts";
import { PROFILE, PROJECTS, TECHNOLOGIES } from "./data.ts";

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

  // ─── Blog listing (moved from old /) ───

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
          <div class="nav-links">
            <a href="/posts">Posts</a>
            <a href="/search">Search</a>
          </div>
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
        blogLayout(
          "Not Found",
          errorPage("404", "This note doesn't exist."),
        ),
        404,
      );
    }

    const notes = await getPublicNotesWithCache(c.env);
    const note = notes.find((n) => n.path === decoded);
    if (!note)
      return c.html(
        blogLayout(
          "Not Found",
          errorPage("404", "This note doesn't exist."),
        ),
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
        blogLayout(
          "Not Found",
          errorPage("404", "This note doesn't exist."),
        ),
        404,
      );

    return c.html(noteLayout(note));
  });

  // ─── Search ───

  app.get("/search", async (c) => {
    const q = c.req.query("q") ?? "";
    const type = c.req.query("type") as
      | "note"
      | "project"
      | "technology"
      | undefined;
    const json = c.req.query("json") === "1";

    if (json) {
      if (!q.trim()) return c.json({ results: [] });
      const results = await searchNotes(c.env, q, 10, type);
      return c.json({ results });
    }

    let resultHtml = "";
    if (q.trim()) {
      const results = await searchNotes(c.env, q, 10, type);
      resultHtml = results.length
        ? results
            .map((r) => {
              const href =
                r.contentType === "note"
                  ? `/p/${encodeURIComponent(r.path)}`
                  : r.contentType === "project"
                    ? `/#projects`
                    : `/#technologies`;
              const badge =
                r.contentType === "project"
                  ? '<span class="badge badge-project">project</span>'
                  : r.contentType === "technology"
                    ? '<span class="badge badge-tech">tech</span>'
                    : '<span class="badge badge-note">post</span>';
              return `<li>
                <a href="${href}">${badge} ${escapeHtml(r.title)}</a>
                <p class="snippet">${escapeHtml(r.snippet)}</p>
              </li>`;
            })
            .join("\n")
        : "<li>No results found.</li>";
    }

    return c.html(
      portfolioLayout(
        q ? `Search: ${q}` : "Search",
        `
        <nav class="nav">
          <a href="/" class="nav-home">dawson.gg</a>
          <div class="nav-links">
            <a href="/posts">Posts</a>
            <a href="/search">Search</a>
          </div>
        </nav>
        <div class="search-page">
          <h1>${q ? `Search: ${escapeHtml(q)}` : "Search"}</h1>
          <form action="/search" method="get" class="search-form">
            <input type="text" name="q" value="${escapeHtml(q)}" placeholder="Search projects, tech, posts..." />
            <button type="submit">Search</button>
          </form>
          <div class="search-filters">
            <a href="/search?q=${encodeURIComponent(q)}" class="${!type ? "active" : ""}">All</a>
            <a href="/search?q=${encodeURIComponent(q)}&type=project" class="${type === "project" ? "active" : ""}">Projects</a>
            <a href="/search?q=${encodeURIComponent(q)}&type=technology" class="${type === "technology" ? "active" : ""}">Tech</a>
            <a href="/search?q=${encodeURIComponent(q)}&type=note" class="${type === "note" ? "active" : ""}">Posts</a>
          </div>
          ${resultHtml ? `<ul class="search-results">${resultHtml}</ul>` : ""}
        </div>
      `,
      ),
    );
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
      <div class="nav-links">
        <a href="/posts">Posts</a>
        <a href="/search">Search</a>
      </div>
    </nav>
    <section class="hero">
      <p class="hero-label">Software Engineer</p>
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
      const links = [
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
          ${links ? `<div class="project-links">${links}</div>` : ""}
        </div>
      `;
    })
    .join("");

  return `
    <section class="section" id="projects">
      <p class="section-label">Projects</p>
      <div class="projects-grid">${cards}</div>
    </section>
  `;
}

function technologiesSection(): string {
  const featured = TECHNOLOGIES.filter((t) => t.featured);
  const all = TECHNOLOGIES;

  const featuredPills = featured
    .map(
      (t) =>
        `<span class="tech-pill" data-slug="${t.slug}" data-category="${t.category}">
          <span class="tech-name">${t.name}</span>
          <span class="tech-desc">${t.description}</span>
        </span>`,
    )
    .join("");

  const allPills = all
    .map(
      (t) =>
        `<span class="tech-pill" data-slug="${t.slug}" data-category="${t.category}" data-name="${t.name.toLowerCase()}">
          <span class="tech-name">${t.name}</span>
          <span class="tech-desc">${t.description}</span>
        </span>`,
    )
    .join("");

  return `
    <section class="section" id="technologies">
      <p class="section-label">Technologies</p>
      <div class="tech-featured" id="tech-featured">${featuredPills}</div>
      <div class="tech-all" id="tech-all" style="display:none">
        <input type="text" id="tech-filter" class="tech-filter-input" placeholder="Filter technologies..." />
        <div class="tech-grid">${allPills}</div>
      </div>
      <button class="tech-toggle" id="tech-toggle" onclick="toggleTech()">Show all</button>
    </section>
    <script>
      function toggleTech() {
        const featured = document.getElementById('tech-featured');
        const all = document.getElementById('tech-all');
        const btn = document.getElementById('tech-toggle');
        const showing = all.style.display !== 'none';
        featured.style.display = showing ? '' : 'none';
        all.style.display = showing ? 'none' : '';
        btn.textContent = showing ? 'Show all' : 'Show featured';
      }
      document.getElementById('tech-filter')?.addEventListener('input', function(e) {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll('#tech-all .tech-pill').forEach(function(el) {
          const name = el.getAttribute('data-name') || '';
          const cat = el.getAttribute('data-category') || '';
          el.style.display = (name.includes(q) || cat.includes(q)) ? '' : 'none';
        });
      });
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
      <p class="section-label">Recent Posts</p>
      <ul class="note-list">${items}</ul>
      <a href="/posts" class="see-all">All posts &rarr;</a>
    </section>
  `;
}

function errorPage(code: string, message: string): string {
  return `
    <nav class="nav">
      <a href="/" class="nav-home">dawson.gg</a>
      <div class="nav-links">
        <a href="/posts">Posts</a>
        <a href="/search">Search</a>
      </div>
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function noteLayout(note: VaultNote): string {
  const body = stripLeadingH1(note.content);
  return blogLayout(
    note.title,
    `
    <nav class="nav">
      <a href="/" class="nav-home">dawson.gg</a>
      <div class="nav-links">
        <a href="/posts">Posts</a>
        <a href="/search">Search</a>
      </div>
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
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
`;

const SHARED_CSS = `
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

  :root {
    --font-body: 'Space Grotesk', -apple-system, sans-serif;
    --font-mono: 'JetBrains Mono', 'SF Mono', SFMono-Regular, Menlo, monospace;

    --bg: #0b0b0f;
    --bg-elevated: #141419;
    --bg-card: #18181f;
    --text: #e8e6e3;
    --text-secondary: #8a8a8e;
    --text-faint: #555558;
    --accent: #6ee7b7;
    --accent-dim: #2d6a52;
    --link: #e8e6e3;
    --link-hover: #6ee7b7;
    --border: #222228;
    --code-bg: #141419;
    --code-border: #222228;
  }

  @media (prefers-color-scheme: light) {
    :root {
      --bg: #fafaf9;
      --bg-elevated: #ffffff;
      --bg-card: #f5f5f4;
      --text: #1c1917;
      --text-secondary: #78716c;
      --text-faint: #a8a29e;
      --accent: #059669;
      --accent-dim: #d1fae5;
      --link: #1c1917;
      --link-hover: #059669;
      --border: #e7e5e4;
      --code-bg: #f5f5f4;
      --code-border: #e7e5e4;
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
    font-family: var(--font-mono);
    font-size: 0.875rem;
    color: var(--accent);
    text-decoration: none;
    letter-spacing: -0.01em;
    font-weight: 500;
  }
  .nav-home:hover { opacity: 0.8; }

  .nav-links {
    display: flex;
    gap: 1.5rem;
  }
  .nav-links a {
    font-family: var(--font-mono);
    font-size: 0.8125rem;
    color: var(--text-secondary);
    text-decoration: none;
    transition: color 0.15s ease;
  }
  .nav-links a:hover { color: var(--accent); }

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
    font-family: var(--font-body);
    font-weight: 600;
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

    .hero-label {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      color: var(--accent);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 0.75rem;
    }

    .hero-name {
      font-size: 3.5rem;
      font-weight: 700;
      letter-spacing: -0.03em;
      line-height: 1.1;
      margin-bottom: 1rem;
    }

    .hero-intro {
      font-size: 1.125rem;
      color: var(--text-secondary);
      max-width: 600px;
      line-height: 1.7;
      margin-bottom: 1.5rem;
    }

    .hero-links {
      display: flex;
      gap: 1rem;
    }

    .hero-link {
      font-family: var(--font-mono);
      font-size: 0.8125rem;
      color: var(--text-secondary);
      text-decoration: none;
      padding: 0.5rem 1rem;
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
      font-family: var(--font-mono);
      font-size: 0.6875rem;
      color: var(--text-faint);
      text-transform: uppercase;
      letter-spacing: 0.12em;
      margin-bottom: 1.5rem;
    }

    /* ─── Projects ─── */

    .projects-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 1rem;
    }

    .project-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1.5rem;
      transition: border-color 0.15s ease;
    }
    .project-card:hover {
      border-color: var(--accent-dim);
    }

    .project-card h3 {
      font-size: 1.0625rem;
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
      font-family: var(--font-mono);
      font-size: 0.6875rem;
      color: var(--accent);
      background: transparent;
      border: 1px solid var(--accent-dim);
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
    }

    .project-links {
      display: flex;
      gap: 1rem;
    }
    .project-links a {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      color: var(--text-secondary);
      text-decoration: none;
    }
    .project-links a:hover {
      color: var(--accent);
    }

    /* ─── Technologies ─── */

    .tech-featured, .tech-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    .tech-pill {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.75rem 1rem;
      min-width: 140px;
      transition: border-color 0.15s ease;
    }
    .tech-pill:hover {
      border-color: var(--accent-dim);
    }

    .tech-name {
      display: block;
      font-weight: 600;
      font-size: 0.875rem;
      margin-bottom: 0.25rem;
    }

    .tech-desc {
      display: block;
      font-size: 0.75rem;
      color: var(--text-secondary);
      line-height: 1.4;
    }

    .tech-toggle {
      display: inline-block;
      margin-top: 1rem;
      font-family: var(--font-mono);
      font-size: 0.75rem;
      color: var(--text-secondary);
      background: none;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.5rem 1rem;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .tech-toggle:hover {
      color: var(--accent);
      border-color: var(--accent);
    }

    .tech-filter-input {
      width: 100%;
      padding: 0.625rem 0.875rem;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--bg-elevated);
      color: var(--text);
      font-family: var(--font-body);
      font-size: 0.875rem;
      outline: none;
      margin-bottom: 1rem;
      transition: border-color 0.15s ease;
    }
    .tech-filter-input:focus { border-color: var(--accent); }
    .tech-filter-input::placeholder { color: var(--text-faint); }

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
      font-family: var(--font-mono);
      font-size: 0.8125rem;
      color: var(--text-secondary);
      text-decoration: none;
    }
    .see-all:hover { color: var(--accent); }

    /* ─── Search page ─── */

    .search-page h1 { margin-bottom: 1.5rem; }

    .search-form {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
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
      background: var(--accent);
      color: var(--bg);
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-family: var(--font-body);
      font-size: 0.875rem;
      font-weight: 600;
      transition: opacity 0.15s ease;
    }
    .search-form button:hover { opacity: 0.85; }

    .search-filters {
      display: flex;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
    }
    .search-filters a {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      color: var(--text-faint);
      text-decoration: none;
      padding: 0.375rem 0.75rem;
      border: 1px solid var(--border);
      border-radius: 6px;
      transition: all 0.15s ease;
    }
    .search-filters a.active {
      color: var(--accent);
      border-color: var(--accent);
    }
    .search-filters a:hover {
      color: var(--accent);
      border-color: var(--accent);
    }

    .search-results { list-style: none; padding-left: 0; }
    .search-results li {
      padding: 1rem 0;
      border-bottom: 1px solid var(--border);
    }
    .search-results a { font-weight: 500; text-decoration: none; }
    .search-results a:hover { color: var(--accent); }
    .snippet {
      color: var(--text-secondary);
      font-size: 0.8125rem;
      margin-top: 0.25rem;
      line-height: 1.5;
    }

    .badge {
      font-family: var(--font-mono);
      font-size: 0.625rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.15rem 0.4rem;
      border-radius: 3px;
      vertical-align: middle;
      margin-right: 0.25rem;
    }
    .badge-project { color: var(--accent); border: 1px solid var(--accent-dim); }
    .badge-tech { color: #a78bfa; border: 1px solid #4c1d95; }
    .badge-note { color: var(--text-faint); border: 1px solid var(--border); }

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

    /* ─── Note header ─── */

    .note-header { margin-bottom: 2rem; }
    .note-header h1 { margin-bottom: 0.5rem; }
    .note-header time {
      display: block;
      font-family: var(--font-mono);
      font-size: 0.75rem;
      color: var(--text-faint);
      font-variant-numeric: tabular-nums;
    }

    /* ─── Home / Posts ─── */

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
      background: var(--accent);
      color: var(--bg);
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-family: var(--font-body);
      font-size: 0.875rem;
      font-weight: 600;
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
