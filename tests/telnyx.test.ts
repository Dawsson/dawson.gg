import { describe, expect, test } from "bun:test";
import {
  hangupCall,
  initiateVoiceSessionCall,
  isHumanAnsweringMachineResult,
  parseTelnyxCallEvent,
  startVoiceAssistant,
  verifyTelnyxWebhook,
} from "../src/lib/telnyx";

describe("Telnyx voice integration", () => {
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

  test("originates a correlated fixed-destination session and starts the assistant", async () => {
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
      HERMES_TO_NUMBER: "+13135550101",
      TELNYX_AI_ASSISTANT_ID: "assistant-1",
    };
    const session = { id: "session-1", maxDurationSeconds: 300 };

    expect(await initiateVoiceSessionCall(env, session, fetcher)).toEqual({
      callControlId: "v3:test",
      callSessionId: "session-1",
    });
    expect(await requests[0].json()).toMatchObject({
      to: "+13135550101",
      command_id: "session-1",
      timeout_secs: 20,
      time_limit_secs: 300,
      answering_machine_detection: "detect",
    });

    expect(await startVoiceAssistant("v3:test", env, fetcher)).toBe("conversation-1");
    expect(await requests[1].json()).toEqual({ assistant: { id: "assistant-1" } });
  });

  test("classifies AMD results and sends an idempotent hangup command", async () => {
    expect(isHumanAnsweringMachineResult("human")).toBe(true);
    expect(isHumanAnsweringMachineResult("not_sure")).toBe(true);
    expect(isHumanAnsweringMachineResult("machine")).toBe(false);
    expect(isHumanAnsweringMachineResult("silence")).toBe(false);

    let request: Request | undefined;
    await hangupCall("v3:test", "event-1-machine-hangup", "secret", async (input, init) => {
      request = new Request(input, init);
      return Response.json({ data: { result: "ok" } });
    });
    expect(request?.url).toEndWith("/calls/v3%3Atest/actions/hangup");
    expect(await request?.json()).toEqual({ command_id: "event-1-machine-hangup" });
  });

  test("includes sanitized Telnyx validation details without response bodies", async () => {
    const fetcher = async () =>
      Response.json(
        {
          errors: [{ code: "10015", title: "Bad Request", detail: "assistant is invalid" }],
          secret: "must-not-leak",
        },
        { status: 422 },
      );

    await expect(
      startVoiceAssistant(
        "v3:test",
        { TELNYX_API_KEY: "secret", TELNYX_AI_ASSISTANT_ID: "assistant-1" },
        fetcher,
      ),
    ).rejects.toThrow(
      "Telnyx API request failed with status 422: 10015: Bad Request: assistant is invalid",
    );
  });
});
