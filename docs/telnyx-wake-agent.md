# Telnyx wake-agent bridge

Hermes is the decision engine. `dawson.gg` owns task state, call origination, signed Telnyx
webhooks, AI Assistant startup, and the assistant's status-report tool. Telnyx conducts the
conversation.

## API contract

Hermes creates one call with:

```http
POST /api/internal/wake-tasks
Authorization: Bearer HERMES_INTERNAL_WAKE_TOKEN
Idempotency-Key: UUID
Content-Type: application/json

{
  "type": "meeting_wake",
  "severity": "high",
  "goal": "Confirm Dawson is awake for a meeting in 15 minutes.",
  "success_condition": "Dawson explicitly says he is awake and getting up.",
  "max_duration_seconds": 120
}
```

Hermes polls `GET /api/internal/wake-tasks/{id}` with the same bearer token. The response's
`next_recommended_action` is `wait`, `stop`, or `retry`; Hermes owns retries and escalation.
Neither endpoint accepts a phone number.

## Security

- Telnyx event webhooks use raw-body Ed25519 verification and a five-minute replay window.
- Hermes endpoints use `HERMES_INTERNAL_WAKE_TOKEN`.
- The Telnyx AI tool uses a separate `TELNYX_AI_TOOL_TOKEN` header configured on the assistant.
- The destination is always `WAKEUP_TO_NUMBER`; callers cannot override it.
- D1 stores summaries and short evidence excerpts for seven days, not complete transcripts.
- Telnyx audio recording is disabled. Conversation messages remain available for fallback
  classification.

Required bindings are the existing Telnyx values plus `TELNYX_AI_ASSISTANT_ID`,
`HERMES_INTERNAL_WAKE_TOKEN`, `TELNYX_AI_TOOL_TOKEN`, and the `WAKE_DB` D1 binding.

Run `bun run telnyx:configure-assistant` after deploying the tool endpoint. It repurposes the
configured assistant as **Hermes Wake Voice**, attaches `report_wake_status`, limits calls to two
minutes, enables conversation events, and disables audio recording.

## Failure behavior

If AI Assistant startup fails after answer, the webhook plays the proven fixed wake-up message and
marks the task failed. If the assistant omits its tool call, the conversation-ended webhook fetches
messages and only confirms success when Dawson explicitly says he is awake and getting up. Calls
without wake-task client state retain the original fixed-message behavior.
