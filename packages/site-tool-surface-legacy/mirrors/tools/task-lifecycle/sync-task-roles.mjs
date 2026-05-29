import { enforceMcpGuard } from './mcp-guard.mjs';
enforceMcpGuard(process.argv);

import { openTaskLifecycleStore } from '@narada2/task-governance/task-lifecycle-store';
import { parseFrontMatter } from '@narada2/task-governance/task-governance';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const cwd = process.argv[2] || process.cwd();
const tasksDir = join(cwd, '.ai', 'do-not-open', 'tasks');

const store = openTaskLifecycleStore(cwd);

// Create local role preferences table if not exists
store.db.exec(`
  CREATE TABLE IF NOT EXISTS narada_andrey_task_role_preferences (
    task_id TEXT PRIMARY KEY,
    preferred_role TEXT,
    target_role TEXT,
    preferred_agent_id TEXT,
    updated_at TEXT NOT NULL
  )
`);

// Add new columns if they don't exist (SQLite doesn't support IF NOT EXISTS for ALTER TABLE)
try {
  store.db.exec(`ALTER TABLE narada_andrey_task_role_preferences ADD COLUMN target_role TEXT`);
} catch (e) {
  // Column already exists
}
try {
  store.db.exec(`ALTER TABLE narada_andrey_task_role_preferences ADD COLUMN preferred_agent_id TEXT`);
} catch (e) {
  // Column already exists
}

const now = new Date().toISOString();
let synced = 0;

try {
  const files = readdirSync(tasksDir).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const content = readFileSync(join(tasksDir, file), 'utf8');
    const { frontMatter } = parseFrontMatter(content);
    const preferredRole = frontMatter?.preferred_role || null;

    // target_role is authoritative; fall back to preferred_role for backward compatibility
    const targetRole = frontMatter?.target_role || preferredRole || null;

    // preferred_agent_id can be top-level or nested in continuation_affinity
    const preferredAgentId = frontMatter?.preferred_agent_id
      || frontMatter?.continuation_affinity?.preferred_agent_id
      || null;

    // Extract task number from filename (e.g., 20260501-89-title.md -> 89)
    const match = file.match(/\d{8}-(\d+)-/);
    if (!match) continue;
    const taskNumber = parseInt(match[1], 10);

    const lifecycle = store.getLifecycleByNumber(taskNumber);
    if (!lifecycle) continue;

    store.db.prepare(`
      INSERT INTO narada_andrey_task_role_preferences (task_id, preferred_role, target_role, preferred_agent_id, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(task_id) DO UPDATE SET
        preferred_role = excluded.preferred_role,
        target_role = excluded.target_role,
        preferred_agent_id = excluded.preferred_agent_id,
        updated_at = excluded.updated_at
    `).run(lifecycle.task_id, preferredRole, targetRole, preferredAgentId, now);

    // Sync frontmatter priority fields to task_lifecycle
    const relativePriority = frontMatter?.relative_priority ?? null;
    const priorityReason = frontMatter?.priority_reason ?? null;
    if (relativePriority !== null || priorityReason !== null) {
      store.db.prepare(`
        UPDATE task_lifecycle
        SET relative_priority = COALESCE(?, relative_priority),
            priority_reason = COALESCE(?, priority_reason)
        WHERE task_id = ?
      `).run(
        relativePriority !== null ? Number(relativePriority) : null,
        priorityReason !== null ? String(priorityReason) : null,
        lifecycle.task_id
      );
    }

    synced++;
  }

  console.log(JSON.stringify({
    schema: 'narada.task.role_sync.v0',
    synced,
    tasks_dir: tasksDir,
    timestamp: now
  }, null, 2));
} finally {
  store.db.close();
}
