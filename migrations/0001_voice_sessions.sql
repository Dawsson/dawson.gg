CREATE TABLE voice_sessions (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'calling', 'in_progress', 'completed', 'failed', 'expired')
  ),
  max_duration_seconds INTEGER NOT NULL,
  telnyx_conversation_id TEXT,
  telnyx_call_control_id TEXT,
  telnyx_call_session_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  retain_until TEXT NOT NULL
);

CREATE INDEX voice_sessions_conversation_id
  ON voice_sessions(telnyx_conversation_id);
CREATE INDEX voice_sessions_retain_until
  ON voice_sessions(retain_until);

CREATE TABLE voice_session_events (
  event_id TEXT PRIMARY KEY,
  voice_session_id TEXT NOT NULL REFERENCES voice_sessions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);

CREATE TABLE briefing_sessions (
  voice_session_id TEXT PRIMARY KEY REFERENCES voice_sessions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  items_json TEXT NOT NULL,
  actions_json TEXT NOT NULL DEFAULT '[]',
  notes_json TEXT NOT NULL DEFAULT '[]',
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
