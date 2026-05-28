import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildMutationEvidenceRecord,
  serializeMutationEvidenceRecord,
  type MutationEvidenceAuthorityClass,
} from '@narada2/task-governance/mutation-evidence';
import {
  findTaskFile,
  readTaskFile,
} from './task-governance.js';
import {
  openTaskLifecycleStore,
  type TaskLifecycleRow,
  type TaskLifecycleStore,
} from './task-lifecycle-store.js';
import { governanceFreshnessEvidence } from './governance-freshness.js';

export interface TaskLifecycleEvidenceState {
  task_id: string;
  task_number: number;
  status: string | null;
  governed_by?: string | null;
  closed_at?: string | null;
  closed_by?: string | null;
  closure_mode?: string | null;
  reopened_at?: string | null;
  reopened_by?: string | null;
  updated_at?: string | null;
  source: 'sqlite' | 'task_artifact';
}

export interface WriteTaskLifecycleMutationEvidenceOptions {
  cwd: string;
  taskNumber: string | number | undefined;
  command: string;
  principal: string | undefined;
  authorityClass: MutationEvidenceAuthorityClass;
  before: TaskLifecycleEvidenceState | null;
  after: TaskLifecycleEvidenceState | null;
  result: unknown;
  occurredAt?: string | null;
}

export async function captureTaskLifecycleEvidenceState(
  cwd: string,
  taskNumber: string | number | undefined,
  store?: TaskLifecycleStore,
): Promise<TaskLifecycleEvidenceState | null> {
  const parsedNumber = Number(taskNumber);
  if (!Number.isFinite(parsedNumber)) return null;

  const fromProvidedStore = store?.getLifecycleByNumber(parsedNumber);
  if (fromProvidedStore) return lifecycleRowToEvidenceState(fromProvidedStore);

  if (!store) {
    const ownedStore = openTaskLifecycleStore(cwd);
    try {
      const row = ownedStore.getLifecycleByNumber(parsedNumber);
      if (row) return lifecycleRowToEvidenceState(row);
    } finally {
      ownedStore.db.close();
    }
  }

  const taskFile = await findTaskFile(cwd, String(parsedNumber));
  if (!taskFile) return null;
  const { frontMatter } = await readTaskFile(taskFile.path);
  return {
    task_id: taskFile.taskId,
    task_number: parsedNumber,
    status: typeof frontMatter.status === 'string' ? frontMatter.status : null,
    governed_by: stringOrNull(frontMatter.governed_by),
    closed_at: stringOrNull(frontMatter.closed_at),
    closed_by: stringOrNull(frontMatter.closed_by),
    closure_mode: stringOrNull(frontMatter.closure_mode),
    reopened_at: stringOrNull(frontMatter.reopened_at),
    reopened_by: stringOrNull(frontMatter.reopened_by),
    updated_at: null,
    source: 'task_artifact',
  };
}

export async function writeTaskLifecycleMutationEvidence(
  options: WriteTaskLifecycleMutationEvidenceOptions,
): Promise<{ operation_id: string; path: string; wrote: boolean } | null> {
  const taskNumber = options.after?.task_number ?? options.before?.task_number ?? Number(options.taskNumber);
  if (!Number.isFinite(taskNumber)) return null;
  const taskId = options.after?.task_id ?? options.before?.task_id ?? `task:${taskNumber}`;
  const occurredAt = options.occurredAt ?? extractTimestamp(options.result) ?? options.after?.updated_at ?? new Date().toISOString();
  const resultSummary = summarizeCommandResult(options.result);
  const freshness = governanceFreshnessEvidence(options.command);
  const record = buildMutationEvidenceRecord({
    family: 'task_lifecycle',
    authority_class: options.authorityClass,
    command: options.command,
    locus: options.cwd,
    principal: options.principal?.trim() || 'operator',
    subject: {
      kind: 'task',
      id: taskId,
      number: taskNumber,
    },
    before: options.before ? { ...options.before } : null,
    after: options.after ? { ...options.after } : null,
    occurred_at: occurredAt,
    confirmation: {
      kind: 'read_back',
      status: options.after ? 'confirmed' : 'pending',
      detail: options.after
        ? `task ${taskNumber} read back as ${options.after.status ?? 'unknown'} from ${options.after.source}`
        : 'task lifecycle read-back unavailable after command',
    },
    replay_payload: {
      task_id: taskId,
      task_number: taskNumber,
      before_status: options.before?.status ?? null,
      after_status: options.after?.status ?? null,
      transition: taskLifecycleTransitionEvidence(options),
      command_result: resultSummary,
      ...(freshness ? { governance_freshness: freshness } : {}),
    },
  });

  const dir = join(options.cwd, '.ai', 'mutation-evidence', 'task_lifecycle');
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${record.operation_id}.json`);
  const body = serializeMutationEvidenceRecord(record);
  const existing = await readExisting(path);
  if (existing === body) {
    return { operation_id: record.operation_id, path, wrote: false };
  }
  await writeFile(path, body, { flag: 'wx' });
  return { operation_id: record.operation_id, path, wrote: true };
}

function taskLifecycleTransitionEvidence(options: WriteTaskLifecycleMutationEvidenceOptions): Record<string, unknown> {
  return {
    family: 'task_lifecycle',
    command: options.command,
    authority_class: options.authorityClass,
    subject_id: options.after?.task_id ?? options.before?.task_id ?? null,
    subject_number: options.after?.task_number ?? options.before?.task_number ?? Number(options.taskNumber),
    source_status: options.before?.status ?? null,
    target_status: options.after?.status ?? null,
    source_kind: options.before?.source ?? null,
    target_kind: options.after?.source ?? null,
    source_governed_by: options.before?.governed_by ?? null,
    target_governed_by: options.after?.governed_by ?? null,
    source_closed_by: options.before?.closed_by ?? null,
    target_closed_by: options.after?.closed_by ?? null,
    source_closure_mode: options.before?.closure_mode ?? null,
    target_closure_mode: options.after?.closure_mode ?? null,
    normalized: true,
  };
}

function lifecycleRowToEvidenceState(row: TaskLifecycleRow): TaskLifecycleEvidenceState {
  return {
    task_id: row.task_id,
    task_number: row.task_number,
    status: row.status,
    governed_by: row.governed_by,
    closed_at: row.closed_at,
    closed_by: row.closed_by,
    closure_mode: row.closure_mode ?? null,
    reopened_at: row.reopened_at,
    reopened_by: row.reopened_by,
    updated_at: row.updated_at,
    source: 'sqlite',
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

async function readExisting(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function extractTimestamp(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const record = result as Record<string, unknown>;
  const keys = ['claimed_at', 'reported_at', 'reviewed_at', 'closed_at', 'reopened_at', 'released_at', 'confirmed_at', 'finished_at'];
  for (const key of keys) {
    if (typeof record[key] === 'string') return String(record[key]);
  }
  return null;
}

function summarizeCommandResult(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return { value: result };
  const record = result as Record<string, unknown>;
  const summary: Record<string, unknown> = {};
  for (const key of [
    'status',
    'task_id',
    'task_number',
    'agent_id',
    'closed_by',
    'reviewer_agent_id',
    'report_id',
    'review_id',
    'assignment_intent_id',
    'previous_status',
    'new_status',
    'completion_mode',
    'evidence_verdict',
    'close_action',
    'release_reason',
    'role_guard_override',
  ]) {
    if (key in record) summary[key] = record[key];
  }
  return summary;
}
