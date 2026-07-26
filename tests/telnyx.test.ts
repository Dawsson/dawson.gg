import { describe, expect, test } from "bun:test";
import {
  initiateWakeUpCall,
  initiateWakeTaskCall,
  parseTelnyxCallEvent,
  speakWakeUpMessage,
  startWakeAssistant,
  verifyTelnyxWebhook,
  WAKE_UP_MESSAGE,
} from "../src/lib/telnyx";

describe("Telnyx webhooks", () => {
  test("verifies a current Ed25519 signature over the raw body", async () => {
    const keyPair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
    const rawBody = '{"data":{"id":"event-1","event_type":"call.answered","payload":{}}}';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signedPayload = new TextEncoder().encode(`${timestamp}|${rawBody}`);
    const signature = await crypto.subtle.sign("Ed25519", keyPair.privateKey, signedPayload);
    const publicKey = await crypto.subtle.exportKey("raw", keyPair.publicKey);

    expect(
      await verifyTelnyxWebhook(
        rawBody,
        Buffer.from(signature).toString("base64"),
        timestamp,
        Buffer.from(publicKey).toString("base64"),
      ),
    ).toBe(true);
  });

  test("rejects stale signatures", async () => {
    expect(
      await verifyTelnyxWebhook(
        "{}",
        "not-a-signature",
        String(Math.floor(Date.now() / 1000) - 301),
        "not-a-key",
      ),
    ).toBe(false);
  });

  test("parses Call Control events and rejects malformed payloads", () => {
    expect(
      parseTelnyxCallEvent(
        '{"data":{"id":"event-1","event_type":"call.initiated","payload":{"call_control_id":"v3:test"}}}',
      )?.data.event_type,
    ).toBe("call.initiated");
    expect(parseTelnyxCallEvent('{"data":{}}')).toBeNull();
  });

  test("sends the wake-up message with an idempotent speak command", async () => {
    let request: Request | undefined;
    const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
      request = new Request(input, init);
      return Response.json({ data: { result: "ok" } });
    };

    await speakWakeUpMessage("v3:call/id", "event-1", "secret", fetcher);

    expect(request?.url).toEndWith("/calls/v3%3Acall%2Fid/actions/speak");
    expect(request?.headers.get("Authorization")).toBe("Bearer secret");
    expect(await request?.json()).toEqual({
      payload: WAKE_UP_MESSAGE,
      voice: "AWS.Polly.Joanna-Neural",
      language: "en-US",
      command_id: "event-1",
    });
  });

  test("originates a call only when all internal configuration is present", async () => {
    let body: unknown;
    const fetcher = async (_input: string | URL | Request, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return Response.json({ data: { call_control_id: "v3:test" } });
    };

    await initiateWakeUpCall(
      {
        TELNYX_API_KEY: "secret",
        TELNYX_CONNECTION_ID: "app-id",
        TELNYX_FROM_NUMBER: "+13135550100",
        WAKEUP_TO_NUMBER: "+13135550101",
      },
      fetcher,
    );

    expect(body).toMatchObject({
      connection_id: "app-id",
      from: "+13135550100",
      to: "+13135550101",
    });
    expect(() => initiateWakeUpCall({}, fetcher)).toThrow("Missing required Telnyx configuration");
  });

  test("originates a correlated wake task and starts the configured assistant", async () => {
    const requests: Request[] = [];
    const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.url.endsWith("/calls")) {
        return Response.json({
          data: { call_control_id: "v3:test", call_session_id: "session-1" },
        });
      }
      return Response.json({ data: { result: "ok", conversation_id: "conversation-1" } });
    };
    const env = {
      TELNYX_API_KEY: "secret",
      TELNYX_CONNECTION_ID: "app-id",
      TELNYX_FROM_NUMBER: "+13135550100",
      WAKEUP_TO_NUMBER: "+13135550101",
      TELNYX_AI_ASSISTANT_ID: "assistant-1",
    };
    const task = {
      id: "task-1",
      maxDurationSeconds: 120,
      goal: "Wake Dawson.",
      successCondition: "Explicit confirmation.",
      expiresAt: "2026-07-26T12:02:00Z",
    };

    expect(await initiateWakeTaskCall(env, task, fetcher)).toEqual({
      callControlId: "v3:test",
      callSessionId: "session-1",
    });
    const dialBody = await requests[0].json();
    expect(dialBody).toMatchObject({
      to: "+13135550101",
      command_id: "task-1",
      time_limit_secs: 120,
      preferred_codecs: "AMR-WB,OPUS,G722,PCMU,PCMA",
    });
    expect(dialBody.client_state).toBeString();

    expect(await startWakeAssistant("v3:test", env, fetcher)).toBe("conversation-1");
    const assistantBody = await requests[1].json();
    expect(assistantBody).toEqual({
      assistant: { id: "assistant-1" },
    });
  });

  test("includes sanitized Telnyx validation details without response bodies", async () => {
    const fetcher = async () =>
      Response.json(
        {
          errors: [
            {
              code: "10015",
              title: "Bad Request",
              detail: "assistant is invalid",
            },
          ],
          secret: "must-not-leak",
        },
        { status: 422 },
      );

    await expect(
      startWakeAssistant(
        "v3:test",
        { TELNYX_API_KEY: "secret", TELNYX_AI_ASSISTANT_ID: "assistant-1" },
        fetcher,
      ),
    ).rejects.toThrow(
      "Telnyx API request failed with status 422: 10015: Bad Request: assistant is invalid",
    );
  });
});
