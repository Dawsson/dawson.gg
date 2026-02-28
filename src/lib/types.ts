export interface Bindings {
  AI: Ai;
  CACHE: KVNamespace;
  VECTORIZE: VectorizeIndex;
  GITHUB_TOKEN: string;
  GITHUB_REPO: string;
  API_TOKEN: string;
  NODE_ENV: string;
}

export interface Note {
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
  contentType?: "note" | "project" | "technology";
}

export interface ShareLink {
  id: string;
  path: string;
  createdAt: string;
}
