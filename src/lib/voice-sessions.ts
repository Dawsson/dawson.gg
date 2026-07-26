export type VoiceSessionStatus =
  | "pending"
  | "calling"
  | "in_progress"
  | "completed"
  | "failed"
  | "expired";

export interface VoiceSession {
  id: string;
  idempotencyKey: string;
  status: VoiceSessionStatus;
  maxDurationSeconds: number;
  telnyxConversationId: string | null;
  telnyxCallControlId: string | null;
  telnyxCallSessionId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  retainUntil: string;
}

type VoiceSessionRow = {
  id: string;
  idempotency_key: string;
  status: VoiceSessionStatus;
  max_duration_seconds: number;
  telnyx_conversation_id: string | null;
  telnyx_call_control_id: string | null;
  telnyx_call_session_id: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
  retain_until: string;
};

function fromRow(row: VoiceSessionRow): VoiceSession {
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    maxDurationSeconds: row.max_duration_seconds,
    telnyxConversationId: row.telnyx_conversation_id,
    telnyxCallControlId: row.telnyx_call_control_id,
    telnyxCallSessionId: row.telnyx_call_session_id,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    retainUntil: row.retain_until,
  };
}

export async function createVoiceSession(
  db: D1Database,
  maxDurationSeconds: number,
  idempotencyKey: string,
  now = new Date(),
): Promise<{ session: VoiceSession; created: boolean }> {
  const id = crypto.randomUUID();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + maxDurationSeconds * 1000).toISOString();
  const retainUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO voice_sessions (
        id, idempotency_key, status, max_duration_seconds,
        created_at, updated_at, expires_at, retain_until
      ) VALUES (?, ?, 'pending', ?, ?, ?, ?, ?)`,
    )
    .bind(id, idempotencyKey, maxDurationSeconds, createdAt, createdAt, expiresAt, retainUntil)
    .run();
  const session = await getVoiceSessionByIdempotencyKey(db, idempotencyKey);
  if (!session) throw new Error("Voice session could not be created");
  return { session, created: (result.meta.changes ?? 0) > 0 };
}

export async function getVoiceSession(db: D1Database, id: string): Promise<VoiceSession | null> {
  const row = await db
    .prepare("SELECT * FROM voice_sessions WHERE id = ?")
    .bind(id)
    .first<VoiceSessionRow>();
  return row ? fromRow(row) : null;
}

export async function getVoiceSessionByConversationId(
  db: D1Database,
  conversationId: string,
): Promise<VoiceSession | null> {
  const row = await db
    .prepare("SELECT * FROM voice_sessions WHERE telnyx_conversation_id = ?")
    .bind(conversationId)
    .first<VoiceSessionRow>();
  return row ? fromRow(row) : null;
}

async function getVoiceSessionByIdempotencyKey(
  db: D1Database,
  key: string,
): Promise<VoiceSession | null> {
  const row = await db
    .prepare("SELECT * FROM voice_sessions WHERE idempotency_key = ?")
    .bind(key)
    .first<VoiceSessionRow>();
  return row ? fromRow(row) : null;
}

const UPDATE_COLUMNS = {
  status: "status",
  telnyxConversationId: "telnyx_conversation_id",
  telnyxCallControlId: "telnyx_call_control_id",
  telnyxCallSessionId: "telnyx_call_session_id",
  error: "error",
} as const;

export async function updateVoiceSession(
  db: D1Database,
  id: string,
  changes: Partial<Pick<VoiceSession, keyof typeof UPDATE_COLUMNS>>,
): Promise<VoiceSession | null> {
  const entries = Object.entries(changes).filter(
    ([key, value]) => key in UPDATE_COLUMNS && value !== undefined,
  ) as [keyof typeof UPDATE_COLUMNS, unknown][];
  if (entries.length === 0) return getVoiceSession(db, id);
  const sets = entries.map(([key]) => `${UPDATE_COLUMNS[key]} = ?`);
  await db
    .prepare(`UPDATE voice_sessions SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`)
    .bind(...entries.map(([, value]) => value), new Date().toISOString(), id)
    .run();
  return getVoiceSession(db, id);
}

export async function recordVoiceSessionEvent(
  db: D1Database,
  sessionId: string,
  eventId: string,
  eventType: string,
  occurredAt: string,
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO voice_session_events
       (event_id, voice_session_id, event_type, occurred_at) VALUES (?, ?, ?, ?)`,
    )
    .bind(eventId, sessionId, eventType, occurredAt)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function cleanupVoiceSessions(db: D1Database, now = new Date()): Promise<void> {
  await db
    .prepare("DELETE FROM voice_sessions WHERE retain_until < ?")
    .bind(now.toISOString())
    .run();
}
