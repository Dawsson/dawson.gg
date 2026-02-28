import { createApp } from "./app.tsx";
import { refreshContributions } from "./contributions.ts";
import type { Bindings } from "./types.ts";

const app = createApp();

export default {
  fetch: app.fetch,

  async scheduled(
    _event: ScheduledEvent,
    env: Bindings,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(refreshContributions(env));
  },
};
