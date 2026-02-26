import type { Bindings, VaultNote } from "./types.ts";

interface GitHubTreeItem {
  path: string;
  type: string;
  sha: string;
}

interface GitHubContent {
  content: string;
  encoding: string;
}

export async function fetchPublicNotes(env: Bindings): Promise<VaultNote[]> {
  const tree = await fetchTree(env);
  const publicFiles = tree.filter(
    (item) => item.path.startsWith("Public/") && item.path.endsWith(".md"),
  );

  const notes: VaultNote[] = [];
  for (const file of publicFiles) {
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
        "User-Agent": "vault-site",
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
): Promise<VaultNote | null> {
  const res = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`,
    {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "vault-site",
      },
    },
  );

  if (!res.ok) return null;
  const data = (await res.json()) as GitHubContent;
  const content = atob(data.content);
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
