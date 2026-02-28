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
  dimensions: { clientCountryName: string };
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

/** List all zone IDs for an account */
async function listZones(
  token: string,
  accountId: string,
): Promise<string[]> {
  const zones: string[] = [];
  let page = 1;
  while (true) {
    const res = await fetch(
      `${CF_API}/zones?account.id=${accountId}&per_page=50&page=${page}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
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

  if (!res.ok) return [];

  const json = (await res.json()) as {
    data?: {
      viewer: {
        zones: { httpRequestsAdaptiveGroups: GqlGroup[] }[];
      };
    };
    errors?: { message: string }[];
  };

  if (json.errors?.length) return [];
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
  let total = 0;

  for (const g of allGroups) {
    total += g.count;
    const cc = g.dimensions.clientCountryName;
    countryMap.set(cc, (countryMap.get(cc) ?? 0) + g.count);
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
  // Filter out countries with <1000 requests for privacy
  const filtered = countries.filter((c) => c.requests >= 1000);
  filtered.sort((a, b) => b.requests - a.requests);

  const colos: TrafficColo[] = [];
  for (const [code, requests] of coloMap) {
    const coords = COLO_COORDS[code];
    if (coords) {
      colos.push({ code, lat: coords[0], lng: coords[1], requests });
    }
  }
  colos.sort((a, b) => b.requests - a.requests);

  return { countries: filtered, colos, total };
}

export async function refreshTrafficData(
  env: Bindings,
): Promise<TrafficData> {
  const token = env.CF_ANALYTICS_TOKEN;
  if (!token) {
    return { updatedAt: new Date().toISOString(), totalRequests: 0, windowHours: 24, topCountries: [], edgeColos: [] };
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
  const zonesByAccount = await Promise.all(
    accounts.map((a) => listZones(a.token, a.accountId)),
  );

  // Build flat list of { token, zoneId } pairs
  const queries: { token: string; zoneId: string }[] = [];
  for (let i = 0; i < accounts.length; i++) {
    for (const zoneId of zonesByAccount[i]!) {
      queries.push({ token: accounts[i]!.token, zoneId });
    }
  }

  // Query all zones in parallel (batched to avoid overwhelming)
  const results = await Promise.all(
    queries.map((q) => queryZone(q.token, q.zoneId, since, until)),
  );

  const allGroups = results.flat();
  const { countries, colos, total } = aggregateGroups(allGroups);

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

export async function fetchTrafficData(
  env: Bindings,
): Promise<TrafficData> {
  const cached = await env.CACHE.get(CACHE_KEY);
  if (cached) return JSON.parse(cached) as TrafficData;
  return refreshTrafficData(env);
}
