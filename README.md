# dawson.gg

My personal portfolio and blog, built with [Hono](https://hono.dev) JSX on [Cloudflare Workers](https://workers.cloudflare.com).

## Features

- **Server-rendered JSX** — Hono JSX components with zero client-side framework overhead
- **Semantic search** — Cloudflare Vectorize + Workers AI embeddings for fuzzy, meaning-based search
- **GitHub contributions** — Live contribution graph pulled from GitHub, cached in KV, refreshed via cron
- **Dark/light theme** — Automatic via `prefers-color-scheme`, no flash
- **Lighthouse 100/100/100/100** — Performance, Accessibility, Best Practices, SEO

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Cloudflare Workers |
| Framework | Hono (JSX) |
| Search | Vectorize + Workers AI (bge-base-en-v1.5) |
| IaC | [Alchemy](https://github.com/sam-goodwin/alchemy) |
| Styling | CSS variables, no build step |
| Fonts | Instrument Serif, Plus Jakarta Sans, Caveat |

## Development

```bash
# Install dependencies
bun install

# Start dev server (port 3002)
bun run dev

# Deploy to Cloudflare
bun run deploy
```

## License

MIT
