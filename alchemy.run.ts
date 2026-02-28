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
  crons: ["0 */6 * * *"],
  bindings: {
    AI: ai,
    CACHE: cache,
    VECTORIZE: vectorIndex,
    GITHUB_TOKEN: secret(process.env.GITHUB_TOKEN),
    API_TOKEN: secret(process.env.API_TOKEN),
    GITHUB_REPO: "Dawsson/vault",
    NODE_ENV: process.env.NODE_ENV ?? "development",
  },
  url: true,
});

console.log(`Portfolio: ${site.url}`);

await app.finalize();
