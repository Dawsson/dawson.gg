import { createHmac } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { parseWhoopWebhook, verifyWhoopWebhook } from "../src/lib/whoop";

const event = {
  user_id: 10129,
  id: "550e8400-e29b-41d4-a716-446655440000",
  type: "sleep.updated",
  trace_id: "e369c784-5100-49e8-8098-75d35c47b31b",
};

describe("WHOOP webhook", () => {
  test("verifies WHOOP's timestamp-prefixed HMAC signature", async () => {
    const body = JSON.stringify(event);
    const timestamp = String(Date.now());
    const signature = createHmac("sha256", "client-secret")
      .update(timestamp + body)
      .digest("base64");

    expect(await verifyWhoopWebhook(body, signature, timestamp, "client-secret")).toBe(true);
  });

  test("rejects stale signatures", async () => {
    const body = JSON.stringify(event);
    const timestamp = String(Date.now() - 5 * 60 * 1000 - 1);
    const signature = createHmac("sha256", "client-secret")
      .update(timestamp + body)
      .digest("base64");

    expect(await verifyWhoopWebhook(body, signature, timestamp, "client-secret")).toBe(false);
  });

  test("parses V2 events", () => {
    expect(parseWhoopWebhook(JSON.stringify(event))).toEqual({
      userId: "10129",
      resourceId: event.id,
      type: "sleep.updated",
      traceId: event.trace_id,
    });
  });

  test("rejects unsupported event types and V1 resource IDs", () => {
    expect(parseWhoopWebhook(JSON.stringify({ ...event, type: "cycle.updated" }))).toBeNull();
    expect(parseWhoopWebhook(JSON.stringify({ ...event, id: 10235 }))).toBeNull();
  });
});
