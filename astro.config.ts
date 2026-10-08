import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  output: "server",
  server: {
    host: true,
    allowedHosts: true,
  },
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
      configPath: "wrangler.jsonc",
    },
    workerEntryPoint: {
      path: "src/worker.ts",
    },
  }),
});
