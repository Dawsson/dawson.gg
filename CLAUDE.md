# dawson.gg

Personal portfolio and blog running on Cloudflare Workers.

## Stack

- **Runtime**: Cloudflare Workers (deployed via [Alchemy](https://github.com/sam-goodwin/alchemy))
- **Framework**: [Hono](https://hono.dev) with JSX components (server-rendered, zero client JS framework)
- **Search**: Cloudflare Vectorize + Workers AI embeddings (bge-base-en-v1.5)
- **Content**: Markdown notes fetched from GitHub API
- **Styling**: Instrument Serif + Plus Jakarta Sans, dark/light theme via `prefers-color-scheme`
- **Package manager**: Bun

## Commands

- `bun run dev` — local dev server (port 3002, remote mode)
- `bun run deploy` — deploy to Cloudflare via Alchemy
- `bun run destroy` — tear down Cloudflare resources

## Architecture

```
src/
  app.tsx              — Hono routes (portfolio, blog, API)
  worker.ts            — Worker entrypoint + cron handler
  contributions.ts     — GitHub contribution graph fetching + KV caching
  styles.ts            — CSS constants (shared, portfolio, blog)
  data.ts              — Static portfolio data (projects, technologies)
  search.ts            — Vectorize-powered semantic search
  github.ts            — GitHub API client
  render.ts            — Markdown → HTML
  types.ts             — Shared types
  client/
    tech-filter.ts     — Client-side fuzzy search for technologies section
  components/
    layouts.tsx         — PortfolioLayout, BlogLayout, Nav, ErrorPage
    hero.tsx            — Hero section
    github.tsx          — GitHub contribution graph (SVG)
    projects.tsx        — Featured projects grid
    technologies.tsx    — Technology pills with filter/search
    recent-posts.tsx    — Recent blog post cards
    footer.tsx          — Site footer
```

## Routes

- `GET /` — Portfolio landing page
- `GET /posts` — Blog listing
- `GET /p/*` — Individual post
- `GET /note/:id` — Shared note via UUID
- `GET /api/*` — Authenticated API (search, reindex, notes, shares)

## Environment

Required bindings (set via Alchemy):

- `AI` — Cloudflare Workers AI
- `CACHE` — KV namespace
- `VECTORIZE` — Vectorize index (768 dims, cosine)
- `GITHUB_TOKEN` — GitHub PAT for repo access
- `GITHUB_REPO` — Repository path (e.g. `Dawsson/vault`)
- `API_TOKEN` — Bearer token for API auth
