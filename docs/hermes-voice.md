# Hermes voice briefing bridge

Hermes gathers private context and decides when to call. `dawson.gg` owns authenticated session
state, fixed-destination call origination, signed Telnyx webhooks, and the MCP bridge. Telnyx
conducts the voice conversation. Hermes remains the only component that executes approved actions
against Discord, Signal, iMessage, calendars, or other services.

## Morning briefing contract

Hermes creates a call:

```http
POST /api/internal/briefing-sessions
Authorization: Bearer HERMES_INTERNAL_TOKEN
Idempotency-Key: UUID
Content-Type: application/json

{
  "title": "Morning briefing for July 27",
  "max_duration_seconds": 300,
  "items": [
    {
      "id": "calendar-standup",
      "kind": "calendar",
      "title": "Team standup",
      "summary": "10:00 AM with the product team.",
      "source": "calendar"
    },
    {
      "id": "discord-alex",
      "kind": "message",
      "title": "Alex needs a response",
      "summary": "Asked whether the launch can move to Tuesday.",
      "source": "discord",
      "requires_response": true,
      "details": "Include only the context needed to answer safely."
    }
  ]
}
```

Allowed item kinds are `calendar`, `message`, `task`, `update`, `reminder`, and `other`. The
destination is always `HERMES_TO_NUMBER`; the request cannot supply a phone number.

Hermes reads the result using:

```http
GET /api/internal/briefing-sessions/{id}
Authorization: Bearer HERMES_INTERNAL_TOKEN
```

The response contains briefing items and the actions captured during the call. An action with
`status: "draft"` must not be executed. An action with `status: "approved"` was explicitly
confirmed during the call, but Hermes should still enforce its own platform permissions and
idempotency before execution.

## Telnyx MCP

The Streamable HTTP endpoint is:

```text
https://dawson.gg/api/telnyx/mcp
```

It requires `Authorization: Bearer TELNYX_AI_TOOL_TOKEN` and exposes:

- `get_briefing`
- `record_action`
- `finish_briefing`

Telnyx supplies a platform-controlled `telnyx_conversation_id` in MCP `_meta`. The server uses
that value to select the briefing; it does not accept a model-supplied task or phone number.

Run `bun run telnyx:configure-assistant` after deployment. The script idempotently stores the MCP
bearer token as a Telnyx integration secret, registers the MCP server, attaches it to the assistant,
and configures the assistant as concise **Hermes Voice**. Audio recording remains disabled.

## Security and limitations

- Telnyx Call Control webhooks use raw-body Ed25519 verification.
- Hermes endpoints use `HERMES_INTERNAL_TOKEN`.
- MCP uses the separate `TELNYX_AI_TOOL_TOKEN`.
- Calls always go to the configured fixed destination.
- Voice records intent; Hermes executes external actions.
- Exact content must be read back and explicitly confirmed before `send_reply` is approved.
- D1 retains structured session state; audio recording is disabled.

Required environment variables are `TELNYX_API_KEY`, `TELNYX_PUBLIC_KEY`,
`TELNYX_CONNECTION_ID`, `TELNYX_FROM_NUMBER`, `HERMES_TO_NUMBER`,
`TELNYX_AI_ASSISTANT_ID`, `HERMES_INTERNAL_TOKEN`, and `TELNYX_AI_TOOL_TOKEN`.
