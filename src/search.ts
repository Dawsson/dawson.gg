import type { Bindings, SearchResult, VaultNote } from "./types.ts";

const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
const INDEX_KEY = "vault:search-index";

interface StoredIndex {
  notes: Array<{
    path: string;
    title: string;
    chunks: string[];
    embeddings: number[][];
  }>;
  updatedAt: string;
}

export async function searchNotes(
  env: Bindings,
  query: string,
  limit = 5,
): Promise<SearchResult[]> {
  const index = await getIndex(env);
  if (!index || index.notes.length === 0) return [];

  const queryEmbedding = await embed(env, query);

  const results: Array<{ path: string; title: string; chunk: string; score: number }> = [];

  for (const note of index.notes) {
    for (let i = 0; i < note.embeddings.length; i++) {
      const score = cosineSimilarity(queryEmbedding, note.embeddings[i]!);
      results.push({
        path: note.path,
        title: note.title,
        chunk: note.chunks[i]!,
        score,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  const deduped: SearchResult[] = [];
  for (const r of results) {
    if (seen.has(r.path)) continue;
    seen.add(r.path);
    deduped.push({
      path: r.path,
      title: r.title,
      snippet: r.chunk.slice(0, 200),
      score: r.score,
    });
    if (deduped.length >= limit) break;
  }

  return deduped;
}

export async function buildIndex(
  env: Bindings,
  notes: VaultNote[],
): Promise<void> {
  const indexed: StoredIndex = { notes: [], updatedAt: new Date().toISOString() };

  for (const note of notes) {
    const chunks = chunkText(note.content);
    if (chunks.length === 0) continue;

    const embeddings: number[][] = [];
    for (const chunk of chunks) {
      const emb = await embed(env, chunk);
      embeddings.push(emb);
    }

    indexed.notes.push({
      path: note.path,
      title: note.title,
      chunks,
      embeddings,
    });
  }

  await env.CACHE.put(INDEX_KEY, JSON.stringify(indexed));
}

async function getIndex(env: Bindings): Promise<StoredIndex | null> {
  const raw = await env.CACHE.get(INDEX_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as StoredIndex;
}

async function embed(env: Bindings, text: string): Promise<number[]> {
  const res = (await env.AI.run(EMBEDDING_MODEL, {
    text: [text],
  })) as { data: number[][] };
  return res.data[0]!;
}

function chunkText(text: string, maxLen = 512): string[] {
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 20);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length > maxLen && current.length > 0) {
      chunks.push(current.trim());
      current = "";
    }
    current += para + "\n\n";
  }

  if (current.trim().length > 0) chunks.push(current.trim());
  return chunks;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    magA += a[i]! * a[i]!;
    magB += b[i]! * b[i]!;
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}
