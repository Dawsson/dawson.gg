/// <reference types="astro/client" />

type ENV = {
  AI: Ai;
  CACHE: KVNamespace;
  VECTORIZE: VectorizeIndex;
  GITHUB_TOKEN: string;
  GITHUB_REPO: string;
  API_TOKEN: string;
  NODE_ENV: string;
  CF_TOKEN_DAWSON: string;
  CF_ZONE_DAWSON: string;
  CF_TOKEN_FLYTE: string;
  CF_ZONE_FLYTE: string;
  CF_TOKEN_WIP: string;
  CF_ZONE_WIP: string;
};

type Runtime = import("@astrojs/cloudflare").Runtime<ENV>;

declare namespace App {
  interface Locals extends Runtime {}
}
