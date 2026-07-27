import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { Miniflare } from "miniflare";
import { buildWhoopLatest } from "../src/lib/whoop-latest";
import { getWhoopSnapshot, storeWhoopTokens } from "../src/lib/whoop-oauth";
import { GET as latestRoute } from "../src/pages/api/internal/whoop/latest";

const env = {
  WHOOP_CLIENT_ID: "client-id",
  WHOOP_CLIENT_SECRET: "client-secret",
  HERMES_INTERNAL_TOKEN: "internal-secret",
};

const snapshotResponses = {
  profile: { user_id: 27892443, email: "hello@dawson.gg" },
  recovery: {
    records: [
      {
        updated_at: "2026-07-26T12:00:00Z",
        score: {
          recovery_score: 81,
          resting_heart_rate: 53,
          hrv_rmssd_milli: 72.5,
          spo2_percentage: 98,
          skin_temp_celsius: 34,
        },
      },
    ],
  },
  sleeps: {
    records: [
      {
        id: "sleep-1",
        start: "2026-07-26T04:00:00Z",
        end: "2026-07-26T12:00:00Z",
        timezone_offset: "-04:00",
        score_state: "SCORED",
        nap: false,
        score: {
          sleep_performance_percentage: 84,
          sleep_consistency_percentage: 77,
          sleep_efficiency_percentage: 92,
          stage_summary: { total_in_bed_time_milli: 28_800_000 },
        },
      },
    ],
  },
  cycles: {
    records: [
      {
        id: 123,
        start: "2026-07-26T12:00:00Z",
        updated_at: "2026-07-26T18:00:00Z",
        score: {
          strain: 8.2,
          kilojoule: 3200,
          average_heart_rate: 74,
          max_heart_rate: 148,
        },
      },
    ],
  },
  workouts: {
    records: [
      {
        sport_name: "running",
        start: "2026-07-26T15:00:00Z",
        end: "2026-07-26T15:45:00Z",
        score: {
          strain: 10.1,
          average_heart_rate: 138,
          max_heart_rate: 171,
          zone_durations: { zone_five_milli: 120_000 },
        },
      },
    ],
  },
  body: { height_meter: 1.8 },
};

function json(value: unknown, status = 200) {
  return Response.json(value, { status });
}

function whoopApiResponse(url: string) {
  if (url.includes("/user/profile/basic")) return json(snapshotResponses.profile);
  if (url.includes("/recovery")) return json(snapshotResponses.recovery);
  if (url.includes("/activity/sleep")) return json(snapshotResponses.sleeps);
  if (url.includes("/cycle")) return json(snapshotResponses.cycles);
  if (url.includes("/activity/workout")) return json(snapshotResponses.workouts);
  if (url.includes("/user/measurement/body")) return json(snapshotResponses.body);
  return json({ error: "unexpected URL" }, 500);
}

let miniflare: Miniflare;
let cache: KVNamespace;
const originalFetch = globalThis.fetch;

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    kvNamespaces: ["CACHE"],
  });
  cache = await miniflare.getKVNamespace("CACHE");
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  const listed = await cache.list();
  await Promise.all(listed.keys.map(({ name }) => cache.delete(name)));
});

afterAll(async () => {
  globalThis.fetch = originalFetch;
  await miniflare.dispose();
});

describe("WHOOP OAuth refresh", () => {
  test("refreshes near expiry and persists a rotated refresh token encrypted", async () => {
    await storeWhoopTokens(
      cache,
      {
        access_token: "old-access-token",
        refresh_token: "old-refresh-token",
        expires_in: 1,
      },
      env,
    );
    let refreshRequests = 0;
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      if (url.endsWith("/oauth/oauth2/token")) {
        refreshRequests += 1;
        const form = new URLSearchParams(String(init?.body));
        expect(form.get("grant_type")).toBe("refresh_token");
        expect(form.get("refresh_token")).toBe("old-refresh-token");
        expect(form.get("scope")).toBe("offline");
        return json({
          access_token: "new-access-token",
          refresh_token: "rotated-refresh-token",
          expires_in: 3600,
          scope: "offline read:recovery",
        });
      }
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer new-access-token");
      return whoopApiResponse(url);
    }) as typeof fetch;

    expect(await getWhoopSnapshot(cache, env)).not.toBeNull();
    expect(refreshRequests).toBe(1);
    const encrypted = await cache.get("whoop:oauth:tokens");
    expect(encrypted).not.toContain("new-access-token");
    expect(encrypted).not.toContain("rotated-refresh-token");

    await getWhoopSnapshot(cache, env);
    expect(refreshRequests).toBe(1);
  });

  test("forces one refresh and retries once after a WHOOP 401", async () => {
    await storeWhoopTokens(
      cache,
      {
        access_token: "rejected-access-token",
        refresh_token: "refresh-token",
        expires_in: 3600,
      },
      env,
    );
    let rejected = false;
    let refreshRequests = 0;
    let refreshedApiRequests = 0;
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      if (url.endsWith("/oauth/oauth2/token")) {
        refreshRequests += 1;
        return json({ access_token: "fresh-access-token", expires_in: 3600 });
      }
      const authorization = new Headers(init?.headers).get("Authorization");
      if (authorization === "Bearer rejected-access-token" && !rejected) {
        rejected = true;
        return json({ error: "unauthorized" }, 401);
      }
      if (authorization === "Bearer fresh-access-token") refreshedApiRequests += 1;
      return whoopApiResponse(url);
    }) as typeof fetch;

    expect(await getWhoopSnapshot(cache, env)).not.toBeNull();
    expect(refreshRequests).toBe(1);
    expect(refreshedApiRequests).toBe(6);
  });
});

describe("WHOOP latest endpoint", () => {
  test("builds the compact aggregate shape", () => {
    const latest = buildWhoopLatest({ ...snapshotResponses, fetched_at: "2026-07-26T19:00:00Z" }, [
      { type: "sleep.updated", resource_id: "sleep-1", received_at: "now" },
    ]);
    expect(latest.current_cycle).toEqual({
      id: 123,
      start: "2026-07-26T12:00:00Z",
      updated_at: "2026-07-26T18:00:00Z",
      strain: 8.2,
      kilojoule: 3200,
      average_heart_rate: 74,
      max_heart_rate: 148,
    });
    expect(latest.latest_sleep?.sleep_performance_percentage).toBe(84);
    expect(latest.latest_recovery?.rhr).toBe(53);
    expect(latest.latest_workout?.zone_durations).toEqual({ zone_five_milli: 120_000 });
  });

  test("rejects missing auth", async () => {
    const response = await latestRoute({
      request: new Request("https://example.com/api/internal/whoop/latest"),
      locals: { runtime: { env: { CACHE: cache, HERMES_INTERNAL_TOKEN: "internal-secret" } } },
    } as never);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  test("returns compact stats without OAuth tokens or client secrets", async () => {
    await storeWhoopTokens(
      cache,
      {
        access_token: "private-access-token",
        refresh_token: "private-refresh-token",
        expires_in: 3600,
      },
      env,
    );
    globalThis.fetch = (async (input, init) => {
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer private-access-token");
      return whoopApiResponse(String(input));
    }) as typeof fetch;

    const response = await latestRoute({
      request: new Request("https://example.com/api/internal/whoop/latest", {
        headers: { Authorization: "Bearer internal-secret" },
      }),
      locals: { runtime: { env: { CACHE: cache, ...env } } },
    } as never);
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(JSON.parse(body).stats_available).toBe(true);
    expect(body).not.toContain("private-access-token");
    expect(body).not.toContain("private-refresh-token");
    expect(body).not.toContain("client-secret");
  });
});
