import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const OPEN_STATUSES = new Set(['opened', 'claimed', 'needs_continuation', 'in_review']);
const TERMINAL_STATUSES = new Set(['closed', 'confirmed']);
const BLOCKED_STATUSES = new Set(['blocked', 'deferred', 'needs_continuation', 'evidence_repair']);

export function ensureChapterLifecycleTables(store) {
  store.db.exec(`
    CREATE TABLE IF NOT EXISTS chapter_definitions (
      chapter_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      owner_agent_id TEXT,
      status TEXT NOT NULL,
      summary_markdown TEXT,
      source_kind TEXT NOT NULL,
      source_ref TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chapter_memberships (
      chapter_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      task_number INTEGER NOT NULL,
      order_index INTEGER NOT NULL,
      membership_kind TEXT NOT NULL,
      note_markdown TEXT,
      source_kind TEXT NOT NULL,
      source_ref TEXT,
      added_by TEXT NOT NULL,
      added_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (chapter_id, task_id),
      FOREIGN KEY (chapter_id) REFERENCES chapter_definitions(chapter_id),
      FOREIGN KEY (task_id) REFERENCES task_lifecycle(task_id)
    );

    CREATE INDEX IF NOT EXISTS idx_chapter_memberships_task_id
      ON chapter_memberships(task_id);

    CREATE INDEX IF NOT EXISTS idx_chapter_memberships_order
      ON chapter_memberships(chapter_id, order_index, task_number);

    CREATE TABLE IF NOT EXISTS chapter_source_records (
      source_record_id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      imported_text TEXT NOT NULL,
      imported_by TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      FOREIGN KEY (chapter_id) REFERENCES chapter_definitions(chapter_id)
    );
  `);
}

export function upsertChapterDefinition(store, args) {
  ensureChapterLifecycleTables(store);
  const now = new Date().toISOString();
  const chapterId = requiredString(args.chapter_id, 'chapter_id');
  const title = requiredString(args.title, 'title');
  const actor = requiredString(args.actor_agent_id, 'actor_agent_id');
  const current = store.db.prepare('SELECT * FROM chapter_definitions WHERE chapter_id = ?').get(chapterId);
  const status = optionalString(args.status) ?? current?.status ?? 'active';

  store.db.prepare(`
    INSERT INTO chapter_definitions (
      chapter_id, title, owner_agent_id, status, summary_markdown,
      source_kind, source_ref, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(chapter_id) DO UPDATE SET
      title = excluded.title,
      owner_agent_id = excluded.owner_agent_id,
      status = excluded.status,
      summary_markdown = excluded.summary_markdown,
      source_kind = excluded.source_kind,
      source_ref = excluded.source_ref,
      updated_at = excluded.updated_at
  `).run(
    chapterId,
    title,
    optionalString(args.owner_agent_id) ?? current?.owner_agent_id ?? null,
    status,
    optionalString(args.summary_markdown) ?? current?.summary_markdown ?? null,
    optionalString(args.source_kind) ?? current?.source_kind ?? 'mcp',
    optionalString(args.source_ref) ?? current?.source_ref ?? null,
    current?.created_by ?? actor,
    current?.created_at ?? now,
    now,
  );

  return {
    schema: 'narada.task.chapter.definition.v0',
    status: current ? 'updated' : 'created',
    chapter: readChapter(store, chapterId),
  };
}

export function addChapterTask(store, args) {
  ensureChapterLifecycleTables(store);
  const now = new Date().toISOString();
  const chapterId = requiredString(args.chapter_id, 'chapter_id');
  const actor = requiredString(args.actor_agent_id, 'actor_agent_id');
  const taskNumber = requiredNumber(args.task_number, 'task_number');
  if (!readChapterDefinition(store, chapterId)) throw new Error(`chapter_not_found: ${chapterId}`);
  const lifecycle = store.getLifecycleByNumber(taskNumber);
  if (!lifecycle) throw new Error(`task_not_found: ${taskNumber}`);
  const current = store.db.prepare('SELECT * FROM chapter_memberships WHERE chapter_id = ? AND task_id = ?').get(chapterId, lifecycle.task_id);
  const orderIndex = Number.isFinite(Number(args.order_index))
    ? Number(args.order_index)
    : current?.order_index ?? nextOrderIndex(store, chapterId);

  store.db.prepare(`
    INSERT INTO chapter_memberships (
      chapter_id, task_id, task_number, order_index, membership_kind,
      note_markdown, source_kind, source_ref, added_by, added_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(chapter_id, task_id) DO UPDATE SET
      task_number = excluded.task_number,
      order_index = excluded.order_index,
      membership_kind = excluded.membership_kind,
      note_markdown = excluded.note_markdown,
      source_kind = excluded.source_kind,
      source_ref = excluded.source_ref,
      updated_at = excluded.updated_at
  `).run(
    chapterId,
    lifecycle.task_id,
    taskNumber,
    orderIndex,
    optionalString(args.membership_kind) ?? current?.membership_kind ?? 'primary',
    optionalString(args.note_markdown) ?? current?.note_markdown ?? null,
    optionalString(args.source_kind) ?? current?.source_kind ?? 'mcp',
    optionalString(args.source_ref) ?? current?.source_ref ?? null,
    current?.added_by ?? actor,
    current?.added_at ?? now,
    now,
  );

  return {
    schema: 'narada.task.chapter.membership.v0',
    status: current ? 'updated' : 'added',
    chapter: readChapter(store, chapterId),
  };
}

export function listChapters(store, { limit = 50 } = {}) {
  ensureChapterLifecycleTables(store);
  const bounded = Math.max(1, Math.min(Number(limit) || 50, 100));
  const rows = store.db.prepare(`
    SELECT * FROM chapter_definitions
    ORDER BY updated_at DESC, chapter_id
    LIMIT ?
  `).all(bounded);
  return {
    schema: 'narada.task.chapter.list.v0',
    status: 'ok',
    count: rows.length,
    chapters: rows.map((row) => {
      const chapter = readChapter(store, row.chapter_id);
      const { members, ...summary } = chapter;
      return summary;
    }),
  };
}

export function showChapter(store, args) {
  ensureChapterLifecycleTables(store);
  const chapterId = requiredString(args.chapter_id, 'chapter_id');
  const chapter = readChapter(store, chapterId, { includeSources: Boolean(args.include_sources) });
  if (!chapter) throw new Error(`chapter_not_found: ${chapterId}`);
  return { schema: 'narada.task.chapter.show.v0', status: 'ok', chapter };
}

export function importChapterMarkdownIndex(store, args) {
  ensureChapterLifecycleTables(store);
  const chapterId = requiredString(args.chapter_id, 'chapter_id');
  const actor = requiredString(args.actor_agent_id, 'actor_agent_id');
  const path = requiredString(args.path, 'path');
  const text = readFileSync(path, 'utf8');
  upsertChapterDefinition(store, {
    chapter_id: chapterId,
    title: requiredString(args.title, 'title'),
    owner_agent_id: optionalString(args.owner_agent_id),
    summary_markdown: optionalString(args.summary_markdown),
    source_kind: 'markdown_index_import',
    source_ref: path,
    actor_agent_id: actor,
  });
  const taskNumbers = extractTaskNumbers(text);
  const imported = [];
  for (const [index, taskNumber] of taskNumbers.entries()) {
    const lifecycle = store.getLifecycleByNumber(taskNumber);
    if (!lifecycle) {
      imported.push({ task_number: taskNumber, status: 'missing_task' });
      continue;
    }
    addChapterTask(store, {
      chapter_id: chapterId,
      task_number: taskNumber,
      order_index: index + 1,
      membership_kind: 'imported_index_member',
      source_kind: 'markdown_index_import',
      source_ref: path,
      actor_agent_id: actor,
    });
    imported.push({ task_number: taskNumber, status: 'imported' });
  }
  const sourceRecordId = `chapter-source-${randomUUID()}`;
  store.db.prepare(`
    INSERT INTO chapter_source_records (
      source_record_id, chapter_id, source_kind, source_ref,
      imported_text, imported_by, imported_at, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(sourceRecordId, chapterId, 'markdown_index_import', path, text, actor, new Date().toISOString(), JSON.stringify({ task_numbers: taskNumbers, imported }));
  return {
    schema: 'narada.task.chapter.markdown_import.v0',
    status: 'imported',
    chapter: readChapter(store, chapterId, { includeSources: true }),
    source_record_id: sourceRecordId,
    task_numbers: taskNumbers,
    imported,
    preservation: { raw_markdown_preserved: true, source_table: 'chapter_source_records' },
  };
}

function readChapter(store, chapterId, { includeMembers = true, includeSources = false } = {}) {
  const definition = readChapterDefinition(store, chapterId);
  if (!definition) return null;
  const members = includeMembers ? readChapterMembers(store, chapterId) : [];
  const statusProjection = computeChapterStatus(members);
  return {
    ...definition,
    status_projection: statusProjection,
    member_count: statusProjection.counts.total,
    members: includeMembers ? members : undefined,
    source_records: includeSources ? readChapterSources(store, chapterId) : undefined,
  };
}

function readChapterDefinition(store, chapterId) {
  const row = store.db.prepare('SELECT * FROM chapter_definitions WHERE chapter_id = ?').get(chapterId);
  return row ? rowToChapter(row) : null;
}

function readChapterMembers(store, chapterId) {
  const rows = store.db.prepare(`
    SELECT
      m.*,
      l.status AS task_status,
      l.updated_at AS task_updated_at,
      s.title AS task_title,
      a.agent_id AS assigned_agent
    FROM chapter_memberships m
    JOIN task_lifecycle l ON m.task_id = l.task_id
    LEFT JOIN task_specs s ON m.task_id = s.task_id
    LEFT JOIN (
      SELECT t1.task_id, t1.agent_id
      FROM task_assignments t1
      WHERE t1.released_at IS NULL
        AND t1.claimed_at = (
          SELECT MAX(t2.claimed_at)
          FROM task_assignments t2
          WHERE t2.task_id = t1.task_id AND t2.released_at IS NULL
        )
    ) a ON m.task_id = a.task_id
    WHERE m.chapter_id = ?
    ORDER BY m.order_index ASC, m.task_number ASC
  `).all(chapterId);
  return rows.map(rowToMember);
}

function readChapterSources(store, chapterId) {
  return store.db.prepare(`
    SELECT source_record_id, source_kind, source_ref, imported_by, imported_at, metadata_json
    FROM chapter_source_records
    WHERE chapter_id = ?
    ORDER BY imported_at DESC
  `).all(chapterId).map((row) => ({
    source_record_id: row.source_record_id,
    source_kind: row.source_kind,
    source_ref: row.source_ref,
    imported_by: row.imported_by,
    imported_at: row.imported_at,
    metadata: parseJson(row.metadata_json, {}),
  }));
}

function computeChapterStatus(members) {
  const counts = { total: members.length, open: 0, terminal: 0, blocked: 0, deferred: 0, other: 0 };
  for (const member of members) {
    if (BLOCKED_STATUSES.has(member.task.status)) {
      counts.blocked += 1;
      if (member.task.status === 'deferred') counts.deferred += 1;
    } else if (OPEN_STATUSES.has(member.task.status)) counts.open += 1;
    else if (TERMINAL_STATUSES.has(member.task.status)) counts.terminal += 1;
    else counts.other += 1;
  }
  const residuals = collectChapterResiduals(members);
  const status = counts.total === 0
    ? 'empty'
    : counts.blocked > 0
      ? 'blocked'
      : counts.open > 0
        ? 'active'
        : counts.terminal === counts.total && residuals.length > 0
          ? 'ready_with_residuals'
          : counts.terminal === counts.total
            ? 'terminal_complete'
            : 'mixed';
  const legacyStatus = counts.total === 0
    ? 'empty'
    : counts.terminal === counts.total
      ? 'complete'
      : counts.open > 0
        ? 'active'
        : counts.deferred > 0
          ? 'deferred'
          : 'mixed';
  return {
    schema: 'narada.task.chapter.status_projection.v1',
    status,
    legacy_status: legacyStatus,
    bounded_completion: buildBoundedCompletionAffordance({ status, counts, residuals }),
    counts,
    residuals,
    residual_count: residuals.length,
    status_vocabulary: ['empty', 'terminal_complete', 'ready_with_residuals', 'active', 'blocked', 'mixed'],
    authority: 'read_model_from_task_lifecycle_membership',
    task_statuses_drive_projection: true,
  };
}

function buildBoundedCompletionAffordance({ status, counts, residuals }) {
  const residualList = Array.isArray(residuals) ? residuals : [];
  if (status === 'terminal_complete') {
    return {
      schema: 'narada.task.chapter.bounded_completion.v0',
      claim: 'terminal_complete',
      can_claim_bounded_completion: true,
      can_claim_terminal_complete: true,
      scope_required: false,
      residual_count: 0,
      residuals: [],
      guidance: 'All member tasks are terminal and no residuals are recorded.',
      overclaim_refusal: null,
    };
  }
  if (status === 'ready_with_residuals') {
    return {
      schema: 'narada.task.chapter.bounded_completion.v0',
      claim: 'complete_for_scope',
      can_claim_bounded_completion: true,
      can_claim_terminal_complete: false,
      scope_required: true,
      residual_count: residualList.length,
      residuals: residualList,
      guidance: 'Report bounded User-Site tooling completion for the named scope and preserve the residual list; do not claim terminal_complete.',
      overclaim_refusal: 'terminal_complete_refused_while_residuals_remain',
    };
  }
  const blockerCount = Number(counts?.blocked ?? 0);
  return {
    schema: 'narada.task.chapter.bounded_completion.v0',
    claim: status === 'blocked' ? 'blocked' : 'not_complete',
    can_claim_bounded_completion: false,
    can_claim_terminal_complete: false,
    scope_required: false,
    residual_count: residualList.length,
    residuals: residualList,
    guidance: blockerCount > 0
      ? 'Residual blockers remain; complete_for_scope and terminal_complete are both refused until blockers are resolved or explicitly scoped out.'
      : 'Chapter is not complete for scope yet.',
    overclaim_refusal: blockerCount > 0
      ? 'completion_claim_refused_while_blockers_remain'
      : 'completion_claim_refused_until_all_scope_members_terminal',
  };
}

function collectChapterResiduals(members) {
  const residuals = [];
  for (const member of members) {
    const text = [
      member.membership_kind,
      member.note_markdown,
      member.source_kind,
      member.source_ref,
      member.task.title,
    ].filter(Boolean).join('\n');
    for (const kind of residualKindsFromText(text)) {
      residuals.push({
        kind,
        task_number: member.task_number,
        task_id: member.task_id,
        source: residualSourceForKind(kind),
        evidence: truncateEvidence(text),
      });
    }
  }
  return residuals;
}

function residualKindsFromText(value) {
  const kinds = [];
  const text = String(value ?? '');
  if (/\b(exclusion|excluded|scope[- ]?exclusion|out[- ]of[- ]scope)\b/i.test(text)) {
    kinds.push('exclusion');
  }
  if (/\b(same[-_ ]?(?:agent|operator)|single[-_ ]operator)\b.{0,80}\breview\b|\bsingle_operator_review\b/i.test(text)) {
    kinds.push('same_agent_review_limitation');
  }
  if (/\bfuture[-_ ]pressure\b|\bdesign candidate\b|\bfuture[-_ ]pressure design\b|\bcandidate\b.{0,40}\bfuture\b/i.test(text)) {
    kinds.push('future_pressure_design_candidate');
  }
  return kinds;
}

function residualSourceForKind(kind) {
  if (kind === 'exclusion') return 'membership_note_or_kind';
  if (kind === 'same_agent_review_limitation') return 'review_limitation_note';
  if (kind === 'future_pressure_design_candidate') return 'future_pressure_note';
  return 'membership_note';
}

function truncateEvidence(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
}

function nextOrderIndex(store, chapterId) {
  const row = store.db.prepare('SELECT COALESCE(MAX(order_index), 0) + 1 AS next_order FROM chapter_memberships WHERE chapter_id = ?').get(chapterId);
  return Number(row?.next_order ?? 1);
}

function extractTaskNumbers(text) {
  const seen = new Set();
  const numbers = [];
  for (const match of String(text).matchAll(/(?:#|task\s+)(\d{1,7})\b/gi)) {
    const value = Number(match[1]);
    if (!Number.isInteger(value) || seen.has(value)) continue;
    seen.add(value);
    numbers.push(value);
  }
  return numbers;
}

function rowToChapter(row) {
  return {
    chapter_id: row.chapter_id,
    title: row.title,
    owner_agent_id: row.owner_agent_id ?? null,
    lifecycle_status: row.status,
    summary_markdown: row.summary_markdown ?? null,
    source_kind: row.source_kind,
    source_ref: row.source_ref ?? null,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToMember(row) {
  return {
    chapter_id: row.chapter_id,
    task_id: row.task_id,
    task_number: Number(row.task_number),
    order_index: Number(row.order_index),
    membership_kind: row.membership_kind,
    note_markdown: row.note_markdown ?? null,
    source_kind: row.source_kind,
    source_ref: row.source_ref ?? null,
    added_by: row.added_by,
    added_at: row.added_at,
    updated_at: row.updated_at,
    task: {
      task_id: row.task_id,
      task_number: Number(row.task_number),
      title: row.task_title ?? '(untitled)',
      status: row.task_status,
      assigned_agent: row.assigned_agent ?? null,
      updated_at: row.task_updated_at,
    },
  };
}

function requiredString(value, name) {
  const text = optionalString(value);
  if (!text) throw new Error(`${name}_required`);
  return text;
}

function optionalString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function requiredNumber(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number)) throw new Error(`${name}_required`);
  return number;
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
