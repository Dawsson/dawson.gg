import { Hono } from "hono";
import type { Bindings, ShareLink, VaultNote } from "./types.ts";
import {
  fetchAllNotes,
  fetchNoteByPath,
  fetchPublicNotes,
} from "./github.ts";
import { buildIndex, searchNotes } from "./search.ts";
import { renderMarkdown } from "./render.ts";
import { fetchContributions } from "./contributions.ts";
import {
  PortfolioLayout,
  BlogLayout,
  Nav,
  ErrorPage,
  Hero,
  Footer,
  GitHub,
  Projects,
  Technologies,
  RecentPosts,
} from "./components/index.ts";

export { refreshContributions } from "./contributions.ts";

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

function stripLeadingH1(md: string): string {
  return md.replace(/^# .+\n*/m, "");
}

// ─── App ───

export function createApp() {
  const app = new Hono<{ Bindings: Bindings }>();

  // ─── Portfolio home ───

  app.get("/", async (c) => {
    const notes = await getPublicNotesWithCache(c.env);
    const recentNotes = notes.slice(0, 5);

    let contribData;
    try {
      contribData = await fetchContributions(c.env);
    } catch {
      contribData = null;
    }

    return c.html(
      <PortfolioLayout title="Dawson — Software Engineer">
        <Hero />
        {contribData && <GitHub data={contribData} />}
        <Projects />
        <Technologies />
        <RecentPosts notes={recentNotes} />
        <Footer />
      </PortfolioLayout>,
    );
  });

  // ─── Blog listing ───

  app.get("/posts", async (c) => {
    const notes = await getPublicNotesWithCache(c.env);

    return c.html(
      <BlogLayout title="Posts">
        <Nav />
        <div class="home-header">
          <h1>Posts</h1>
          <p>Notes, ideas, and things worth writing down.</p>
        </div>
        <ul class="note-list">
          {notes.map((n) => (
            <li>
              <a href={`/p/${encodeURIComponent(n.path)}`}>{n.title}</a>
            </li>
          ))}
        </ul>
      </BlogLayout>,
    );
  });

  // ─── View a public note ───

  app.get("/p/*", async (c) => {
    const path = c.req.path.replace("/p/", "");
    const decoded = decodeURIComponent(path);

    if (!decoded.startsWith("Public/")) {
      return c.html(<ErrorPage code="404" message="This note doesn't exist." />, 404);
    }

    const notes = await getPublicNotesWithCache(c.env);
    const note = notes.find((n) => n.path === decoded);
    if (!note) {
      return c.html(<ErrorPage code="404" message="This note doesn't exist." />, 404);
    }

    return c.html(<NoteView note={note} />);
  });

  // ─── Share link ───

  app.get("/note/:id", async (c) => {
    const id = c.req.param("id");
    const raw = await c.env.CACHE.get(`share:${id}`);
    if (!raw) {
      return c.html(
        <ErrorPage code="404" message="This link doesn't exist or has expired." />,
        404,
      );
    }

    const share = JSON.parse(raw) as ShareLink;
    const note = await fetchNoteByPath(c.env, share.path);
    if (!note) {
      return c.html(<ErrorPage code="404" message="This note doesn't exist." />, 404);
    }

    return c.html(<NoteView note={note} />);
  });

  // ─── Authenticated API ───

  const api = new Hono<{ Bindings: Bindings }>();

  api.use("*", async (c, next) => {
    const header = c.req.header("Authorization");
    const query = c.req.query("token");
    const valid =
      header === `Bearer ${c.env.API_TOKEN}` || query === c.env.API_TOKEN;
    if (!valid) return c.json({ error: "unauthorized" }, 401);
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
      const val = await c.env.CACHE.get(key.name);
      if (val) shares.push(JSON.parse(val) as ShareLink);
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

// ─── Note view (shared between /p/* and /note/:id) ───

import { raw } from "hono/html";
import type { FC } from "hono/jsx";

const NoteView: FC<{ note: VaultNote }> = ({ note }) => {
  const body = stripLeadingH1(note.content);
  const rendered = renderMarkdown(body);

  return (
    <BlogLayout title={note.title}>
      <Nav />
      <article>
        <header class="note-header">
          <h1>{note.title}</h1>
          {note.frontmatter.created && (
            <time>{String(note.frontmatter.created)}</time>
          )}
        </header>
        {raw(rendered)}
      </article>
    </BlogLayout>
  );
};
