CREATE TABLE wake_tasks (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('daily_wake', 'meeting_wake', 'critical_wake')),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL CHECK (
    status IN (
      'pending',
      'calling',
      'in_progress',
      'awake_confirmed',
      'not_confirmed',
      'failed',
      'expired'
    )
  ),
  goal TEXT NOT NULL,
  success_condition TEXT NOT NULL,
  max_duration_seconds INTEGER NOT NULL,
  telnyx_conversation_id TEXT,
  telnyx_call_control_id TEXT,
  telnyx_call_session_id TEXT,
  result TEXT CHECK (
    result IS NULL OR result IN (
      'awake_confirmed',
      'not_confirmed',
      'unclear',
      'no_answer',
      'voicemail'
    )
  ),
  confidence REAL,
  summary TEXT,
  evidence TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  retain_until TEXT NOT NULL
);

CREATE INDEX wake_tasks_call_control_id
  ON wake_tasks(telnyx_call_control_id);
CREATE INDEX wake_tasks_conversation_id
  ON wake_tasks(telnyx_conversation_id);
CREATE INDEX wake_tasks_retain_until
  ON wake_tasks(retain_until);

CREATE TABLE wake_task_events (
  event_id TEXT PRIMARY KEY,
  wake_task_id TEXT NOT NULL REFERENCES wake_tasks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);
