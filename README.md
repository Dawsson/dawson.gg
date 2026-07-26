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

## Telnyx wake-up calls

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
- `WAKEUP_TO_NUMBER` — the destination number, in E.164 format.

`initiateWakeUpCall` in `src/lib/telnyx.ts` is the internal server-side entry point for starting a
call. It is not exposed through an unauthenticated HTTP route. On `call.answered`, the webhook
asks Telnyx to speak the configured wake-up message.

The authenticated Hermes-to-AI wake workflow is documented in
[`docs/telnyx-wake-agent.md`](docs/telnyx-wake-agent.md).

For local webhook testing, run `bun run dev`, expose its HTTPS address with a tunnel such as
Cloudflare Tunnel or ngrok, and temporarily set the Call Control Application webhook URL to:

```text
https://YOUR-TUNNEL.example/api/telnyx/webhook
```

Use the real `TELNYX_PUBLIC_KEY` locally to exercise signature verification. Telnyx webhook
requests cannot be accurately signature-tested by editing or reserializing their JSON body.

## License

MIT
