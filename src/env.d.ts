/// <reference types="astro/client" />

type ENV = {
  AI: Ai;
  CACHE: KVNamespace;
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
};

type Runtime = import("@astrojs/cloudflare").Runtime<ENV>;

declare namespace App {
  interface Locals extends Runtime {}
}
