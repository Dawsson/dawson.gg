export interface Bindings {
  AI: Ai;
  CACHE: KVNamespace;
  GITHUB_TOKEN: string;
  GITHUB_REPO: string;
  NODE_ENV: string;
}

export interface VaultNote {
  path: string;
  title: string;
  content: string;
  frontmatter: Record<string, unknown>;
  lastModified: string;
}

export interface SearchResult {
  path: string;
  title: string;
  snippet: string;
  score: number;
}
