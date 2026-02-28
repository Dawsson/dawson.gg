import type { SSRManifest } from "astro";
import { App } from "astro/app";
import { handle } from "@astrojs/cloudflare/handler";
import { refreshContributions } from "./lib/contributions.ts";
import type { Bindings } from "./lib/types.ts";

type Env = {
  [key: string]: unknown;
  ASSETS: { fetch: (req: Request | string) => Promise<Response> };
};

export function createExports(manifest: SSRManifest) {
  const app = new App(manifest);

  return {
    default: {
      fetch(request: Request, env: Env, context: ExecutionContext) {
        // @ts-expect-error: @cloudflare/workers-types version mismatch between
        // our package and @astrojs/cloudflare's bundled copy (Headers.getAll)
        return handle(manifest, app, request, env, context);
      },

      async scheduled(_event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
        ctx.waitUntil(refreshContributions(env));
      },
    },
  };
}
