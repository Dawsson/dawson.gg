import alchemy, { secret } from "alchemy";
import { Ai, KVNamespace, VectorizeIndex, Worker } from "alchemy/cloudflare";

const app = await alchemy("vault-site", {
  phase: process.env.DESTROY ? "destroy" : "up",
});

const ai = Ai();

const cache = await KVNamespace("vault-cache", {
  title: "vault-cache",
});

const vectorIndex = await VectorizeIndex("vault-search", {
  dimensions: 768,
  metric: "cosine",
  adopt: true,
});

const site = await Worker("vault-site", {
  name: "vault-site",
  entrypoint: "./src/worker.ts",
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
  dev: {
    remote: true,
    port: 3002,
  },
  url: true,
});

console.log(`Vault site: ${site.url}`);

await app.finalize();
