import type { APIRoute } from "astro";
import { fetchTrafficData } from "@/lib/network.ts";
import type { Bindings } from "@/lib/types.ts";

export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env as Bindings;

  try {
    const data = await fetchTrafficData(env);
    return Response.json(data, {
      headers: { "Cache-Control": "public, max-age=300" },
    });
  } catch (e) {
    console.error("Failed to fetch traffic data:", e);
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
};
