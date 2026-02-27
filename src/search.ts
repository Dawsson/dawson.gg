import type { Bindings, SearchResult, VaultNote } from "./types.ts";
import { PROJECTS, TECHNOLOGIES } from "./data.ts";

const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";

export async function searchNotes(
  env: Bindings,
  query: string,
  limit = 5,
  contentType?: "note" | "project" | "technology",
): Promise<SearchResult[]> {
  const queryEmbedding = await embed(env, query);

  const filter: VectorizeVectorMetadataFilter = {};
  if (contentType) {
    filter.contentType = contentType;
  }

  const matches = await env.VECTORIZE.query(queryEmbedding, {
    topK: limit,
    filter: contentType ? filter : undefined,
    returnMetadata: "all",
  });

  return matches.matches.map((m) => ({
    path: (m.metadata?.path as string) ?? "",
    title: (m.metadata?.title as string) ?? "",
    snippet: (m.metadata?.snippet as string) ?? "",
    score: m.score,
    contentType: (m.metadata?.contentType as SearchResult["contentType"]) ?? "note",
  }));
}

export async function buildIndex(
  env: Bindings,
  notes: VaultNote[],
): Promise<{ indexed: number }> {
  const vectors: VectorizeVector[] = [];

  // Index vault notes
  for (const note of notes) {
    const chunks = chunkText(note.content);
    if (chunks.length === 0) continue;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      const emb = await embed(env, chunk);
      vectors.push({
        id: `note:${note.path}:${i}`,
        values: emb,
        metadata: {
          path: note.path,
          title: note.title,
          snippet: chunk.slice(0, 200),
          contentType: "note",
        },
      });
    }
  }

  // Index projects
  for (const project of PROJECTS) {
    const text = `${project.title}: ${project.description} Technologies: ${project.technologies.join(", ")}`;
    const emb = await embed(env, text);
    vectors.push({
      id: `project:${project.slug}`,
      values: emb,
      metadata: {
        path: `project:${project.slug}`,
        title: project.title,
        snippet: project.description.slice(0, 200),
        contentType: "project",
      },
    });
  }

  // Index technologies
  for (const tech of TECHNOLOGIES) {
    const text = `${tech.name}: ${tech.description} Category: ${tech.category}`;
    const emb = await embed(env, text);
    vectors.push({
      id: `tech:${tech.slug}`,
      values: emb,
      metadata: {
        path: `tech:${tech.slug}`,
        title: tech.name,
        snippet: tech.description,
        contentType: "technology",
      },
    });
  }

  // Upsert in batches of 100 (Vectorize limit)
  for (let i = 0; i < vectors.length; i += 100) {
    const batch = vectors.slice(i, i + 100);
    await env.VECTORIZE.upsert(batch);
  }

  return { indexed: vectors.length };
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
