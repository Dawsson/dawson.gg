import type { WakeTask } from "./wake-tasks.ts";

export const BRIEFING_ITEM_KINDS = [
  "calendar",
  "message",
  "task",
  "update",
  "reminder",
  "other",
] as const;

export interface BriefingItem {
  id: string;
  kind: (typeof BRIEFING_ITEM_KINDS)[number];
  title: string;
  summary: string;
  source?: string;
  requiresResponse?: boolean;
  details?: string;
}

export interface BriefingAction {
  id: string;
  itemId?: string;
  type: "draft_reply" | "send_reply" | "defer" | "create_reminder" | "note";
  content: string;
  status: "draft" | "approved";
  createdAt: string;
}

export interface BriefingSession {
  task: WakeTask;
  title: string;
  items: BriefingItem[];
  actions: BriefingAction[];
  notes: string[];
  completedAt: string | null;
}

type BriefingRow = {
  title: string;
  items_json: string;
  actions_json: string;
  notes_json: string;
  completed_at: string | null;
};

function parseArray<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export async function createBriefingSession(
  db: D1Database,
  taskId: string,
  title: string,
  items: BriefingItem[],
  now = new Date(),
): Promise<void> {
  const timestamp = now.toISOString();
  await db
    .prepare(
      `INSERT INTO briefing_sessions
       (wake_task_id, title, items_json, actions_json, notes_json, created_at, updated_at)
       VALUES (?, ?, ?, '[]', '[]', ?, ?)`,
    )
    .bind(taskId, title, JSON.stringify(items), timestamp, timestamp)
    .run();
}

export async function getBriefingSession(
  db: D1Database,
  task: WakeTask,
): Promise<BriefingSession | null> {
  const row = await db
    .prepare("SELECT * FROM briefing_sessions WHERE wake_task_id = ?")
    .bind(task.id)
    .first<BriefingRow>();
  if (!row) return null;
  return {
    task,
    title: row.title,
    items: parseArray<BriefingItem>(row.items_json),
    actions: parseArray<BriefingAction>(row.actions_json),
    notes: parseArray<string>(row.notes_json),
    completedAt: row.completed_at,
  };
}

export async function getBriefingByConversationId(
  db: D1Database,
  conversationId: string,
): Promise<BriefingSession | null> {
  const task = await db
    .prepare("SELECT * FROM wake_tasks WHERE telnyx_conversation_id = ?")
    .bind(conversationId)
    .first<Record<string, unknown>>();
  if (!task) return null;
  const { getWakeTask } = await import("./wake-tasks.ts");
  const wakeTask = await getWakeTask(db, String(task.id));
  return wakeTask ? getBriefingSession(db, wakeTask) : null;
}

export async function addBriefingAction(
  db: D1Database,
  session: BriefingSession,
  action: Omit<BriefingAction, "id" | "createdAt">,
): Promise<BriefingAction> {
  const created: BriefingAction = {
    ...action,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  await db
    .prepare("UPDATE briefing_sessions SET actions_json = ?, updated_at = ? WHERE wake_task_id = ?")
    .bind(JSON.stringify([...session.actions, created]), new Date().toISOString(), session.task.id)
    .run();
  return created;
}

export async function completeBriefing(db: D1Database, taskId: string): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare("UPDATE briefing_sessions SET completed_at = ?, updated_at = ? WHERE wake_task_id = ?")
    .bind(now, now, taskId)
    .run();
}

export function publicBriefingSession(session: BriefingSession) {
  return {
    id: session.task.id,
    title: session.title,
    status: session.completedAt ? "completed" : session.task.status,
    items: session.items,
    actions: session.actions,
    notes: session.notes,
    created_at: session.task.createdAt,
    updated_at: session.task.updatedAt,
  };
}
