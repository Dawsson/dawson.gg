import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Miniflare } from "miniflare";
import {
  createBriefingSession,
  getBriefingSession,
  type BriefingItem,
} from "../src/lib/briefing-sessions";
import { hasBearerToken } from "../src/lib/internal-auth";
import { parseWakeBridgeInput, publicWakeBridge } from "../src/lib/wake-bridge";
import {
  createVoiceSession,
  getVoiceSession,
  recordVoiceSessionEvent,
  updateVoiceSession,
} from "../src/lib/voice-sessions";
import { POST as createBriefingRoute } from "../src/pages/api/internal/briefing-sessions/index";
import { POST as mcpRoute } from "../src/pages/api/telnyx/mcp";

let miniflare: Miniflare;
let db: D1Database;

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    d1Databases: { VOICE_DB: "voice-tests" },
  });
  db = await miniflare.getD1Database("VOICE_DB");
  await db.exec(
    (await Bun.file("migrations/0001_voice_sessions.sql").text()).replace(/\s*\n\s*/g, " "),
  );
});

afterAll(async () => {
  await miniflare.dispose();
});

describe("Hermes voice sessions", () => {
  test("requires an exact bearer token", async () => {
    expect(
      await hasBearerToken(
        new Request("https://example.com", {
          headers: { Authorization: "Bearer internal-secret" },
        }),
        "internal-secret",
      ),
    ).toBe(true);
    expect(
      await hasBearerToken(
        new Request("https://example.com?token=internal-secret"),
        "internal-secret",
      ),
    ).toBe(false);
  });

  test("briefing endpoint rejects arbitrary destinations", async () => {
    const response = await createBriefingRoute({
      request: new Request("https://example.com/api/internal/briefing-sessions", {
        method: "POST",
        headers: {
          Authorization: "Bearer secret",
          "Idempotency-Key": crypto.randomUUID(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "Morning", items: [], to: "+13135550199" }),
      }),
      locals: { runtime: { env: { VOICE_DB: db, HERMES_INTERNAL_TOKEN: "secret" } } },
    } as never);
    expect(response.status).toBe(400);
  });

  test("creates durable idempotent voice session state", async () => {
    const first = await createVoiceSession(db, 300, "request-1");
    const duplicate = await createVoiceSession(db, 300, "request-1");
    expect(first.created).toBe(true);
    expect(duplicate.created).toBe(false);
    expect(duplicate.session.id).toBe(first.session.id);

    const updated = await updateVoiceSession(db, first.session.id, {
      status: "calling",
      telnyxCallControlId: "v3:test",
    });
    expect(updated?.status).toBe("calling");
    expect(
      await recordVoiceSessionEvent(db, first.session.id, "event-1", "call.initiated", "now"),
    ).toBe(true);
    expect(
      await recordVoiceSessionEvent(db, first.session.id, "event-1", "call.initiated", "now"),
    ).toBe(false);
  });

  test("wake bridge is fixed-destination, bounded, and requires explicit confirmation", () => {
    expect(
      parseWakeBridgeInput({
        type: "daily_wake",
        severity: "high",
        goal: "Wake Dawson.",
        success_condition: "Explicit awake confirmation.",
        max_duration_seconds: 45,
        to: "+13135550199",
      }),
    ).toBeNull();
    expect(
      parseWakeBridgeInput({
        type: "daily_wake",
        severity: "high",
        goal: "Wake Dawson.",
        success_condition: "Explicit awake confirmation.",
        max_duration_seconds: 181,
      }),
    ).toBeNull();

    const now = new Date().toISOString();
    const result = publicWakeBridge({
      voiceSession: {
        id: "wake-1",
        idempotencyKey: "request-wake",
        status: "completed",
        maxDurationSeconds: 45,
        telnyxConversationId: "conversation-1",
        telnyxCallControlId: "v3:test",
        telnyxCallSessionId: "call-session-1",
        error: null,
        createdAt: now,
        updatedAt: now,
        expiresAt: now,
        retainUntil: now,
      },
      title: "Wake Dawson",
      items: [],
      actions: [
        {
          id: "action-1",
          type: "note",
          content: "Dawson explicitly confirmed: I am awake and getting up.",
          status: "approved",
          createdAt: now,
        },
      ],
      notes: [],
      completedAt: now,
    });
    expect(result.status).toBe("awake_confirmed");
    expect(result.next_recommended_action).toBe("stop");
  });

  test("MCP resolves a briefing from Telnyx-controlled conversation metadata", async () => {
    const { session } = await createVoiceSession(db, 300, "request-briefing");
    const items: BriefingItem[] = [
      { id: "meeting-1", kind: "calendar", title: "Team meeting", summary: "Starts at 10 AM." },
    ];
    await createBriefingSession(db, session.id, "Morning briefing", items);
    await updateVoiceSession(db, session.id, {
      status: "in_progress",
      telnyxConversationId: "conversation-1",
    });

    const call = async (name: string, args: Record<string, unknown> = {}) =>
      mcpRoute({
        request: new Request("https://example.com/api/telnyx/mcp", {
          method: "POST",
          headers: {
            Authorization: "Bearer tool-secret",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: crypto.randomUUID(),
            method: "tools/call",
            params: {
              name,
              arguments: args,
              _meta: { telnyx_conversation_id: "conversation-1" },
            },
          }),
        }),
        locals: { runtime: { env: { VOICE_DB: db, TELNYX_AI_TOOL_TOKEN: "tool-secret" } } },
      } as never);

    expect(JSON.stringify(await (await call("get_briefing")).json())).toContain("Team meeting");
    await call("record_action", {
      item_id: "meeting-1",
      type: "create_reminder",
      content: "Remind me at 9:45 AM.",
      status: "approved",
    });
    const storedSession = (await getVoiceSession(db, session.id))!;
    expect((await getBriefingSession(db, storedSession))?.actions[0]?.status).toBe("approved");
  });
});
