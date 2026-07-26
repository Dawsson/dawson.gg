import type { APIRoute } from "astro";
import { hasBearerToken } from "@/lib/internal-auth.ts";
import { initiateWakeTaskCall } from "@/lib/telnyx.ts";
import type { Bindings } from "@/lib/types.ts";
import {
  createWakeTask,
  publicWakeTask,
  updateWakeTask,
  WAKE_SEVERITIES,
  WAKE_TASK_TYPES,
  type CreateWakeTaskInput,
} from "@/lib/wake-tasks.ts";

const IDEMPOTENCY_KEY = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;

function parseInput(value: unknown): CreateWakeTaskInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if ("to" in input || "phone" in input || "phone_number" in input || "destination" in input) {
    return null;
  }
  const maxDurationSeconds = input.max_duration_seconds ?? 120;
  if (
    !WAKE_TASK_TYPES.includes(input.type as CreateWakeTaskInput["type"]) ||
    !WAKE_SEVERITIES.includes(input.severity as CreateWakeTaskInput["severity"]) ||
    typeof input.goal !== "string" ||
    input.goal.length < 1 ||
    input.goal.length > 500 ||
    typeof input.success_condition !== "string" ||
    input.success_condition.length < 1 ||
    input.success_condition.length > 500 ||
    !Number.isInteger(maxDurationSeconds) ||
    Number(maxDurationSeconds) < 30 ||
    Number(maxDurationSeconds) > 180
  ) {
    return null;
  }
  return {
    type: input.type as CreateWakeTaskInput["type"],
    severity: input.severity as CreateWakeTaskInput["severity"],
    goal: input.goal,
    successCondition: input.success_condition,
    maxDurationSeconds: Number(maxDurationSeconds),
  };
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as Bindings;
  if (!(await hasBearerToken(request, env.HERMES_INTERNAL_WAKE_TOKEN))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (!idempotencyKey || !IDEMPOTENCY_KEY.test(idempotencyKey)) {
    return Response.json({ error: "valid Idempotency-Key required" }, { status: 400 });
  }

  let input: CreateWakeTaskInput | null = null;
  try {
    input = parseInput(await request.json());
  } catch {
    // handled as invalid input below
  }
  if (!input) return Response.json({ error: "invalid wake task" }, { status: 400 });

  const { task, created } = await createWakeTask(env.WAKE_DB, input, idempotencyKey);
  if (!created) return Response.json(publicWakeTask(task));

  try {
    const call = await initiateWakeTaskCall(env, task);
    const updated = await updateWakeTask(env.WAKE_DB, task.id, {
      status: "calling",
      telnyxCallControlId: call.callControlId,
      telnyxCallSessionId: call.callSessionId,
    });
    return Response.json(publicWakeTask(updated ?? task), { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Wake call failed";
    const updated = await updateWakeTask(env.WAKE_DB, task.id, {
      status: "failed",
      error: message,
    });
    console.error("Telnyx wake task dial failed", { taskId: task.id, message });
    return Response.json(publicWakeTask(updated ?? task), { status: 502 });
  }
};
