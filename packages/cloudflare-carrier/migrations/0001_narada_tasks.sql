CREATE TABLE IF NOT EXISTS narada_tasks (
  site_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  task_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  carrier_session_id TEXT,
  agent_id TEXT,
  site_root TEXT,
  PRIMARY KEY (site_id, task_id)
);

CREATE INDEX IF NOT EXISTS narada_tasks_site_number_idx
  ON narada_tasks(site_id, task_number);
