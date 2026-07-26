# dawson.gg

My personal portfolio and blog, built with [Hono](https://hono.dev) JSX on [Cloudflare Workers](https://workers.cloudflare.com).

## Features

- **Server-rendered JSX** — Hono JSX components with zero client-side framework overhead
- **Semantic search** — Cloudflare Vectorize + Workers AI embeddings for fuzzy, meaning-based search
- **GitHub contributions** — Live contribution graph pulled from GitHub, cached in KV, refreshed via cron
- **Dark/light theme** — Automatic via `prefers-color-scheme`, no flash
- **Lighthouse 100/100/100/100** — Performance, Accessibility, Best Practices, SEO

## Stack

| Layer     | Technology                                        |
| --------- | ------------------------------------------------- |
| Runtime   | Cloudflare Workers                                |
| Framework | Hono (JSX)                                        |
| Search    | Vectorize + Workers AI (bge-base-en-v1.5)         |
| IaC       | [Alchemy](https://github.com/sam-goodwin/alchemy) |
| Styling   | CSS variables, no build step                      |
| Fonts     | Instrument Serif, Plus Jakarta Sans, Caveat       |

## Development

```bash
# Install dependencies
bun install

# Start dev server (port 3002)
bun run dev

# Deploy to Cloudflare
bun run deploy
```

## Hermes voice briefings

The Call Control webhook is:

```text
https://dawson.gg/api/telnyx/webhook
```

Configure that URL as the primary webhook URL for a Telnyx Call Control Application, using
webhook API version 2 and `POST`. The endpoint verifies the raw request body with Telnyx's
Ed25519 signature and rejects unsigned requests in production. In development only, signature
verification is bypassed when `TELNYX_PUBLIC_KEY` is absent.

Required deployment environment variables:

- `TELNYX_API_KEY` — a Telnyx API v2 key, used to speak on answered calls and originate calls.
- `TELNYX_PUBLIC_KEY` — the account webhook signing public key from **Keys & Credentials**.
- `TELNYX_CONNECTION_ID` — the ID of the Call Control Application used to originate calls.
- `TELNYX_FROM_NUMBER` — the Telnyx number assigned to the application, in E.164 format.
- `HERMES_TO_NUMBER` — the destination number, in E.164 format.

The authenticated Hermes voice briefing workflow is documented in
[`docs/hermes-voice.md`](docs/hermes-voice.md).

For local webhook testing, run `bun run dev`, expose its HTTPS address with a tunnel such as
Cloudflare Tunnel or ngrok, and temporarily set the Call Control Application webhook URL to:

```text
https://YOUR-TUNNEL.example/api/telnyx/webhook
```

Use the real `TELNYX_PUBLIC_KEY` locally to exercise signature verification. Telnyx webhook
requests cannot be accurately signature-tested by editing or reserializing their JSON body.

## WHOOP webhook

WHOOP V2 events are received at:

```text
https://dawson.gg/api/whoop/webhook
```

The endpoint verifies `X-WHOOP-Signature` against the raw request body using
`WHOOP_CLIENT_SECRET`, rejects stale signatures, and processes events only when `user_id` matches
`WHOOP_USER_ID`. While that ID is not configured, signed event references are quarantined without
being attributed to Dawson. Once configured, other connected WHOOP members are acknowledged and
ignored. Accepted event references are retained in KV for 30 days; the webhook never contains the
underlying health stats, which must be fetched separately through Dawson's OAuth grant.

Hermes can read accepted event references from `GET /api/internal/whoop/events` using
`HERMES_INTERNAL_TOKEN`. Start Dawson's private OAuth flow with
`POST /api/internal/whoop/connect`; its callback is `https://dawson.gg/api/whoop/callback`.
OAuth tokens are encrypted at rest and used to return current WHOOP metrics in the internal feed.

## License

MIT
