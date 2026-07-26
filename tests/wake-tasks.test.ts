import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Miniflare } from "miniflare";
import { hasBearerToken } from "../src/lib/internal-auth";
import {
  createBriefingSession,
  getBriefingSession,
  type BriefingItem,
} from "../src/lib/briefing-sessions";
import { POST as createWakeTaskRoute } from "../src/pages/api/internal/wake-tasks/index";
import { POST as createBriefingRoute } from "../src/pages/api/internal/briefing-sessions/index";
import { POST as reportWakeStatusRoute } from "../src/pages/api/telnyx/ai-tools/report-wake-status";
import { POST as mcpRoute } from "../src/pages/api/telnyx/mcp";
import {
  classifyConversationMessages,
  createWakeTask,
  getWakeTask,
  hasExplicitWakeConfirmation,
  publicWakeTask,
  recordWakeTaskEvent,
  updateWakeTask,
} from "../src/lib/wake-tasks";

let miniflare: Miniflare;
let db: D1Database;

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    d1Databases: { WAKE_DB: "wake-tests" },
  });
  db = await miniflare.getD1Database("WAKE_DB");
  await db.exec(
    (await Bun.file("migrations/0001_wake_tasks.sql").text()).replace(/\s*\n\s*/g, " "),
  );
  await db.exec(
    (await Bun.file("migrations/0002_briefing_sessions.sql").text()).replace(/\s*\n\s*/g, " "),
  );
});

afterAll(async () => {
  await miniflare.dispose();
});

describe("wake task bridge", () => {
  test("requires an exact bearer token without query-string fallback", async () => {
    const expected = "internal-secret";
    expect(
      await hasBearerToken(
        new Request("https://example.com", {
          headers: { Authorization: "Bearer internal-secret" },
        }),
        expected,
      ),
    ).toBe(true);
    expect(
      await hasBearerToken(new Request("https://example.com?token=internal-secret"), expected),
    ).toBe(false);
  });

  test("internal endpoint rejects missing auth and arbitrary destinations", async () => {
    const unauthorized = await createWakeTaskRoute({
      request: new Request("https://example.com/api/internal/wake-tasks", { method: "POST" }),
      locals: { runtime: { env: { WAKE_DB: db, HERMES_INTERNAL_WAKE_TOKEN: "secret" } } },
    } as never);
    expect(unauthorized.status).toBe(401);

    const request = new Request("https://example.com/api/internal/wake-tasks", {
      method: "POST",
      headers: {
        Authorization: "Bearer secret",
        "Idempotency-Key": crypto.randomUUID(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "daily_wake",
        severity: "high",
        goal: "Wake Dawson.",
        success_condition: "Explicit wake confirmation.",
        to: "+13135550199",
      }),
    });
    const response = await createWakeTaskRoute({
      request,
      locals: { runtime: { env: { WAKE_DB: db, HERMES_INTERNAL_WAKE_TOKEN: "secret" } } },
    } as never);
    expect(response.status).toBe(400);

    const briefingResponse = await createBriefingRoute({
      request: new Request("https://example.com/api/internal/briefing-sessions", {
        method: "POST",
        headers: {
          Authorization: "Bearer secret",
          "Idempotency-Key": crypto.randomUUID(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "Morning", items: [], to: "+13135550199" }),
      }),
      locals: { runtime: { env: { WAKE_DB: db, HERMES_INTERNAL_WAKE_TOKEN: "secret" } } },
    } as never);
    expect(briefingResponse.status).toBe(400);
  });

  test("creates durable idempotent task state and records events once", async () => {
    const input = {
      type: "meeting_wake" as const,
      severity: "high" as const,
      goal: "Wake Dawson for a meeting.",
      successCondition: "Dawson explicitly confirms he is awake and getting up.",
      maxDurationSeconds: 120,
    };
    const first = await createWakeTask(db, input, "request-1", new Date("2026-07-26T12:00:00Z"));
    const duplicate = await createWakeTask(
      db,
      input,
      "request-1",
      new Date("2026-07-26T12:01:00Z"),
    );
    expect(first.created).toBe(true);
    expect(duplicate.created).toBe(false);
    expect(duplicate.task.id).toBe(first.task.id);

    const updated = await updateWakeTask(db, first.task.id, {
      status: "calling",
      telnyxCallControlId: "v3:test",
    });
    expect(updated?.status).toBe("calling");
    expect(updated?.telnyxCallControlId).toBe("v3:test");
    expect(await recordWakeTaskEvent(db, first.task.id, "event-1", "call.initiated", "now")).toBe(
      true,
    );
    expect(await recordWakeTaskEvent(db, first.task.id, "event-1", "call.initiated", "now")).toBe(
      false,
    );
    expect((await getWakeTask(db, first.task.id))?.id).toBe(first.task.id);
    expect(publicWakeTask(updated!).next_recommended_action).toBe("wait");
  });

  test("requires explicit awake and getting-up evidence", () => {
    expect(hasExplicitWakeConfirmation("I am awake and getting up.")).toBe(true);
    expect(hasExplicitWakeConfirmation("Yeah, sure.")).toBe(false);
    expect(hasExplicitWakeConfirmation("I am awake.")).toBe(false);

    expect(
      classifyConversationMessages([
        { role: "assistant", content: "Are you awake?" },
        { role: "user", content: "I am awake and getting up now." },
      ]),
    ).toMatchObject({ result: "awake_confirmed", confidence: 0.98 });
    expect(
      classifyConversationMessages([{ role: "user", content: "Five more minutes." }]),
    ).toMatchObject({ result: "not_confirmed" });
    expect(classifyConversationMessages([])).toMatchObject({ result: "unclear" });
  });

  test("tool callback verifies call correlation and conservative evidence", async () => {
    const created = await createWakeTask(
      db,
      {
        type: "daily_wake",
        severity: "high",
        goal: "Wake Dawson.",
        successCondition: "Explicit confirmation.",
        maxDurationSeconds: 120,
      },
      "request-tool",
    );
    await updateWakeTask(db, created.task.id, {
      status: "in_progress",
      telnyxCallControlId: "v3:tool-test",
    });
    const request = new Request("https://example.com/api/telnyx/ai-tools/report-wake-status", {
      method: "POST",
      headers: {
        Authorization: "Bearer tool-secret",
        "x-telnyx-call-control-id": "v3:tool-test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        task_id: created.task.id,
        status: "awake_confirmed",
        confidence: 0.99,
        summary: "Dawson gave a vague response.",
        evidence: "Yeah, sure.",
      }),
    });
    const response = await reportWakeStatusRoute({
      request,
      locals: { runtime: { env: { WAKE_DB: db, TELNYX_AI_TOOL_TOKEN: "tool-secret" } } },
    } as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: "unclear" });
    expect((await getWakeTask(db, created.task.id))?.status).toBe("not_confirmed");
  });

  test("MCP resolves a briefing from Telnyx-controlled conversation metadata", async () => {
    const created = await createWakeTask(
      db,
      {
        type: "daily_wake",
        severity: "low",
        goal: "Morning briefing.",
        successCondition: "Capture actions.",
        maxDurationSeconds: 300,
      },
      "request-briefing",
    );
    const items: BriefingItem[] = [
      {
        id: "meeting-1",
        kind: "calendar",
        title: "Team meeting",
        summary: "Starts at 10 AM.",
      },
    ];
    await createBriefingSession(db, created.task.id, "Morning briefing", items);
    await updateWakeTask(db, created.task.id, {
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
        locals: { runtime: { env: { WAKE_DB: db, TELNYX_AI_TOOL_TOKEN: "tool-secret" } } },
      } as never);

    const briefing = await call("get_briefing");
    expect(JSON.stringify(await briefing.json())).toContain("Team meeting");

    await call("record_action", {
      item_id: "meeting-1",
      type: "create_reminder",
      content: "Remind me at 9:45 AM.",
      status: "approved",
    });
    const session = await getBriefingSession(db, (await getWakeTask(db, created.task.id))!);
    expect(session?.actions).toHaveLength(1);
    expect(session?.actions[0]?.status).toBe("approved");
  });
});
