import type { Bindings } from "./types.ts";
import { COLO_COORDS, COUNTRY_COORDS } from "./coords.ts";

const CACHE_KEY = "network:traffic:v1";
const TTL = 600; // 10 minutes
const CF_GQL = "https://api.cloudflare.com/client/v4/graphql";

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
  dimensions: { clientCountryName: string; coloCode: string };
  count: number;
}

const QUERY = `
query TrafficByCountryAndColo($zoneTag: string!, $since: Time!, $until: Time!) {
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
          coloCode
        }
      }
    }
  }
}
`;

async function queryAccount(
  token: string,
  zoneTag: string,
): Promise<GqlGroup[]> {
  const now = new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const res = await fetch(CF_GQL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: QUERY,
      variables: {
        zoneTag,
        since: since.toISOString(),
        until: now.toISOString(),
      },
    }),
  });

  if (!res.ok) {
    console.error(`CF GraphQL error for zone ${zoneTag}: ${res.status}`);
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
    console.error("CF GraphQL errors:", json.errors);
    return [];
  }

  return json.data?.viewer.zones[0]?.httpRequestsAdaptiveGroups ?? [];
}

function mergeGroups(allGroups: GqlGroup[]): {
  countries: TrafficCountry[];
  colos: TrafficColo[];
  total: number;
} {
  const countryMap = new Map<string, number>();
  const coloMap = new Map<string, number>();
  let total = 0;

  for (const g of allGroups) {
    total += g.count;
    const cc = g.dimensions.clientCountryName;
    const colo = g.dimensions.coloCode;
    countryMap.set(cc, (countryMap.get(cc) ?? 0) + g.count);
    coloMap.set(colo, (coloMap.get(colo) ?? 0) + g.count);
  }

  const countries: TrafficCountry[] = [];
  for (const [code, requests] of countryMap) {
    const coords = COUNTRY_COORDS[code];
    if (coords) {
      countries.push({ code, lat: coords[0], lng: coords[1], requests });
    }
  }
  countries.sort((a, b) => b.requests - a.requests);

  const colos: TrafficColo[] = [];
  for (const [code, requests] of coloMap) {
    const coords = COLO_COORDS[code];
    if (coords) {
      colos.push({ code, lat: coords[0], lng: coords[1], requests });
    }
  }
  colos.sort((a, b) => b.requests - a.requests);

  return { countries, colos, total };
}

export async function refreshTrafficData(
  env: Bindings,
): Promise<TrafficData> {
  const accounts = [
    { token: env.CF_TOKEN_DAWSON, zone: env.CF_ZONE_DAWSON },
    { token: env.CF_TOKEN_FLYTE, zone: env.CF_ZONE_FLYTE },
    { token: env.CF_TOKEN_WIP, zone: env.CF_ZONE_WIP },
  ].filter((a) => a.token && a.zone);

  const results = await Promise.all(
    accounts.map((a) => queryAccount(a.token, a.zone)),
  );

  const allGroups = results.flat();
  const { countries, colos, total } = mergeGroups(allGroups);

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
