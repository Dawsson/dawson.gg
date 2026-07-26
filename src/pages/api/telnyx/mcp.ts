import type { APIRoute } from "astro";
import {
  addBriefingAction,
  completeBriefing,
  getBriefingByConversationId,
} from "@/lib/briefing-sessions.ts";
import { hasBearerToken } from "@/lib/internal-auth.ts";
import type { Bindings } from "@/lib/types.ts";

const tools = [
  {
    name: "get_briefing",
    description:
      "Get Dawson's current briefing. Start with a concise overview, then discuss one item at a time.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "record_action",
    description:
      "Record a draft or explicitly approved action for Hermes. Never mark an action approved until you read back its exact content and Dawson clearly confirms it.",
    inputSchema: {
      type: "object",
      properties: {
        item_id: { type: "string" },
        type: {
          type: "string",
          enum: ["draft_reply", "send_reply", "defer", "create_reminder", "note"],
        },
        content: { type: "string", description: "Exact draft, instruction, reminder, or note." },
        status: { type: "string", enum: ["draft", "approved"] },
      },
      required: ["type", "content", "status"],
      additionalProperties: false,
    },
  },
  {
    name: "finish_briefing",
    description: "Mark the briefing complete after summarizing approved actions and open items.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
] as const;

type RpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: {
    name?: string;
    arguments?: Record<string, unknown>;
    _meta?: { telnyx_conversation_id?: string };
  };
};

function rpc(id: RpcRequest["id"], result: unknown) {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, result });
}

function toolResult(value: unknown, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: value,
    isError,
  };
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as Bindings;
  if (!(await hasBearerToken(request, env.TELNYX_AI_TOOL_TOKEN))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: RpcRequest;
  try {
    body = (await request.json()) as RpcRequest;
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (body.method === "initialize") {
    return rpc(body.id, {
      protocolVersion: "2025-03-26",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "hermes-briefing", version: "1.0.0" },
    });
  }
  if (body.method === "notifications/initialized") return new Response(null, { status: 204 });
  if (body.method === "tools/list") return rpc(body.id, { tools });
  if (body.method !== "tools/call" || !body.params?.name) {
    return Response.json(
      { jsonrpc: "2.0", id: body.id ?? null, error: { code: -32601, message: "Method not found" } },
      { status: 404 },
    );
  }

  const conversationId = body.params._meta?.telnyx_conversation_id;
  if (!conversationId) return rpc(body.id, toolResult({ error: "missing conversation" }, true));
  const session = await getBriefingByConversationId(env.WAKE_DB, conversationId);
  if (!session) return rpc(body.id, toolResult({ error: "briefing not found" }, true));

  if (body.params.name === "get_briefing") {
    return rpc(
      body.id,
      toolResult({
        title: session.title,
        items: session.items,
        existing_actions: session.actions,
        instruction: "Be concise. Ask before expanding an item.",
      }),
    );
  }
  if (body.params.name === "record_action") {
    const args = body.params.arguments ?? {};
    const type = args.type;
    const status = args.status;
    const content = args.content;
    if (
      !["draft_reply", "send_reply", "defer", "create_reminder", "note"].includes(String(type)) ||
      !["draft", "approved"].includes(String(status)) ||
      typeof content !== "string" ||
      content.length < 1 ||
      content.length > 2000
    ) {
      return rpc(body.id, toolResult({ error: "invalid action" }, true));
    }
    const action = await addBriefingAction(env.WAKE_DB, session, {
      itemId: typeof args.item_id === "string" ? args.item_id.slice(0, 100) : undefined,
      type: type as "draft_reply",
      content,
      status: status as "draft",
    });
    return rpc(
      body.id,
      toolResult({
        recorded: true,
        action,
        execution:
          action.status === "approved"
            ? "Hermes may execute this after retrieving the session."
            : "Draft only; no external action will occur.",
      }),
    );
  }
  if (body.params.name === "finish_briefing") {
    await completeBriefing(env.WAKE_DB, session.task.id);
    return rpc(
      body.id,
      toolResult({
        completed: true,
        approved_actions: session.actions.filter((action) => action.status === "approved"),
      }),
    );
  }
  return rpc(body.id, toolResult({ error: "unknown tool" }, true));
};

export const GET: APIRoute = async () => new Response("Method not allowed", { status: 405 });
