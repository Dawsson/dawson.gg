export interface Bindings {
  AI: Ai;
  CACHE: KVNamespace;
  WAKE_DB: D1Database;
  VECTORIZE: VectorizeIndex;
  GITHUB_TOKEN: string;
  GITHUB_REPO: string;
  API_TOKEN: string;
  NODE_ENV: string;
  CF_ANALYTICS_TOKEN: string;
  TELNYX_API_KEY?: string;
  TELNYX_PUBLIC_KEY?: string;
  TELNYX_CONNECTION_ID?: string;
  TELNYX_FROM_NUMBER?: string;
  WAKEUP_TO_NUMBER?: string;
  TELNYX_AI_ASSISTANT_ID?: string;
  HERMES_INTERNAL_WAKE_TOKEN?: string;
  TELNYX_AI_TOOL_TOKEN?: string;
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
