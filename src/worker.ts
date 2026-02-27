import { createApp, refreshContributions } from "./app.ts";
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
