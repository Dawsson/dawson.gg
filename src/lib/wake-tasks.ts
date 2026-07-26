export const WAKE_TASK_TYPES = ["daily_wake", "meeting_wake", "critical_wake"] as const;
export const WAKE_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const WAKE_RESULTS = [
  "awake_confirmed",
  "not_confirmed",
  "unclear",
  "no_answer",
  "voicemail",
] as const;

export type WakeTaskType = (typeof WAKE_TASK_TYPES)[number];
export type WakeSeverity = (typeof WAKE_SEVERITIES)[number];
export type WakeResult = (typeof WAKE_RESULTS)[number];
export type WakeTaskStatus =
  | "pending"
  | "calling"
  | "in_progress"
  | "awake_confirmed"
  | "not_confirmed"
  | "failed"
  | "expired";

export interface WakeTask {
  id: string;
  idempotencyKey: string;
  type: WakeTaskType;
  severity: WakeSeverity;
  status: WakeTaskStatus;
  goal: string;
  successCondition: string;
  maxDurationSeconds: number;
  telnyxConversationId: string | null;
  telnyxCallControlId: string | null;
  telnyxCallSessionId: string | null;
  result: WakeResult | null;
  confidence: number | null;
  summary: string | null;
  evidence: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  retainUntil: string;
}

export interface CreateWakeTaskInput {
  type: WakeTaskType;
  severity: WakeSeverity;
  goal: string;
  successCondition: string;
  maxDurationSeconds: number;
}

type WakeTaskRow = {
  id: string;
  idempotency_key: string;
  type: WakeTaskType;
  severity: WakeSeverity;
  status: WakeTaskStatus;
  goal: string;
  success_condition: string;
  max_duration_seconds: number;
  telnyx_conversation_id: string | null;
  telnyx_call_control_id: string | null;
  telnyx_call_session_id: string | null;
  result: WakeResult | null;
  confidence: number | null;
  summary: string | null;
  evidence: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
  retain_until: string;
};

function fromRow(row: WakeTaskRow): WakeTask {
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    type: row.type,
    severity: row.severity,
    status: row.status,
    goal: row.goal,
    successCondition: row.success_condition,
    maxDurationSeconds: row.max_duration_seconds,
    telnyxConversationId: row.telnyx_conversation_id,
    telnyxCallControlId: row.telnyx_call_control_id,
    telnyxCallSessionId: row.telnyx_call_session_id,
    result: row.result,
    confidence: row.confidence,
    summary: row.summary,
    evidence: row.evidence,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    retainUntil: row.retain_until,
  };
}

export async function createWakeTask(
  db: D1Database,
  input: CreateWakeTaskInput,
  idempotencyKey: string,
  now = new Date(),
): Promise<{ task: WakeTask; created: boolean }> {
  const id = crypto.randomUUID();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + input.maxDurationSeconds * 1000).toISOString();
  const retainUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO wake_tasks (
        id, idempotency_key, type, severity, status, goal, success_condition,
        max_duration_seconds, created_at, updated_at, expires_at, retain_until
      ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      idempotencyKey,
      input.type,
      input.severity,
      input.goal,
      input.successCondition,
      input.maxDurationSeconds,
      createdAt,
      createdAt,
      expiresAt,
      retainUntil,
    )
    .run();
  const task = await getWakeTaskByIdempotencyKey(db, idempotencyKey);
  if (!task) throw new Error("Wake task could not be created");
  return { task, created: (result.meta.changes ?? 0) > 0 };
}

export async function getWakeTask(db: D1Database, id: string): Promise<WakeTask | null> {
  const row = await db
    .prepare("SELECT * FROM wake_tasks WHERE id = ?")
    .bind(id)
    .first<WakeTaskRow>();
  return row ? fromRow(row) : null;
}

async function getWakeTaskByIdempotencyKey(db: D1Database, key: string): Promise<WakeTask | null> {
  const row = await db
    .prepare("SELECT * FROM wake_tasks WHERE idempotency_key = ?")
    .bind(key)
    .first<WakeTaskRow>();
  return row ? fromRow(row) : null;
}

const UPDATE_COLUMNS = {
  status: "status",
  telnyxConversationId: "telnyx_conversation_id",
  telnyxCallControlId: "telnyx_call_control_id",
  telnyxCallSessionId: "telnyx_call_session_id",
  result: "result",
  confidence: "confidence",
  summary: "summary",
  evidence: "evidence",
  error: "error",
} as const;

export async function updateWakeTask(
  db: D1Database,
  id: string,
  changes: Partial<Pick<WakeTask, keyof typeof UPDATE_COLUMNS>>,
): Promise<WakeTask | null> {
  const entries = Object.entries(changes).filter(
    ([key, value]) => key in UPDATE_COLUMNS && value !== undefined,
  ) as [keyof typeof UPDATE_COLUMNS, unknown][];
  if (entries.length === 0) return getWakeTask(db, id);
  const sets = entries.map(([key]) => `${UPDATE_COLUMNS[key]} = ?`);
  const values = entries.map(([, value]) => value);
  const updatedAt = new Date().toISOString();
  await db
    .prepare(`UPDATE wake_tasks SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`)
    .bind(...values, updatedAt, id)
    .run();
  return getWakeTask(db, id);
}

export async function recordWakeTaskEvent(
  db: D1Database,
  taskId: string,
  eventId: string,
  eventType: string,
  occurredAt: string,
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO wake_task_events
       (event_id, wake_task_id, event_type, occurred_at) VALUES (?, ?, ?, ?)`,
    )
    .bind(eventId, taskId, eventType, occurredAt)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export function publicWakeTask(task: WakeTask) {
  const isFinal = ["awake_confirmed", "not_confirmed", "failed", "expired"].includes(task.status);
  return {
    id: task.id,
    type: task.type,
    severity: task.severity,
    status: task.status,
    result: task.result,
    confidence: task.confidence,
    summary: task.summary,
    evidence: task.evidence,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
    expires_at: task.expiresAt,
    next_recommended_action:
      task.status === "awake_confirmed" ? "stop" : isFinal ? "retry" : "wait",
  };
}

export function hasExplicitWakeConfirmation(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (
    /\bi(?: am|'m) awake\b/.test(normalized) &&
    /\b(getting|getting myself|going to get|get) up\b/.test(normalized)
  );
}

export function classifyConversationMessages(
  messages: Array<{ role?: string; content?: unknown }>,
): { result: WakeResult; confidence: number; evidence?: string } {
  const userText = messages
    .filter((message) => message.role === "user" && typeof message.content === "string")
    .map((message) => message.content as string);
  const confirmation = userText.find(hasExplicitWakeConfirmation);
  if (confirmation) {
    return { result: "awake_confirmed", confidence: 0.98, evidence: confirmation.slice(0, 240) };
  }
  return {
    result: userText.length > 0 ? "not_confirmed" : "unclear",
    confidence: userText.length > 0 ? 0.8 : 0.5,
    evidence: userText.at(-1)?.slice(0, 240),
  };
}

export async function cleanupWakeTasks(db: D1Database, now = new Date()): Promise<void> {
  await db.prepare("DELETE FROM wake_tasks WHERE retain_until < ?").bind(now.toISOString()).run();
}
