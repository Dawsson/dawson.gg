import alchemy, { secret } from "alchemy";
import { Ai, Astro, KVNamespace, VectorizeIndex } from "alchemy/cloudflare";

const app = await alchemy("portfolio", {
  phase: process.env.DESTROY ? "destroy" : "up",
});

const ai = Ai();

const cache = await KVNamespace("portfolio-cache", {
  title: "portfolio-cache",
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
    VECTORIZE: vectorIndex,
    GITHUB_TOKEN: secret(process.env.GITHUB_TOKEN),
    API_TOKEN: secret(process.env.API_TOKEN),
    GITHUB_REPO: "Dawsson/vault",
    NODE_ENV: process.env.NODE_ENV ?? "development",
    CF_TOKEN_DAWSON: secret(process.env.CF_TOKEN_DAWSON),
    CF_ZONE_DAWSON: process.env.CF_ZONE_DAWSON ?? "",
    CF_TOKEN_FLYTE: secret(process.env.CF_TOKEN_FLYTE),
    CF_ZONE_FLYTE: process.env.CF_ZONE_FLYTE ?? "",
    CF_TOKEN_WIP: secret(process.env.CF_TOKEN_WIP),
    CF_ZONE_WIP: process.env.CF_ZONE_WIP ?? "",
  },
  url: true,
});

console.log(`Portfolio: ${site.url}`);

await app.finalize();
