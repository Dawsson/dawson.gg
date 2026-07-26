import type { APIRoute } from "astro";
import type { Bindings } from "@/lib/types.ts";
import { completeWhoopAuthorization } from "@/lib/whoop-oauth.ts";

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return new Response("Missing WHOOP callback parameters", { status: 400 });
  try {
    await completeWhoopAuthorization(
      locals.runtime.env.CACHE,
      locals.runtime.env as Bindings,
      code,
      state,
    );
    return new Response(
      "<!doctype html><title>WHOOP connected</title><h1>WHOOP connected to Hermes.</h1><p>You can close this window.</p>",
      { headers: { "content-type": "text/html; charset=utf-8" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "WHOOP authorization failed";
    console.error("WHOOP OAuth callback failed", { message });
    return new Response("WHOOP authorization failed", { status: 400 });
  }
};
