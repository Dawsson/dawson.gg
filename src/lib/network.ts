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

/**
 * Large countries get split into regional sub-points so arcs
 * spread across the map instead of converging on one centroid.
 * Each region gets a proportional share of the country's total traffic.
 */
const REGIONAL_SPLITS: Record<string, { code: string; lat: number; lng: number; share: number }[]> = {
  US: [
    { code: "US", lat: 40.71, lng: -74.01, share: 0.28 },   // NYC / East Coast
    { code: "US", lat: 34.05, lng: -118.24, share: 0.22 },  // LA / West Coast
    { code: "US", lat: 41.88, lng: -87.63, share: 0.18 },   // Chicago / Midwest
    { code: "US", lat: 33.75, lng: -84.39, share: 0.16 },   // Atlanta / Southeast
    { code: "US", lat: 32.78, lng: -96.80, share: 0.10 },   // Dallas / South
    { code: "US", lat: 47.61, lng: -122.33, share: 0.06 },  // Seattle / Pacific NW
  ],
  CA: [
    { code: "CA", lat: 43.65, lng: -79.38, share: 0.45 },   // Toronto / Ontario
    { code: "CA", lat: 49.28, lng: -123.12, share: 0.25 },  // Vancouver / BC
    { code: "CA", lat: 45.50, lng: -73.57, share: 0.20 },   // Montreal / Quebec
    { code: "CA", lat: 51.05, lng: -114.07, share: 0.10 },  // Calgary / Alberta
  ],
  RU: [
    { code: "RU", lat: 55.76, lng: 37.62, share: 0.60 },    // Moscow
    { code: "RU", lat: 59.93, lng: 30.32, share: 0.25 },    // St. Petersburg
    { code: "RU", lat: 56.84, lng: 60.60, share: 0.15 },    // Yekaterinburg
  ],
  CN: [
    { code: "CN", lat: 31.23, lng: 121.47, share: 0.35 },   // Shanghai
    { code: "CN", lat: 39.90, lng: 116.40, share: 0.30 },   // Beijing
    { code: "CN", lat: 22.54, lng: 114.06, share: 0.20 },   // Shenzhen
    { code: "CN", lat: 30.57, lng: 104.07, share: 0.15 },   // Chengdu
  ],
  AU: [
    { code: "AU", lat: -33.87, lng: 151.21, share: 0.50 },  // Sydney
    { code: "AU", lat: -37.81, lng: 144.96, share: 0.30 },  // Melbourne
    { code: "AU", lat: -27.47, lng: 153.03, share: 0.20 },  // Brisbane
  ],
  BR: [
    { code: "BR", lat: -23.55, lng: -46.63, share: 0.50 },  // São Paulo
    { code: "BR", lat: -22.91, lng: -43.17, share: 0.30 },  // Rio
    { code: "BR", lat: -15.79, lng: -47.88, share: 0.20 },  // Brasília
  ],
  IN: [
    { code: "IN", lat: 19.08, lng: 72.88, share: 0.35 },    // Mumbai
    { code: "IN", lat: 28.61, lng: 77.21, share: 0.30 },    // Delhi
    { code: "IN", lat: 12.97, lng: 77.59, share: 0.20 },    // Bangalore
    { code: "IN", lat: 22.57, lng: 88.36, share: 0.15 },    // Kolkata
  ],
};

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
    const regions = REGIONAL_SPLITS[code];
    if (regions) {
      // Split into regional sub-points
      for (const region of regions) {
        const regionReqs = Math.round(requests * region.share);
        countries.push({ code: region.code, lat: region.lat, lng: region.lng, requests: regionReqs });
        const colo = nearestColo(region.lat, region.lng);
        if (colo) {
          coloMap.set(colo, (coloMap.get(colo) ?? 0) + regionReqs);
        }
      }
    } else {
      const coords = COUNTRY_COORDS[code];
      if (coords) {
        countries.push({ code, lat: coords[0], lng: coords[1], requests });
        const colo = nearestColo(coords[0], coords[1]);
        if (colo) {
          coloMap.set(colo, (coloMap.get(colo) ?? 0) + requests);
        }
      }
    }
  }

  // Filter out entries with <1000 requests for privacy
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
