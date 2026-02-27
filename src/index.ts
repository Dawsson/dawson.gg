/// <reference types="@types/bun" />
import { createApp } from "./app.ts";

const app = createApp();

Bun.serve({
  fetch(req: Request) {
    return app.fetch(req, {
      AI: null,
      CACHE: null,
      VECTORIZE: null,
      GITHUB_TOKEN: process.env.GITHUB_TOKEN ?? "",
      GITHUB_REPO: "Dawsson/vault",
      NODE_ENV: "development",
    } as any);
  },
  port: 3002,
});

console.log("vault-site dev server running on http://localhost:3002");
