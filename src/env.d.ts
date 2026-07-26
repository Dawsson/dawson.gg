/// <reference types="astro/client" />

type ENV = {
  AI: Ai;
  CACHE: KVNamespace;
  VOICE_DB: D1Database;
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
  HERMES_TO_NUMBER?: string;
  TELNYX_AI_ASSISTANT_ID?: string;
  HERMES_INTERNAL_TOKEN?: string;
  TELNYX_AI_TOOL_TOKEN?: string;
  WHOOP_CLIENT_SECRET?: string;
  WHOOP_CLIENT_ID?: string;
  WHOOP_USER_ID?: string;
};

type Runtime = import("@astrojs/cloudflare").Runtime<ENV>;

declare namespace App {
  interface Locals extends Runtime {}
}
