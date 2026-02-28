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
        ${await githubSection(c.env)}
        ${projectsSection()}
        ${technologiesSection()}
        ${recentPostsSection(recentNotes)}
        ${footerSection()}
        `,
      ),
    );
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
  return `
    <section class="hero">
      <h1 class="hero-name">${PROFILE.name}</h1>
      <p class="hero-intro">${PROFILE.intro}</p>
    </section>
  `;
}

function footerSection(): string {
  return `
    <footer class="site-footer">
      <div class="footer-grid">
        <div class="footer-left">
          <p class="footer-signature">Dawson</p>
          <p class="footer-copyright">&copy; ${new Date().getFullYear()}</p>
        </div>
        <div class="footer-center">
          <a href="mailto:hello@dawson.gg" class="footer-email">hello@dawson.gg</a>
        </div>
        <div class="footer-right">
          <a href="https://github.com/Dawsson" class="footer-social" target="_blank" rel="noopener">GitHub</a>
          <a href="https://x.com/DawssonMonroe" class="footer-social" target="_blank" rel="noopener">X</a>
        </div>
      </div>
    </footer>
  `;
}

export type ContribCell = { date: string; level: number; week: number; day: number };
export type ContribData = { total: number; cells: ContribCell[] };

const CONTRIB_CACHE_KEY = "github:contributions:v4";
const CONTRIB_TTL = 21600; // 6 hours

async function fetchContributionsFromGitHub(): Promise<ContribData> {
  const res = await fetch("https://github.com/users/Dawsson/contributions", {
    headers: { "User-Agent": "vault-site" },
  });
  const html = await res.text();

  const totalMatch = html.match(/([\d,]+)\s+contributions?\s+in\s+the\s+last\s+year/i);
  const total = totalMatch ? parseInt(totalMatch[1]!.replace(/,/g, "")) : 0;

  const cells: ContribCell[] = [];
  const cellRegex = /data-ix="(\d+)"[^>]*data-date="(\d{4}-\d{2}-\d{2})"[^>]*id="contribution-day-component-(\d+)-\d+"[^>]*data-level="(\d)"/g;
  let match;
  while ((match = cellRegex.exec(html)) !== null) {
    cells.push({
      date: match[2]!,
      level: parseInt(match[4]!),
      week: parseInt(match[1]!),
      day: parseInt(match[3]!),
    });
  }

  return { total, cells };
}

async function fetchContributions(env: Bindings): Promise<ContribData> {
  const cached = await env.CACHE.get(CONTRIB_CACHE_KEY);
  if (cached) return JSON.parse(cached) as ContribData;
  return refreshContributions(env);
}

/** Force-refresh contributions data into KV cache. Called by cron and as fallback. */
export async function refreshContributions(env: Bindings): Promise<ContribData> {
  const data = await fetchContributionsFromGitHub();
  await env.CACHE.put(CONTRIB_CACHE_KEY, JSON.stringify(data), { expirationTtl: CONTRIB_TTL });
  return data;
}

async function githubSection(env: Bindings): Promise<string> {
  try {
    const data = await fetchContributions(env);

    const levelColors: Record<string, { light: string; dark: string }> = {
      "0": { light: "#ebedf0", dark: "#1c1917" },
      "1": { light: "#9be9a8", dark: "#0e4429" },
      "2": { light: "#40c463", dark: "#006d32" },
      "3": { light: "#30a14e", dark: "#26a641" },
      "4": { light: "#216e39", dark: "#39d353" },
    };

    const cellSize = 10;
    const cellGap = 3;
    const step = cellSize + cellGap;
    const maxWeek = Math.max(...data.cells.map((c) => c.week));
    const totalW = (maxWeek + 1) * step;
    const totalH = 7 * step - cellGap;

    let rects = "";
    for (const c of data.cells) {
      const x = c.week * step;
      const y = c.day * step;
      const colors = levelColors[String(c.level)] ?? levelColors["0"]!;
      rects += `<rect class="contrib-cell" x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="2" data-light="${colors.light}" data-dark="${colors.dark}"><title>${c.date}</title></rect>`;
    }

    return `
      <section class="section" id="github">
        <div class="github-header">
          <div class="github-info">
            <h2 class="section-label" style="margin-bottom:0">GitHub</h2>
            <span class="github-stat">${data.total.toLocaleString()} contributions in the last year</span>
          </div>
          <a href="https://github.com/Dawsson" class="github-profile-link" target="_blank" rel="noopener">@Dawsson &rarr;</a>
        </div>
        <div class="github-graph">
          <svg viewBox="0 0 ${totalW} ${totalH}" id="contrib-svg">
            ${rects}
          </svg>
        </div>
      </section>
      <script>
        (function() {
          function applyColors(isDark) {
            var attr = isDark ? 'data-dark' : 'data-light';
            document.querySelectorAll('.contrib-cell').forEach(function(r) {
              r.setAttribute('fill', r.getAttribute(attr) || '#ebedf0');
            });
          }
          applyColors(window.matchMedia('(prefers-color-scheme: dark)').matches);
          window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
            applyColors(e.matches);
          });
        })();
      </script>
    `;
  } catch {
    return "";
  }
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
      `<div class="tech-item" data-name="${t.name.toLowerCase()}" data-cat="${t.category}" data-slug="${t.slug}" data-desc="${t.description.toLowerCase()}" data-kw="${(t.keywords || "").toLowerCase()}" data-featured="${t.featured}" title="${t.name} — ${t.description}" style="${t.featured ? "" : "display:none"}">
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

  const totalCount = TECHNOLOGIES.length;

  return `
    <section class="section" id="technologies">
      <h2 class="section-label">Technologies</h2>
      <div class="tech-controls">
        <div class="tech-controls-top">
          <input type="text" id="tech-filter" class="tech-filter-input" placeholder="Search ${totalCount} technologies..." />
          <span class="tech-count" id="tech-count"></span>
          <span class="tech-time" id="tech-time"></span>
        </div>
        <div class="cat-buttons">
          <button class="cat-btn active" data-cat="featured" onclick="filterCat('featured')">Featured</button>
          <button class="cat-btn" data-cat="all" onclick="filterCat('all')">All ${totalCount}</button>
          <span class="cat-divider"></span>
          ${categoryButtons}
        </div>
      </div>
      <div class="tech-grid" id="tech-grid">${allItems}</div>
    </section>
    <script>
      var activeCat = 'featured';

      function norm(s) { return s.replace(/[-_]/g, ' ').replace(/\\s+/g, ' '); }

      function fuzzyWord(word, target) {
        if (!word) return 0;
        var w = norm(word), t = norm(target);
        var idx = t.indexOf(w);
        if (idx !== -1) return 1.0 + (idx === 0 ? 0.2 : 0);
        var tWords = t.split(' ');
        for (var i = 0; i < tWords.length; i++) {
          if (tWords[i].indexOf(w) === 0) return 0.95;
        }
        if (w.length <= 3) return 0;
        var stems = [w];
        if (w.endsWith('ing')) stems.push(w.slice(0, -3), w.slice(0, -3) + 'e', w.slice(0, -3) + 'ed');
        if (w.endsWith('ed')) stems.push(w.slice(0, -2), w.slice(0, -2) + 'ing');
        if (w.endsWith('s') && w.length > 4) stems.push(w.slice(0, -1));
        for (var si = 1; si < stems.length; si++) {
          if (stems[si].length >= 3 && t.indexOf(stems[si]) !== -1) return 0.85;
        }
        var qi = 0, score = 0, consecutive = 0, lastIdx = -2;
        for (var ti = 0; ti < t.length && qi < w.length; ti++) {
          if (t[ti] === w[qi]) {
            qi++;
            consecutive = (ti === lastIdx + 1) ? consecutive + 1 : 1;
            score += consecutive + (ti === 0 ? 2 : 0);
            lastIdx = ti;
          }
        }
        if (qi < w.length) return 0;
        var lenPenalty = w.length / Math.max(t.length, 1);
        return (score / (w.length * 4)) * (0.5 + 0.5 * lenPenalty);
      }

      function searchScore(query, fields) {
        var words = query.trim().split(/\\s+/).filter(function(w) { return w.length > 0; });
        if (words.length === 0) return 0;
        var totalScore = 0;
        for (var wi = 0; wi < words.length; wi++) {
          var bestWordScore = 0;
          for (var fi = 0; fi < fields.length; fi++) {
            var s = fuzzyWord(words[wi], fields[fi].text) * fields[fi].weight;
            if (s > bestWordScore) bestWordScore = s;
          }
          if (bestWordScore === 0) return 0;
          totalScore += bestWordScore;
        }
        return totalScore / words.length;
      }

      function syncToUrl() {
        var params = new URLSearchParams();
        var q = document.getElementById('tech-filter').value || '';
        if (q) params.set('q', q);
        if (activeCat !== 'featured') params.set('cat', activeCat);
        var str = params.toString();
        var url = window.location.pathname + (str ? '?' + str : '');
        history.replaceState(null, '', url);
      }

      function filterCat(cat) {
        activeCat = cat;
        document.querySelectorAll('.cat-btn').forEach(function(b) {
          b.classList.toggle('active', b.getAttribute('data-cat') === cat);
        });
        applyFilter();
        syncToUrl();
      }

      function applyFilter() {
        var t0 = performance.now();
        var q = (document.getElementById('tech-filter').value || '').toLowerCase();
        var hasQuery = q.length > 0;
        var visible = 0;
        var items = document.querySelectorAll('.tech-item');
        var scored = [];

        items.forEach(function(el) {
          var name = el.getAttribute('data-name') || '';
          var cat = el.getAttribute('data-cat') || '';
          var desc = el.getAttribute('data-desc') || '';
          var slug = el.getAttribute('data-slug') || '';
          var kw = el.getAttribute('data-kw') || '';
          var featured = el.getAttribute('data-featured') === 'true';

          // Search always searches everything
          if (hasQuery) {
            var score = searchScore(q, [
              { text: name, weight: 1.0 },
              { text: slug, weight: 0.8 },
              { text: kw, weight: 0.7 },
              { text: desc, weight: 0.6 },
              { text: cat, weight: 0.5 },
            ]);
            scored.push({ el: el, show: score > 0, score: score });
            return;
          }

          // No search — use tab filter
          var show = false;
          if (activeCat === 'featured') {
            show = featured;
          } else if (activeCat === 'all') {
            show = true;
          } else {
            show = cat === activeCat;
          }
          scored.push({ el: el, show: show, score: 0 });
        });

        if (hasQuery) {
          scored.sort(function(a, b) { return b.score - a.score; });
          var grid = document.getElementById('tech-grid');
          scored.forEach(function(s) { grid.appendChild(s.el); });
        }

        scored.forEach(function(s) {
          s.el.style.display = s.show ? '' : 'none';
          if (s.show) visible++;
        });

        var elapsed = performance.now() - t0;
        var timeEl = document.getElementById('tech-time');
        var countEl = document.getElementById('tech-count');
        countEl.textContent = visible + ' shown';
        if (hasQuery) {
          timeEl.textContent = elapsed < 1 ? '< 1ms' : elapsed.toFixed(1) + 'ms';
        } else {
          timeEl.textContent = '';
        }
      }

      document.getElementById('tech-filter').addEventListener('input', function() {
        applyFilter();
        syncToUrl();
      });

      // Restore state from URL on load
      (function() {
        var params = new URLSearchParams(window.location.search);
        var q = params.get('q');
        var cat = params.get('cat');
        if (q) document.getElementById('tech-filter').value = q;
        if (cat) {
          activeCat = cat;
          document.querySelectorAll('.cat-btn').forEach(function(b) {
            b.classList.toggle('active', b.getAttribute('data-cat') === cat);
          });
        }
        if (q || cat) applyFilter();
      })();
    </script>
  `;
}

function recentPostsSection(notes: VaultNote[]): string {
  if (notes.length === 0) return "";

  const items = notes
    .map((n) => {
      const date = n.frontmatter.created
        ? formatDate(String(n.frontmatter.created))
        : "";
      // Prefer frontmatter subtitle/description over raw content
      const subtitle = String(n.frontmatter.subtitle || n.frontmatter.description || "");
      let snippet = subtitle;
      if (!snippet) {
        snippet = n.content
          .replace(/^#+ .*/gm, "")
          .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
          .replace(/[*_`~]/g, "")
          .trim()
          .slice(0, 140)
          .trim();
      }
      const ellipsis = !subtitle && n.content.length > 140 ? "..." : "";

      return `
        <a href="/p/${encodeURIComponent(n.path)}" class="post-card">
          <div class="post-card-content">
            <h3 class="post-card-title">${n.title}</h3>
            ${snippet ? `<p class="post-card-snippet">${snippet}${ellipsis}</p>` : ""}
          </div>
          ${date ? `<time class="post-card-date">${date}</time>` : ""}
          <span class="post-card-arrow">&rarr;</span>
        </a>
      `;
    })
    .join("");

  return `
    <section class="section" id="posts">
      <div class="section-header">
        <h2 class="section-label">Recent Posts</h2>
        <a href="/posts" class="see-all">All posts &rarr;</a>
      </div>
      <div class="posts-list">${items}</div>
    </section>
  `;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
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
  <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&display=swap" rel="stylesheet">
`;

const SHARED_CSS = `
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

  :root {
    --font-display: 'Instrument Serif', Georgia, serif;
    --font-body: 'Plus Jakarta Sans', -apple-system, sans-serif;
    --font-mono: 'JetBrains Mono', 'SF Mono', SFMono-Regular, Menlo, monospace;
    --font-hand: 'Caveat', cursive;

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

    .section-header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
    }
    .section-header .section-label { margin-bottom: 1.5rem; }
    .section-header .see-all { margin-top: 0; }

    /* ─── GitHub ─── */

    .github-header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 1.25rem;
    }

    .github-info {
      display: flex;
      align-items: baseline;
      gap: 1rem;
    }

    .github-stat {
      font-size: 0.875rem;
      color: var(--text-secondary);
    }

    .github-profile-link {
      font-size: 0.8125rem;
      color: var(--text-secondary);
      text-decoration: none;
      font-family: var(--font-mono);
      transition: color 0.15s ease;
    }
    .github-profile-link:hover { color: var(--accent); }

    .github-graph {
      overflow-x: auto;
      padding: 1rem;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 10px;
    }
    .github-graph svg {
      display: block;
      width: 100%;
      height: auto;
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
      align-items: center;
      gap: 0.375rem;
    }

    .cat-divider {
      width: 1px;
      height: 1.25rem;
      background: var(--border);
      margin: 0 0.25rem;
      flex-shrink: 0;
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

    .tech-count {
      font-size: 0.75rem;
      color: var(--text-faint);
    }

    .tech-time {
      font-family: var(--font-mono);
      font-size: 0.6875rem;
      color: var(--text-faint);
    }

    /* ─── Recent Posts ─── */

    .posts-list {
      display: flex;
      flex-direction: column;
      gap: 0;
    }

    .post-card {
      display: flex;
      align-items: center;
      gap: 1.25rem;
      padding: 1.25rem 1.5rem;
      border: 1px solid var(--border);
      border-radius: 10px;
      text-decoration: none;
      color: var(--text);
      transition: border-color 0.2s ease, background 0.2s ease;
      margin-bottom: 0.625rem;
    }
    .post-card:hover {
      border-color: var(--accent);
      background: var(--bg-card);
    }

    .post-card-content {
      flex: 1;
      min-width: 0;
    }

    .post-card-title {
      font-family: var(--font-body);
      font-size: 0.9375rem;
      font-weight: 600;
      margin: 0;
      line-height: 1.4;
    }

    .post-card-snippet {
      font-size: 0.8125rem;
      color: var(--text-secondary);
      margin: 0.375rem 0 0;
      line-height: 1.5;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .post-card-date {
      font-size: 0.75rem;
      color: var(--text-faint);
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
      flex-shrink: 0;
    }

    .post-card-arrow {
      font-size: 1rem;
      color: var(--text-faint);
      transition: color 0.15s ease, transform 0.15s ease;
      flex-shrink: 0;
    }
    .post-card:hover .post-card-arrow {
      color: var(--accent);
      transform: translateX(3px);
    }

    .see-all {
      display: inline-block;
      margin-top: 1rem;
      font-size: 0.8125rem;
      color: var(--text-secondary);
      text-decoration: none;
    }
    .see-all:hover { color: var(--accent); }

    /* ─── Footer ─── */

    .site-footer {
      margin-top: 5rem;
      padding-top: 2.5rem;
      border-top: 1px solid var(--border);
    }

    .footer-grid {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
    }

    .footer-left {
      display: flex;
      align-items: baseline;
      gap: 0.75rem;
    }

    .footer-signature {
      font-family: var(--font-hand);
      font-size: 1.75rem;
      font-weight: 600;
      color: var(--text);
      letter-spacing: 0.01em;
      line-height: 1;
      margin: 0;
    }

    .footer-copyright {
      font-size: 0.75rem;
      color: var(--text-faint);
      margin: 0;
    }

    .footer-center {
      text-align: center;
    }

    .footer-email {
      font-family: var(--font-mono);
      font-size: 0.8125rem;
      color: var(--text-secondary);
      text-decoration: none;
      transition: color 0.15s ease;
      letter-spacing: -0.01em;
    }
    .footer-email:hover { color: var(--accent); }

    .footer-right {
      display: flex;
      gap: 1.25rem;
    }

    .footer-social {
      font-size: 0.8125rem;
      color: var(--text-faint);
      text-decoration: none;
      transition: color 0.15s ease;
    }
    .footer-social:hover { color: var(--accent); }

    @media (max-width: 640px) {
      .footer-grid {
        flex-direction: column;
        gap: 1.5rem;
        align-items: flex-start;
      }
      .footer-center { text-align: left; }
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
<body>${body}
</body>
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
