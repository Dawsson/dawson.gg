import type { Bindings } from "./types.ts";

export type ContribCell = {
  date: string;
  level: number;
  week: number;
  day: number;
};
export type ContribData = { total: number; cells: ContribCell[] };

const CACHE_KEY = "github:contributions:v4";
const TTL = 21600; // 6 hours

async function fetchFromGitHub(): Promise<ContribData> {
  const res = await fetch("https://github.com/users/Dawsson/contributions", {
    headers: { "User-Agent": "vault-site" },
  });
  const html = await res.text();

  const totalMatch = html.match(
    /([\d,]+)\s+contributions?\s+in\s+the\s+last\s+year/i,
  );
  const total = totalMatch ? parseInt(totalMatch[1]!.replace(/,/g, "")) : 0;

  const cells: ContribCell[] = [];
  const re =
    /data-ix="(\d+)"[^>]*data-date="(\d{4}-\d{2}-\d{2})"[^>]*id="contribution-day-component-(\d+)-\d+"[^>]*data-level="(\d)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    cells.push({
      date: m[2]!,
      level: parseInt(m[4]!),
      week: parseInt(m[1]!),
      day: parseInt(m[3]!),
    });
  }

  return { total, cells };
}

export async function fetchContributions(
  env: Bindings,
): Promise<ContribData> {
  const cached = await env.CACHE.get(CACHE_KEY);
  if (cached) return JSON.parse(cached) as ContribData;
  return refreshContributions(env);
}

/** Force-refresh contributions data into KV cache. Called by cron and as fallback. */
export async function refreshContributions(
  env: Bindings,
): Promise<ContribData> {
  const data = await fetchFromGitHub();
  await env.CACHE.put(CACHE_KEY, JSON.stringify(data), {
    expirationTtl: TTL,
  });
  return data;
}
