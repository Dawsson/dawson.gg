import type { APIRoute } from "astro";
import { hasBearerToken } from "@/lib/internal-auth.ts";
import type { Bindings } from "@/lib/types.ts";
import {
  getWakeTask,
  hasExplicitWakeConfirmation,
  updateWakeTask,
  type WakeResult,
} from "@/lib/wake-tasks.ts";

const TOOL_RESULTS = ["awake_confirmed", "not_confirmed", "unclear"] as const;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as Bindings;
  if (!(await hasBearerToken(request, env.TELNYX_AI_TOOL_TOKEN))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  let input: Record<string, unknown>;
  try {
    input = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const callControlId = request.headers.get("x-telnyx-call-control-id");
  if (
    typeof input.task_id !== "string" ||
    !TOOL_RESULTS.includes(input.status as (typeof TOOL_RESULTS)[number]) ||
    typeof input.confidence !== "number" ||
    input.confidence < 0 ||
    input.confidence > 1 ||
    typeof input.summary !== "string" ||
    input.summary.length > 500 ||
    typeof input.evidence !== "string" ||
    input.evidence.length > 500
  ) {
    return Response.json({ error: "invalid wake status" }, { status: 400 });
  }
  const task = await getWakeTask(env.WAKE_DB, input.task_id);
  if (!task) return Response.json({ error: "task not found" }, { status: 404 });
  if (!callControlId || task.telnyxCallControlId !== callControlId) {
    return Response.json({ error: "call does not match task" }, { status: 403 });
  }

  let result = input.status as WakeResult;
  if (result === "awake_confirmed" && !hasExplicitWakeConfirmation(input.evidence)) {
    result = "unclear";
  }
  const status = result === "awake_confirmed" ? "awake_confirmed" : "not_confirmed";
  await updateWakeTask(env.WAKE_DB, task.id, {
    status,
    result,
    confidence: input.confidence,
    summary: input.summary.slice(0, 500),
    evidence: input.evidence.slice(0, 240),
  });
  return Response.json({ ok: true, status: result });
};
