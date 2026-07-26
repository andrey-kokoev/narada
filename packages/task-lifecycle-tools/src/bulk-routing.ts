import { randomUUID } from 'node:crypto';
import { relative } from 'node:path';
import { findTaskFile, readTaskFile, writeTaskProjection } from '@narada2/task-governance/task-governance';

export function planBulkTaskRouting({ store, args }: any) : any {
  ensureTaskRoutingTables(store);
  const selector: any = resolveTaskSelector(store, args);
  const targetRole: any = Object.prototype.hasOwnProperty.call(args, 'target_role') ? nullableStringOrNull(args.target_role) : undefined;
  const preferredAgentId: any = Object.prototype.hasOwnProperty.call(args, 'preferred_agent_id') ? nullableStringOrNull(args.preferred_agent_id) : undefined;
  const relativePriority: any = numberOrUndefined(args.relative_priority);
  if (targetRole === undefined && preferredAgentId === undefined && relativePriority === undefined) {
    throw new Error('routing_change_required');
  }
  const candidates: any = selector.task_numbers
    .map((taskNumber: any) : any => ({ task_number: taskNumber, lifecycle: store.getLifecycleByNumber(taskNumber) }))
    .map((entry: any) : any => buildRoutingPlanEntry(store, entry, { targetRole, preferredAgentId, relativePriority }));
  return {
    schema: 'narada.task.bulk_routing.plan.v0',
    status: 'planned',
    selector: selector.summary,
    requested_routing: {
      target_role: targetRole,
      preferred_agent_id: preferredAgentId,
      relative_priority: relativePriority,
    },
    counts: countPlanGroups(candidates),
    groups: groupPlanEntries(candidates),
  };
}

export async function applyBulkTaskRouting({ store, siteRoot, args, actorAgentId, actorRole }: any) : Promise<any> {
  const dryRun: any = Boolean(args.dry_run);
  const allowPartial: any = Boolean(args.allow_partial);
  const reason: any = requiredString(args.reason, 'reason');
  const plan: any = planBulkTaskRouting({ store, args });
  const blockers: any = [...plan.groups.blocked, ...plan.groups.missing];
  if (dryRun) {
    return {
      ...plan,
      status: 'dry_run',
      dry_run: true,
      mutation_applied: false,
    };
  }
  if (blockers.length > 0 && !allowPartial) {
    return {
      ...plan,
      status: 'blocked',
      mutation_applied: false,
      blockers,
      remediation: 'Re-run with selectors that resolve only opened tasks, or pass allow_partial=true to route only routable tasks with explicit skipped-task evidence.',
    };
  }

  const now: any = new Date().toISOString();
  const changedProjectionPaths: any = [];
  const applied: any = [];
  store.db.exec('BEGIN');
  try {
    for (const entry of plan.groups.routable) {
      const lifecycle: any = store.getLifecycleByNumber(entry.task_number);
      if (!lifecycle) continue;
      store.db.prepare(`
        INSERT INTO narada_andrey_task_role_preferences (task_id, preferred_role, target_role, preferred_agent_id, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(task_id) DO UPDATE SET
          preferred_role = excluded.preferred_role,
          target_role = excluded.target_role,
          preferred_agent_id = excluded.preferred_agent_id,
          updated_at = excluded.updated_at
      `).run(lifecycle.task_id, entry.next_routing.target_role, entry.next_routing.target_role, entry.next_routing.preferred_agent_id, now);
      store.db.prepare(`
        UPDATE task_lifecycle
        SET relative_priority = ?, priority_reason = ?, updated_at = ?
        WHERE task_id = ?
      `).run(entry.next_routing.relative_priority, reason, now, lifecycle.task_id);
      const eventId: any = `route-${randomUUID()}`;
      store.db.prepare(`
        INSERT INTO task_routing_events (
          event_id, task_id, task_number, actor_agent_id, actor_role,
          reason, changed_fields_json, previous_routing_json, new_routing_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        eventId,
        lifecycle.task_id,
        entry.task_number,
        actorAgentId,
        actorRole,
        reason,
        JSON.stringify(entry.changed_fields),
        JSON.stringify(entry.previous_routing),
        JSON.stringify(entry.next_routing),
        now,
      );
      applied.push({ ...entry, audit_event_id: eventId });
    }
    store.db.exec('COMMIT');
  } catch (error: any) {
    try { store.db.exec('ROLLBACK'); } catch {}
    throw error;
  }

  for (const entry of applied) {
    const path: any = await writeRoutingProjection({ siteRoot, taskNumber: entry.task_number, routing: entry.next_routing });
    if (path) changedProjectionPaths.push(path);
  }

  return {
    ...plan,
    status: blockers.length > 0 ? 'partial_applied' : 'applied',
    mutation_applied: applied.length > 0,
    allow_partial: allowPartial,
    applied,
    skipped: [...plan.groups.no_change, ...plan.groups.blocked, ...plan.groups.missing],
    changed_projection_paths: changedProjectionPaths,
    commit_ready: {
      helper_tool: 'git_task_closeout_commit_and_push',
      stage_paths: changedProjectionPaths,
      paths: changedProjectionPaths,
      exclude_unrelated_dirty_files: true,
      authority_required: 'explicit task_closeout_policy or operator_direct_instruction for the routing projection commit',
    },
  };
}

export function ensureTaskRoutingTables(store: any) : any {
  store.db.exec(`
    CREATE TABLE IF NOT EXISTS narada_andrey_task_role_preferences (
      task_id TEXT PRIMARY KEY,
      preferred_role TEXT,
      target_role TEXT,
      preferred_agent_id TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_routing_events (
      event_id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      task_number INTEGER NOT NULL,
      actor_agent_id TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      reason TEXT NOT NULL,
      changed_fields_json TEXT NOT NULL,
      previous_routing_json TEXT NOT NULL,
      new_routing_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

function resolveTaskSelector(store: any, args: any) : any {
  const selected: any = new Set();
  const sources: any = [];
  const explicit: any = Array.isArray(args.task_numbers) ? args.task_numbers.map(Number).filter(Number.isInteger) : [];
  if (explicit.length > 0) {
    explicit.forEach((taskNumber: any) : any => selected.add(taskNumber));
    sources.push({ kind: 'explicit_task_numbers', count: explicit.length });
  }
  const rangeStart: any = numberOrUndefined(args.range_start);
  const rangeEnd: any = numberOrUndefined(args.range_end);
  if (rangeStart !== undefined || rangeEnd !== undefined) {
    if (rangeStart === undefined || rangeEnd === undefined || rangeEnd < rangeStart) throw new Error('valid_range_start_and_range_end_required');
    const rows: any = store.db.prepare('SELECT task_number FROM task_lifecycle WHERE task_number BETWEEN ? AND ? ORDER BY task_number').all(rangeStart, rangeEnd);
    rows.forEach((row: any) : any => selected.add(Number(row.task_number)));
    sources.push({ kind: 'range', range_start: rangeStart, range_end: rangeEnd, count: rows.length });
  }
  const chapterId: any = nullableString(args.chapter_id);
  if (chapterId) {
    const rows: any = store.db.prepare('SELECT task_number FROM chapter_memberships WHERE chapter_id = ? ORDER BY order_index, task_number').all(chapterId);
    rows.forEach((row: any) : any => selected.add(Number(row.task_number)));
    sources.push({ kind: 'chapter_id', chapter_id: chapterId, count: rows.length });
  }
  const titlePrefix: any = nullableString(args.title_prefix);
  if (titlePrefix) {
    const rows: any = store.db.prepare('SELECT task_number FROM task_specs WHERE title LIKE ? ORDER BY task_number').all(`${titlePrefix}%`);
    rows.forEach((row: any) : any => selected.add(Number(row.task_number)));
    sources.push({ kind: 'title_prefix', title_prefix: titlePrefix, count: rows.length });
  }
  let taskNumbers: any = [...selected].sort((a: any, b) : any => a - b);
  const statusFilter: any = nullableString(args.status_filter);
  if (statusFilter) {
    taskNumbers = taskNumbers.filter((taskNumber: any) : any => store.getLifecycleByNumber(taskNumber)?.status === statusFilter);
    sources.push({ kind: 'status_filter', status_filter: statusFilter, count_after_filter: taskNumbers.length });
  }
  if (taskNumbers.length === 0) throw new Error('selector_resolved_no_tasks');
  return {
    task_numbers: taskNumbers,
    summary: { sources, task_numbers: taskNumbers },
  };
}

function buildRoutingPlanEntry(store: any, { task_number: taskNumber, lifecycle }: any, requested: any) : any {
  if (!lifecycle) return { task_number: taskNumber, status: 'missing', reason: 'task_not_found' };
  const previous: any = getTaskRouting(store, lifecycle.task_id);
  const next: any = {
    target_role: requested.targetRole !== undefined ? requested.targetRole : previous.target_role,
    preferred_agent_id: requested.preferredAgentId !== undefined ? requested.preferredAgentId : previous.preferred_agent_id,
    relative_priority: requested.relativePriority !== undefined ? requested.relativePriority : previous.relative_priority,
  };
  const changedFields: any = {};
  for (const field of ['target_role', 'preferred_agent_id', 'relative_priority']) {
    if (previous[field] !== next[field]) changedFields[field] = { before: previous[field], after: next[field] };
  }
  const base: any = {
    task_number: taskNumber,
    task_id: lifecycle.task_id,
    lifecycle_status: lifecycle.status,
    previous_routing: previous,
    next_routing: next,
    changed_fields: changedFields,
  };
  if (lifecycle.status !== 'opened') return { ...base, status: 'blocked', reason: 'task_not_opened' };
  if (Object.keys(changedFields).length === 0) return { ...base, status: 'no_change', reason: 'routing_already_matches' };
  return { ...base, status: 'routable' };
}

function groupPlanEntries(entries: any) : any {
  return {
    routable: entries.filter((entry: any) : any => entry.status === 'routable'),
    no_change: entries.filter((entry: any) : any => entry.status === 'no_change'),
    blocked: entries.filter((entry: any) : any => entry.status === 'blocked'),
    missing: entries.filter((entry: any) : any => entry.status === 'missing'),
  };
}

function countPlanGroups(entries: any) : any {
  const groups: any = groupPlanEntries(entries);
  return {
    total: entries.length,
    routable: groups.routable.length,
    no_change: groups.no_change.length,
    blocked: groups.blocked.length,
    missing: groups.missing.length,
  };
}

function getTaskRouting(store: any, taskId: any) : any {
  const row: any = store.db.prepare('SELECT target_role, preferred_agent_id FROM narada_andrey_task_role_preferences WHERE task_id = ?').get(taskId);
  const lifecycle: any = store.getLifecycle(taskId);
  return {
    target_role: row?.target_role ?? null,
    preferred_agent_id: row?.preferred_agent_id ?? null,
    relative_priority: lifecycle?.relative_priority ?? 0,
  };
}

async function writeRoutingProjection({ siteRoot, taskNumber, routing }: any) : Promise<any> {
  try {
    const taskFile: any = await findTaskFile(siteRoot, taskNumber);
    if (!taskFile) return null;
    const { frontMatter, body }: any = await readTaskFile(taskFile.path);
    if (routing.target_role) {
      frontMatter.target_role = routing.target_role;
      frontMatter.preferred_role = routing.target_role;
    } else {
      delete frontMatter.target_role;
      delete frontMatter.preferred_role;
    }
    if (routing.preferred_agent_id) frontMatter.preferred_agent_id = routing.preferred_agent_id;
    else delete frontMatter.preferred_agent_id;
    if (routing.relative_priority !== null && routing.relative_priority !== undefined && routing.relative_priority !== 0) {
      frontMatter.relative_priority = routing.relative_priority;
    } else {
      delete frontMatter.relative_priority;
    }
    await writeTaskProjection(taskFile.path, frontMatter, body);
    return taskFile.relative_path ?? relative(siteRoot, taskFile.path).replace(/\\/g, '/');
  } catch {
    return null;
  }
}

function requiredString(value: any, name: any) : any {
  const text: any = nullableString(value);
  if (!text) throw new Error(`${name}_required`);
  return text;
}

function nullableString(value: any) : any {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function nullableStringOrNull(value: any) : any {
  if (value === null) return null;
  return nullableString(value);
}

function numberOrUndefined(value: any) : any {
  const number: any = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
