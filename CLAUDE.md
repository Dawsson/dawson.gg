# vault-site — Public site for the Obsidian vault

Cloudflare Worker that serves public notes from the `Dawsson/vault` repo with RAG search powered by Workers AI.

## Stack

- **Runtime**: Cloudflare Workers (deployed via Alchemy)
- **Framework**: Hono
- **Search**: Workers AI embeddings (bge-base-en-v1.5) stored in KV
- **Content**: Fetched from GitHub API (`Dawsson/vault` repo, `Public/` folder)
- **Package manager**: Bun (never npm)

## Commands

- `bun run dev` — local dev server on port 3002
- `bun run deploy` — deploy to Cloudflare via alchemy
- `bun run destroy` — tear down Cloudflare resources
- `POST /api/reindex` — re-fetch notes from GitHub and rebuild search index

## Architecture

- `alchemy.run.ts` — infrastructure config (Worker, KV, AI binding)
- `src/worker.ts` — Worker entrypoint
- `src/app.ts` — Hono routes (home, note view, search, API)
- `src/github.ts` — GitHub API client for fetching vault notes
- `src/search.ts` — Embedding-based search (Workers AI + KV index)
- `src/render.ts` — Markdown to HTML renderer
- `src/types.ts` — Shared types

## Git

Use `committer` for all commits. Never pass `.` — always list specific files.
