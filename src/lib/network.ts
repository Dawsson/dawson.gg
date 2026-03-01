import type { Bindings } from "./types.ts";
import { COLO_COORDS, COUNTRY_COORDS } from "./coords.ts";

const CACHE_KEY = "network:traffic:v1";
const TTL = 600; // 10 minutes
const CF_GQL = "https://api.cloudflare.com/client/v4/graphql";
const CF_API = "https://api.cloudflare.com/client/v4";

export interface TrafficCountry {
  code: string;
  lat: number;
  lng: number;
  requests: number;
}

export interface TrafficColo {
  code: string;
  lat: number;
  lng: number;
  requests: number;
}

export interface TrafficData {
  updatedAt: string;
  totalRequests: number;
  windowHours: number;
  topCountries: TrafficCountry[];
  edgeColos: TrafficColo[];
}

interface GqlGroup {
  dimensions: { clientCountryName?: string };
  count: number;
}

const QUERY = `
query TrafficByCountry($zoneTag: string!, $since: Time!, $until: Time!) {
  viewer {
    zones(filter: { zoneTag: $zoneTag }) {
      httpRequestsAdaptiveGroups(
        filter: { datetime_geq: $since, datetime_leq: $until }
        limit: 2000
        orderBy: [count_DESC]
      ) {
        count
        dimensions {
          clientCountryName
        }
      }
    }
  }
}
`;

const COUNTRY_NAME_ALIASES: Record<string, string> = {
  "UNITED STATES": "US",
  "UNITED STATES OF AMERICA": "US",
  "UNITED KINGDOM": "GB",
  "GREAT BRITAIN": "GB",
  "SOUTH KOREA": "KR",
  "NORTH KOREA": "KP",
  "RUSSIA": "RU",
  "RUSSIAN FEDERATION": "RU",
  "CZECH REPUBLIC": "CZ",
  "UAE": "AE",
  "HONG KONG SAR": "HK",
};

const DISPLAY_NAME_TO_CODE = buildDisplayNameToCodeMap();

function normalizeCountryName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function buildDisplayNameToCodeMap(): Map<string, string> {
  const map = new Map<string, string>();
  const display = new Intl.DisplayNames(["en"], { type: "region" });
  for (const code of Object.keys(COUNTRY_COORDS)) {
    try {
      const name = display.of(code);
      if (name) map.set(normalizeCountryName(name), code);
    } catch {
      // Ignore invalid region codes for Intl and rely on explicit aliases.
    }
  }
  return map;
}

function resolveCountryCode(dimensions: GqlGroup["dimensions"]): string | null {
  const nameCandidate = dimensions.clientCountryName?.trim();
  if (!nameCandidate) return null;

  const normalized = normalizeCountryName(nameCandidate);

  if (COUNTRY_COORDS[normalized]) return normalized;

  const aliased = COUNTRY_NAME_ALIASES[normalized];
  if (aliased && COUNTRY_COORDS[aliased]) return aliased;

  const fromDisplayName = DISPLAY_NAME_TO_CODE.get(normalized);
  if (fromDisplayName && COUNTRY_COORDS[fromDisplayName]) return fromDisplayName;

  return null;
}

/** List all zone IDs for an account */
async function listZones(token: string, accountId: string): Promise<string[]> {
  const zones: string[] = [];
  let page = 1;
  while (true) {
    const res = await fetch(`${CF_API}/zones?account.id=${accountId}&per_page=50&page=${page}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) break;
    const json = (await res.json()) as {
      result: { id: string }[];
      result_info: { total_pages: number };
    };
    for (const z of json.result) zones.push(z.id);
    if (page >= json.result_info.total_pages) break;
    page++;
  }
  return zones;
}

async function queryZone(
  token: string,
  zoneTag: string,
  since: string,
  until: string,
): Promise<GqlGroup[]> {
  const res = await fetch(CF_GQL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: QUERY,
      variables: { zoneTag, since, until },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[network] zone query http error", {
      zoneTag,
      status: res.status,
      body: body.slice(0, 500),
    });
    return [];
  }

  const json = (await res.json()) as {
    data?: {
      viewer: {
        zones: { httpRequestsAdaptiveGroups: GqlGroup[] }[];
      };
    };
    errors?: { message: string }[];
  };

  if (json.errors?.length) {
    console.error("[network] zone query graphql error", {
      zoneTag,
      errors: json.errors.map((e) => e.message).slice(0, 5),
    });
  }

  return json.data?.viewer.zones[0]?.httpRequestsAdaptiveGroups ?? [];
}

/** Find the nearest colo to a given lat/lng */
function nearestColo(lat: number, lng: number): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const [code, [clat, clng]] of Object.entries(COLO_COORDS)) {
    const dlat = clat - lat;
    const dlng = clng - lng;
    const dist = dlat * dlat + dlng * dlng;
    if (dist < bestDist) {
      bestDist = dist;
      best = code;
    }
  }
  return best;
}

function aggregateGroups(allGroups: GqlGroup[]): {
  countries: TrafficCountry[];
  colos: TrafficColo[];
  total: number;
} {
  const countryMap = new Map<string, number>();
  const unresolvedMap = new Map<string, number>();
  let total = 0;

  for (const g of allGroups) {
    total += g.count;
    const cc = resolveCountryCode(g.dimensions);
    if (cc) {
      countryMap.set(cc, (countryMap.get(cc) ?? 0) + g.count);
      continue;
    }

    const unresolvedKey = g.dimensions.clientCountryName ?? "UNKNOWN";
    unresolvedMap.set(unresolvedKey, (unresolvedMap.get(unresolvedKey) ?? 0) + g.count);
  }

  const countries: TrafficCountry[] = [];
  const coloMap = new Map<string, number>();

  for (const [code, requests] of countryMap) {
    const coords = COUNTRY_COORDS[code];
    if (coords) {
      countries.push({ code, lat: coords[0], lng: coords[1], requests });
      const colo = nearestColo(coords[0], coords[1]);
      if (colo) {
        coloMap.set(colo, (coloMap.get(colo) ?? 0) + requests);
      }
    }
  }

  countries.sort((a, b) => b.requests - a.requests);

  // Include ALL known Cloudflare PoPs as edge locations
  const colos: TrafficColo[] = [];
  for (const [code, coords] of Object.entries(COLO_COORDS)) {
    colos.push({
      code,
      lat: coords[0],
      lng: coords[1],
      requests: coloMap.get(code) ?? 0,
    });
  }
  colos.sort((a, b) => b.requests - a.requests);

  if (unresolvedMap.size > 0) {
    const unresolvedTop = Array.from(unresolvedMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([country, requests]) => ({ country, requests }));
    const unresolvedTotal = Array.from(unresolvedMap.values()).reduce((sum, n) => sum + n, 0);
    console.warn("[network] unresolved country mappings", {
      unresolvedCount: unresolvedMap.size,
      unresolvedRequests: unresolvedTotal,
      unresolvedTop,
    });
  }

  return { countries, colos, total };
}

export async function refreshTrafficData(env: Bindings): Promise<TrafficData> {
  const token = env.CF_ANALYTICS_TOKEN;
  if (!token) {
    return {
      updatedAt: new Date().toISOString(),
      totalRequests: 0,
      windowHours: 24,
      topCountries: [],
      edgeColos: [],
    };
  }

  const accounts = [
    { token, accountId: "3704af15f1156ed64a2150672c74248c" }, // Dawson
    { token, accountId: "5b8b7a9d1dc0cd18a49d3f56d1f8fcfb" }, // Flyte
    { token, accountId: "6b4865dd94efbedc2ea77b73bf89a5e8" }, // WIP
  ];

  const now = new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const until = now.toISOString();

  // List all zones across all accounts
  const zonesByAccount = await Promise.all(accounts.map((a) => listZones(a.token, a.accountId)));

  // Build flat list of { token, zoneId } pairs
  const queries: { token: string; zoneId: string }[] = [];
  for (let i = 0; i < accounts.length; i++) {
    for (const zoneId of zonesByAccount[i]!) {
      queries.push({ token: accounts[i]!.token, zoneId });
    }
  }

  // Query all zones in parallel (batched to avoid overwhelming)
  const results = await Promise.all(queries.map((q) => queryZone(q.token, q.zoneId, since, until)));

  const allGroups = results.flat();
  const { countries, colos, total } = aggregateGroups(allGroups);

  console.info("[network] traffic refresh summary", {
    accounts: accounts.length,
    zonesQueried: queries.length,
    groups: allGroups.length,
    resolvedCountries: countries.length,
    totalRequests: total,
    topCountries: countries.slice(0, 10).map((c) => ({ code: c.code, requests: c.requests })),
  });

  const data: TrafficData = {
    updatedAt: new Date().toISOString(),
    totalRequests: total,
    windowHours: 24,
    topCountries: countries,
    edgeColos: colos,
  };

  await env.CACHE.put(CACHE_KEY, JSON.stringify(data), {
    expirationTtl: TTL,
  });

  return data;
}

export async function fetchTrafficData(env: Bindings): Promise<TrafficData> {
  const cached = await env.CACHE.get(CACHE_KEY);
  if (cached) {
    const parsed = JSON.parse(cached) as TrafficData;

    // Avoid serving a stale "all-zero" snapshot for the full TTL after transient query failures.
    if (parsed.topCountries.length > 0 || parsed.totalRequests > 0) {
      return parsed;
    }

    const ageMs = Date.now() - new Date(parsed.updatedAt).getTime();
    if (ageMs < 60_000) {
      return parsed;
    }
  }

  return refreshTrafficData(env);
}
