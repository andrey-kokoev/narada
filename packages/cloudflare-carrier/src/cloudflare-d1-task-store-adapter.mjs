/** Capability-scoped D1 task-store adapter for carrier tool effects. */
import { createCloudflarePersistenceRegistry } from './cloudflare-persistence-registry.mjs';

export function createCloudflareD1TaskStoreAdapter(env = {}) {
  const db = env.CLOUDFLARE_CARRIER_TASK_DB ?? env.NARADA_TASK_DB ?? null;
  const persistence = createCloudflarePersistenceRegistry(db);
  const repository = persistence?.repository('task-store') ?? null;
  if (!repository) return null;
  return {
    posture: 'cloudflare-d1',
    adapter_kind: 'cloudflare-d1-task-store',
    forSession(context = {}) {
      return createD1SessionTaskStore(repository, context);
    },
  };
}

function createD1SessionTaskStore(repository, context = {}) {
  const siteId = String(context.site_id ?? 'unknown-site');
  const siteRoot = context.site_root ?? `cloudflare://${siteId}`;
  const now = typeof context.now === 'function' ? context.now : () => new Date().toISOString();
  let initialized = false;
  async function ensureSchema() {
    if (initialized) return;
    await repository.prepare(`CREATE TABLE IF NOT EXISTS narada_tasks (
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
    )`).run();
    await repository.prepare('CREATE INDEX IF NOT EXISTS narada_tasks_site_number_idx ON narada_tasks(site_id, task_number)').run();
    initialized = true;
  }
  async function nextTaskNumber() {
    await ensureSchema();
    const row = await repository.prepare('SELECT COALESCE(MAX(task_number), 0) + 1 AS next_task_number FROM narada_tasks WHERE site_id = ?')
      .bind(siteId)
      .first();
    return Number(row?.next_task_number ?? 1);
  }
  return {
    async create({ title, description = null, status = 'open', source = 'carrier' }) {
      const trimmedTitle = String(title ?? '').trim();
      if (!trimmedTitle) throw new Error('cloudflare_task_create_requires_title');
      const taskNumber = await nextTaskNumber();
      const timestamp = now();
      const task = {
        site_id: siteId,
        task_id: `cloudflare-task-${taskNumber}`,
        task_number: taskNumber,
        title: trimmedTitle,
        description: description ? String(description) : null,
        status: String(status ?? 'open'),
        source: String(source ?? 'carrier'),
        note: null,
        created_at: timestamp,
        updated_at: timestamp,
        carrier_session_id: context.carrier_session_id ?? null,
        agent_id: context.agent_id ?? null,
        site_root: siteRoot,
      };
      await ensureSchema();
      await repository.prepare(`INSERT INTO narada_tasks (
        site_id, task_id, task_number, title, description, status, source, note,
        created_at, updated_at, carrier_session_id, agent_id, site_root
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        task.site_id,
        task.task_id,
        task.task_number,
        task.title,
        task.description,
        task.status,
        task.source,
        task.note,
        task.created_at,
        task.updated_at,
        task.carrier_session_id,
        task.agent_id,
        task.site_root,
      ).run();
      return publicTask(task);
    },
    async update({ task_id, status = null, note = null }) {
      await ensureSchema();
      const taskId = String(task_id ?? '').trim();
      const existing = await findTask(repository, siteId, taskId);
      if (!existing) throw new Error('cloudflare_task_not_found');
      const updated = {
        ...existing,
        status: status ? String(status) : existing.status,
        note: note ? String(note) : existing.note,
        updated_at: now(),
      };
      await repository.prepare('UPDATE narada_tasks SET status = ?, note = ?, updated_at = ? WHERE site_id = ? AND task_id = ?')
        .bind(updated.status, updated.note, updated.updated_at, siteId, updated.task_id)
        .run();
      return publicTask(updated);
    },
    async list() {
      await ensureSchema();
      const result = await repository.prepare('SELECT * FROM narada_tasks WHERE site_id = ? ORDER BY task_number ASC')
        .bind(siteId)
        .all();
      return (result.results ?? []).map(publicTask);
    },
  };
}

async function findTask(repository, siteId, taskIdOrNumber) {
  const byId = await repository.prepare('SELECT * FROM narada_tasks WHERE site_id = ? AND task_id = ?')
    .bind(siteId, taskIdOrNumber)
    .first();
  if (byId) return byId;
  const numeric = Number(taskIdOrNumber);
  if (!Number.isInteger(numeric)) return null;
  return repository.prepare('SELECT * FROM narada_tasks WHERE site_id = ? AND task_number = ?')
    .bind(siteId, numeric)
    .first();
}

function publicTask(task) {
  return {
    task_id: String(task.task_id),
    task_number: Number(task.task_number),
    title: String(task.title),
    description: task.description ?? null,
    status: String(task.status),
    source: String(task.source),
    created_at: String(task.created_at),
    updated_at: String(task.updated_at),
    note: task.note ?? null,
    site_id: task.site_id ?? null,
    carrier_session_id: task.carrier_session_id ?? null,
    agent_id: task.agent_id ?? null,
    site_root: task.site_root ?? null,
  };
}
