CREATE TABLE briefing_sessions (
  wake_task_id TEXT PRIMARY KEY REFERENCES wake_tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  items_json TEXT NOT NULL,
  actions_json TEXT NOT NULL DEFAULT '[]',
  notes_json TEXT NOT NULL DEFAULT '[]',
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

