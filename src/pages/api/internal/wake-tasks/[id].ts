import type { APIRoute } from "astro";
import { hasBearerToken } from "@/lib/internal-auth.ts";
import type { Bindings } from "@/lib/types.ts";
import { getWakeTask, publicWakeTask, updateWakeTask } from "@/lib/wake-tasks.ts";

export const GET: APIRoute = async ({ request, locals, params }) => {
  const env = locals.runtime.env as Bindings;
  if (!(await hasBearerToken(request, env.HERMES_INTERNAL_WAKE_TOKEN))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!params.id) return Response.json({ error: "not found" }, { status: 404 });
  let task = await getWakeTask(env.WAKE_DB, params.id);
  if (!task) return Response.json({ error: "not found" }, { status: 404 });
  if (
    new Date(task.expiresAt).getTime() < Date.now() &&
    !["awake_confirmed", "not_confirmed", "failed", "expired"].includes(task.status)
  ) {
    task =
      (await updateWakeTask(env.WAKE_DB, task.id, {
        status: "expired",
        result: task.result ?? "unclear",
      })) ?? task;
  }
  return Response.json(publicWakeTask(task));
};
