export {};

const assistantId =
  process.env.TELNYX_AI_ASSISTANT_ID ?? "assistant-721dd60e-fd64-41ae-8a5b-12b12387abd5";
const apiKey = process.env.TELNYX_API_KEY;
const toolToken = process.env.TELNYX_AI_TOOL_TOKEN;
if (!assistantId || !apiKey || !toolToken) {
  throw new Error("TELNYX_AI_ASSISTANT_ID, TELNYX_API_KEY, and TELNYX_AI_TOOL_TOKEN are required");
}

const headers = {
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
};
const request = async (path: string, init?: RequestInit) => {
  const response = await fetch(`https://api.telnyx.com/v2${path}`, { ...init, headers });
  if (!response.ok) {
    const detail = (await response.text())
      .replaceAll(apiKey, "[REDACTED]")
      .replaceAll(toolToken, "[REDACTED]")
      .slice(0, 1000);
    throw new Error(`Telnyx ${path} failed with status ${response.status}: ${detail}`);
  }
  return response.json() as Promise<Record<string, unknown>>;
};

const secretIdentifier = "hermes_briefing_mcp";
const secretList = await request("/integration_secrets");
const secrets = (secretList.data ?? []) as Array<{ identifier?: string }>;
if (!secrets.some((secret) => secret.identifier === secretIdentifier)) {
  await request("/integration_secrets", {
    method: "POST",
    body: JSON.stringify({
      identifier: secretIdentifier,
      type: "bearer",
      token: toolToken,
    }),
  });
}

const mcpList = await request("/ai/mcp_servers");
const mcpServers = (Array.isArray(mcpList) ? mcpList : (mcpList.data ?? [])) as Array<{
  id?: string;
  name?: string;
  url?: string;
}>;
let mcpServer = mcpServers.find(
  (server) =>
    server.name === "Hermes Briefing" || server.url === "https://dawson.gg/api/telnyx/mcp",
);
if (!mcpServer?.id) {
  mcpServer = (await request("/ai/mcp_servers", {
    method: "POST",
    body: JSON.stringify({
      name: "Hermes Briefing",
      type: "http",
      url: "https://dawson.gg/api/telnyx/mcp",
      api_key_ref: secretIdentifier,
      allowed_tools: ["get_briefing", "record_action", "finish_briefing"],
    }),
  })) as typeof mcpServer;
}
if (!mcpServer?.id) throw new Error("Telnyx MCP server response did not include an id");

const assistant = await request(`/ai/assistants/${encodeURIComponent(assistantId)}`);
await request(`/ai/assistants/${encodeURIComponent(assistantId)}`, {
  method: "POST",
  body: JSON.stringify({
    name: "Hermes Voice",
    model: "moonshotai/Kimi-K2.6",
    greeting:
      "Good morning, Dawson. I have your briefing ready. Would you like the quick version or to go through it together?",
    instructions:
      "You are Hermes Voice, Dawson's concise personal briefing assistant. You are warm, capable, and direct, never repetitive or nagging. Start by calling get_briefing. Give a short overview, then discuss one item at a time. Dawson may ask for details, skip, defer, take notes, draft replies, request suggestions, revise drafts, or approve actions. Use record_action for every draft or instruction Hermes should receive. Never mark a send_reply or other external action approved until you read back the exact content and Dawson clearly confirms it; vague agreement is not confirmation. You never execute messages yourself. Before ending, summarize approved actions and unresolved items, call finish_briefing, then hang up. Keep answers voice-friendly and brief.",
    mcp_servers: [{ id: mcpServer.id }],
    telephony_settings: {
      ...(assistant.telephony_settings as Record<string, unknown>),
      time_limit_secs: 600,
      send_conversation_message_events: true,
      recording_settings: {
        enabled: false,
        channels: "dual",
        format: "mp3",
        stop_on_conversation_end: true,
      },
    },
    privacy_settings: {
      ...(assistant.privacy_settings as Record<string, unknown>),
      data_retention: true,
    },
  }),
});

console.log("Configured Telnyx Hermes Voice assistant and authenticated briefing MCP server.");
