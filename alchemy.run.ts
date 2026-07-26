import alchemy, { secret } from "alchemy";
import { Ai, Astro, D1Database, KVNamespace, VectorizeIndex } from "alchemy/cloudflare";

const app = await alchemy("portfolio", {
  phase: process.env.DESTROY ? "destroy" : "up",
});

const ai = Ai();

const cache = await KVNamespace("portfolio-cache", {
  title: "portfolio-cache",
});

const voiceDb = await D1Database("portfolio-voice-sessions", {
  name: "portfolio-voice-sessions",
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
    VOICE_DB: voiceDb,
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
    HERMES_TO_NUMBER: secret(process.env.HERMES_TO_NUMBER),
    TELNYX_AI_ASSISTANT_ID:
      process.env.TELNYX_AI_ASSISTANT_ID ?? "assistant-721dd60e-fd64-41ae-8a5b-12b12387abd5",
    HERMES_INTERNAL_TOKEN: secret(process.env.HERMES_INTERNAL_TOKEN),
    TELNYX_AI_TOOL_TOKEN: secret(process.env.TELNYX_AI_TOOL_TOKEN),
    ...(process.env.WHOOP_CLIENT_SECRET
      ? { WHOOP_CLIENT_SECRET: secret(process.env.WHOOP_CLIENT_SECRET) }
      : {}),
    ...(process.env.WHOOP_CLIENT_ID ? { WHOOP_CLIENT_ID: process.env.WHOOP_CLIENT_ID } : {}),
    ...(process.env.WHOOP_USER_ID ? { WHOOP_USER_ID: secret(process.env.WHOOP_USER_ID) } : {}),
  },
  url: true,
});

console.log(`Portfolio: ${site.url}`);

await app.finalize();
