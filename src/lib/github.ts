import type { Bindings, Note } from "./types.ts";

interface GitHubTreeItem {
  path: string;
  type: string;
  sha: string;
}

interface GitHubContent {
  content: string;
  encoding: string;
}

/** Fetch only notes in Public/ */
export async function fetchPublicNotes(env: Bindings): Promise<Note[]> {
  return fetchNotesByPrefix(env, "Public/");
}

/** Fetch ALL markdown notes */
export async function fetchAllNotes(env: Bindings): Promise<Note[]> {
  const tree = await fetchTree(env);
  const mdFiles = tree.filter(
    (item) =>
      item.path.endsWith(".md") &&
      !item.path.startsWith("Templates/") &&
      !item.path.startsWith("Archive/") &&
      !item.path.startsWith(".obsidian/") &&
      !item.path.includes("node_modules/") &&
      item.path !== "CLAUDE.md",
  );

  const notes: Note[] = [];
  for (const file of mdFiles) {
    const note = await fetchNote(env, file.path);
    if (note) notes.push(note);
  }
  return notes;
}

/** Fetch a single note by path */
export async function fetchNoteByPath(
  env: Bindings,
  path: string,
): Promise<Note | null> {
  return fetchNote(env, path);
}

async function fetchNotesByPrefix(
  env: Bindings,
  prefix: string,
): Promise<Note[]> {
  const tree = await fetchTree(env);
  const files = tree.filter(
    (item) => item.path.startsWith(prefix) && item.path.endsWith(".md"),
  );

  const notes: Note[] = [];
  for (const file of files) {
    const note = await fetchNote(env, file.path);
    if (note) notes.push(note);
  }
  return notes;
}

async function fetchTree(env: Bindings): Promise<GitHubTreeItem[]> {
  const res = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/git/trees/main?recursive=1`,
    {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "dawson-portfolio",
      },
    },
  );

  if (!res.ok) throw new Error(`GitHub tree fetch failed: ${res.status}`);
  const data = (await res.json()) as { tree: GitHubTreeItem[] };
  return data.tree.filter((item) => item.type === "blob");
}

async function fetchNote(
  env: Bindings,
  path: string,
): Promise<Note | null> {
  const res = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`,
    {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "dawson-portfolio",
      },
    },
  );

  if (!res.ok) return null;
  const data = (await res.json()) as GitHubContent;
  // Decode base64 → binary → UTF-8 (atob alone mangles multibyte chars)
  const binary = atob(data.content.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const content = new TextDecoder().decode(bytes);
  const { frontmatter, body } = parseFrontmatter(content);

  return {
    path,
    title:
      (frontmatter.title as string) ||
      path.split("/").pop()?.replace(".md", "") ||
      path,
    content: body,
    frontmatter,
    lastModified: new Date().toISOString(),
  };
}

function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };

  const raw = match[1]!;
  const body = match[2]!;
  const frontmatter: Record<string, unknown> = {};

  for (const line of raw.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    frontmatter[key] = value;
  }

  return { frontmatter, body };
}
