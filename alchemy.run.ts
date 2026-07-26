import alchemy, { secret } from "alchemy";
import { Ai, Astro, D1Database, KVNamespace, VectorizeIndex } from "alchemy/cloudflare";

const app = await alchemy("portfolio", {
  phase: process.env.DESTROY ? "destroy" : "up",
});

const ai = Ai();

const cache = await KVNamespace("portfolio-cache", {
  title: "portfolio-cache",
});

const wakeDb = await D1Database("portfolio-wake-tasks", {
  name: "portfolio-wake-tasks",
  migrationsDir: "./migrations",
});

const vectorIndex = await VectorizeIndex("portfolio-search", {
  dimensions: 768,
  metric: "cosine",
  adopt: true,
});

const site = await Astro("portfolio", {
  name: "portfolio",
  compatibility: "node",
  domains: ["dawson.gg"],
  crons: ["*/10 * * * *"],
  bindings: {
    AI: ai,
    CACHE: cache,
    WAKE_DB: wakeDb,
    VECTORIZE: vectorIndex,
    GITHUB_TOKEN: secret(process.env.GITHUB_TOKEN),
    API_TOKEN: secret(process.env.API_TOKEN),
    GITHUB_REPO: "Dawsson/vault",
    NODE_ENV: process.env.NODE_ENV ?? "development",
    CF_ANALYTICS_TOKEN: secret(process.env.CF_ANALYTICS_TOKEN),
    TELNYX_API_KEY: secret(process.env.TELNYX_API_KEY),
    TELNYX_PUBLIC_KEY: secret(process.env.TELNYX_PUBLIC_KEY),
    TELNYX_CONNECTION_ID: secret(process.env.TELNYX_CONNECTION_ID),
    TELNYX_FROM_NUMBER: secret(process.env.TELNYX_FROM_NUMBER),
    WAKEUP_TO_NUMBER: secret(process.env.WAKEUP_TO_NUMBER),
    TELNYX_AI_ASSISTANT_ID:
      process.env.TELNYX_AI_ASSISTANT_ID ?? "assistant-1ed2ce2e-6d8e-4527-af37-4e801b5b6068",
    HERMES_INTERNAL_WAKE_TOKEN: secret(process.env.HERMES_INTERNAL_WAKE_TOKEN),
    TELNYX_AI_TOOL_TOKEN: secret(process.env.TELNYX_AI_TOOL_TOKEN),
  },
  url: true,
});

console.log(`Portfolio: ${site.url}`);

await app.finalize();
