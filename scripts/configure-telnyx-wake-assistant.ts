export {};

const assistantId =
  process.env.TELNYX_AI_ASSISTANT_ID ?? "assistant-1ed2ce2e-6d8e-4527-af37-4e801b5b6068";
const apiKey = process.env.TELNYX_API_KEY;
const toolToken = process.env.TELNYX_AI_TOOL_TOKEN;
if (!assistantId || !apiKey || !toolToken) {
  throw new Error("TELNYX_AI_ASSISTANT_ID, TELNYX_API_KEY, and TELNYX_AI_TOOL_TOKEN are required");
}

const assistantResponse = await fetch(
  `https://api.telnyx.com/v2/ai/assistants/${encodeURIComponent(assistantId)}`,
  { headers: { Authorization: `Bearer ${apiKey}` } },
);
if (!assistantResponse.ok) {
  throw new Error(`Telnyx assistant retrieval failed with status ${assistantResponse.status}`);
}
const assistant = (await assistantResponse.json()) as {
  tools?: Array<{ type?: string; [key: string]: unknown }>;
  telephony_settings?: Record<string, unknown>;
  privacy_settings?: Record<string, unknown>;
};
const hasWakeTool = (assistant.tools ?? []).some(
  (tool) =>
    tool.type === "webhook" &&
    (tool as { webhook?: { name?: string } }).webhook?.name === "report_wake_status",
);
const wakeTool = {
  type: "webhook",
  webhook: {
    name: "report_wake_status",
    description:
      "Report whether Dawson explicitly confirmed he is awake and getting up. Use the wake_task_id from developer context.",
    url: "https://dawson.gg/api/telnyx/ai-tools/report-wake-status",
    method: "POST",
    headers: [
      { name: "Authorization", value: `Bearer ${toolToken}` },
      { name: "Content-Type", value: "application/json" },
    ],
    body_parameters: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The wake_task_id from developer context." },
        status: {
          type: "string",
          enum: ["awake_confirmed", "not_confirmed", "unclear"],
        },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        summary: { type: "string" },
        evidence: {
          type: "string",
          description: "The exact words Dawson used as evidence for the status.",
        },
      },
      required: ["task_id", "status", "confidence", "summary", "evidence"],
    },
  },
};

const updateResponse = await fetch(
  `https://api.telnyx.com/v2/ai/assistants/${encodeURIComponent(assistantId)}`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Hermes Wake Voice",
      model: "moonshotai/Kimi-K2.6",
      greeting: "Dawson, this is your wake-up assistant. Please say: I am awake and getting up.",
      instructions:
        "You are Dawson's wake-up assistant. Your only job is to determine whether Dawson is actually awake. Be concise, firm, and friendly. Read the wake_task_id, goal, success_condition, and expires_at from developer context. Ask Dawson to explicitly say: I am awake and getting up. Do not treat silence, mumbling, voicemail, jokes, or vague answers as confirmation. If Dawson explicitly confirms he is awake and getting up, call report_wake_status with awake_confirmed and quote his exact words as evidence. Otherwise call report_wake_status with not_confirmed or unclear. Call the tool exactly once, then use the Hang Up tool. Keep the call under two minutes.",
      ...(hasWakeTool ? {} : { tools: [wakeTool] }),
      telephony_settings: {
        ...assistant.telephony_settings,
        time_limit_secs: 120,
        send_conversation_message_events: true,
        recording_settings: {
          enabled: false,
          channels: "dual",
          format: "mp3",
          stop_on_conversation_end: true,
        },
      },
      privacy_settings: {
        ...assistant.privacy_settings,
        data_retention: true,
      },
    }),
  },
);
if (!updateResponse.ok) {
  const details = (await updateResponse.text())
    .replaceAll(apiKey, "[REDACTED]")
    .replaceAll(toolToken, "[REDACTED]");
  throw new Error(
    `Telnyx assistant update failed with status ${updateResponse.status}: ${details.slice(0, 1000)}`,
  );
}
console.log("Configured Telnyx assistant for wake confirmation.");
