import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  buildMutationEvidenceRecord,
  validateMutationEvidenceRecord,
  type MutationEvidenceRecord,
} from '@narada2/task-governance-core/mutation-evidence';
import { SqliteInboxStore, type InboxEnvelope } from '@narada2/control-plane';
import { ExitCode } from '../lib/exit-codes.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import {
  openTaskLifecycleStore,
  type TaskLifecycleRow,
  type TaskStatus,
} from '../lib/task-lifecycle-store.js';

export interface MutationEvidenceReconcileOptions {
  cwd?: string;
  format?: CliFormat;
  evidenceDir?: string;
  family?: string;
  apply?: boolean;
  limit?: number;
}

interface ReconcileFinding {
  operation_id: string;
  family: string;
  subject_id: string;
  status: 'current' | 'missing' | 'stale' | 'applied' | 'malformed' | 'duplicate' | 'conflict' | 'unsupported';
  detail: string;
  file?: string;
}

export async function mutationEvidenceReconcileCommand(
  options: MutationEvidenceReconcileOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const evidenceDir = resolve(cwd, options.evidenceDir ?? join('.ai', 'mutation-evidence'));
  const family = parseFamily(options.family);
  if (options.family && !family) {
    return errorResult(`Invalid --family: ${options.family}`);
  }
  const apply = Boolean(options.apply);
  const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
  const files = await listEvidenceFiles(evidenceDir, family);
  const seen = new Map<string, string>();
  const findings: ReconcileFinding[] = [];
  let valid = 0;
  let applied = 0;

  const taskStore = openTaskLifecycleStore(cwd);
  const inboxStore = new SqliteInboxStore(join(cwd, '.ai', 'inbox.db'));
  try {
    for (const file of files) {
      const parsed = await readEvidenceRecord(file);
      if (parsed instanceof Error) {
        findings.push({ operation_id: 'unknown', family: 'unknown', subject_id: file, status: 'malformed', detail: parsed.message, file });
        continue;
      }
      const validation = validateEvidence(parsed);
      if (validation.length > 0) {
        findings.push({
          operation_id: parsed.operation_id ?? 'unknown',
          family: String(parsed.family ?? 'unknown'),
          subject_id: parsed.subject?.id ?? file,
          status: 'malformed',
          detail: validation.join('; '),
          file,
        });
        continue;
      }
      if (seen.has(parsed.operation_id)) {
        findings.push({
          operation_id: parsed.operation_id,
          family: parsed.family,
          subject_id: parsed.subject.id,
          status: 'duplicate',
          detail: `duplicate operation id also seen in ${seen.get(parsed.operation_id)}`,
          file,
        });
        continue;
      }
      seen.set(parsed.operation_id, file);
      valid += 1;

      const finding = parsed.family === 'task_lifecycle'
        ? reconcileTaskLifecycle(parsed, taskStore, apply)
        : parsed.family === 'inbox'
          ? reconcileInbox(parsed, inboxStore, apply)
          : unsupportedFinding(parsed);
      if (finding.status === 'applied') applied += 1;
      findings.push({ ...finding, file });
    }
  } finally {
    taskStore.db.close();
    inboxStore.close();
  }

  const counts = countFindings(findings);
  return {
    exitCode: counts.malformed > 0 || counts.conflict > 0 ? ExitCode.GENERAL_ERROR : ExitCode.SUCCESS,
    result: formattedResult(
      {
        status: counts.malformed > 0 || counts.conflict > 0 ? 'error' : 'success',
        mode: apply ? 'apply' : 'dry_run',
        evidence_dir: evidenceDir,
        scanned: files.length,
        valid,
        applied,
        counts,
        findings: findings.slice(0, limit),
        truncated_findings: Math.max(0, findings.length - limit),
        next_commands: apply
          ? ['narada task lifecycle export --output .ai/task-lifecycle-snapshot.json']
          : ['narada mutation-evidence reconcile --apply'],
      },
      [
        `Mutation evidence reconcile: ${apply ? 'apply' : 'dry-run'}`,
        `Scanned: ${files.length}`,
        `Valid: ${valid}`,
        `Applied: ${applied}`,
        `Findings: ${findings.length}${findings.length > limit ? ` (${findings.length - limit} truncated)` : ''}`,
        ...findings.slice(0, limit).map((finding) =>
          `${finding.status} ${finding.family} ${finding.subject_id}: ${finding.detail}`),
      ],
      options.format ?? 'auto',
    ),
  };
}

function reconcileTaskLifecycle(
  record: MutationEvidenceRecord,
  store: ReturnType<typeof openTaskLifecycleStore>,
  apply: boolean,
): ReconcileFinding {
  const after = record.after as Partial<TaskLifecycleRow> | null;
  if (!after?.task_id || typeof after.task_number !== 'number' || !after.status) {
    return malformedFinding(record, 'task lifecycle evidence lacks replayable after state');
  }
  const existing = store.getLifecycle(String(after.task_id)) ?? store.getLifecycleByNumber(Number(after.task_number));
  if (existing && existing.status === after.status) {
    return currentFinding(record, `status=${existing.status}`);
  }
  if (existing && existing.updated_at > record.occurred_at) {
    return currentFinding(record, `local status=${existing.status}; evidence after=${after.status} superseded by newer local lifecycle state`);
  }
  if (existing && record.before && typeof record.before.status === 'string' && existing.status !== record.before.status && existing.status !== after.status) {
    return conflictFinding(record, `local status=${existing.status}; expected before=${record.before.status} or after=${after.status}`);
  }
  if (!apply) {
    return {
      operation_id: record.operation_id,
      family: record.family,
      subject_id: record.subject.id,
      status: existing ? 'stale' : 'missing',
      detail: existing ? `local status=${existing.status}; evidence after=${after.status}` : 'missing local lifecycle row',
    };
  }
  store.upsertLifecycle({
    task_id: String(after.task_id),
    task_number: Number(after.task_number),
    status: String(after.status) as TaskStatus,
    governed_by: stringOrNull(after.governed_by),
    closed_at: stringOrNull(after.closed_at),
    closed_by: stringOrNull(after.closed_by),
    closure_mode: after.closure_mode ?? null,
    reopened_at: stringOrNull(after.reopened_at),
    reopened_by: stringOrNull(after.reopened_by),
    continuation_packet_json: typeof after.continuation_packet_json === 'string' ? after.continuation_packet_json : null,
    updated_at: typeof after.updated_at === 'string' ? after.updated_at : record.occurred_at,
  });
  return appliedFinding(record, `task lifecycle status=${after.status}`);
}

function reconcileInbox(
  record: MutationEvidenceRecord,
  store: SqliteInboxStore,
  apply: boolean,
): ReconcileFinding {
  const envelope = replayEnvelope(record);
  if (!envelope) return malformedFinding(record, 'inbox evidence lacks replay_payload.envelope');
  const existing = store.get(envelope.envelope_id);
  if (existing && existing.status === envelope.status) {
    return currentFinding(record, `status=${existing.status}`);
  }
  if (existing && record.before && typeof record.before.status === 'string' && existing.status !== record.before.status && existing.status !== envelope.status) {
    return conflictFinding(record, `local status=${existing.status}; expected before=${record.before.status} or after=${envelope.status}`);
  }
  if (!apply) {
    return {
      operation_id: record.operation_id,
      family: record.family,
      subject_id: record.subject.id,
      status: existing ? 'stale' : 'missing',
      detail: existing ? `local status=${existing.status}; evidence after=${envelope.status}` : 'missing local inbox envelope',
    };
  }
  applyInboxEnvelope(store, envelope);
  return appliedFinding(record, `inbox status=${envelope.status}`);
}

function applyInboxEnvelope(store: SqliteInboxStore, envelope: InboxEnvelope): void {
  const existing = store.get(envelope.envelope_id);
  if (!existing) {
    store.insert({
      envelope_id: envelope.envelope_id,
      received_at: envelope.received_at,
      source: envelope.source,
      kind: envelope.kind,
      authority: envelope.authority,
      payload: envelope.payload,
    });
  }
  if (envelope.status === 'handling' && envelope.handling) {
    if (store.get(envelope.envelope_id)?.status === 'received') {
      store.claim(envelope.envelope_id, envelope.handling);
    }
    return;
  }
  if (envelope.status === 'archived') {
    store.archive(envelope.envelope_id, envelope.promotion ?? {
      target_kind: 'archive',
      target_ref: `archive:${envelope.envelope_id}`,
      promoted_at: new Date().toISOString(),
      promoted_by: 'mutation-evidence reconcile',
      enactment_status: 'recorded',
    });
    return;
  }
  if (envelope.status === 'promoted' && envelope.promotion) {
    store.promote(envelope.envelope_id, envelope.promotion);
    return;
  }
  if (envelope.status === 'received' && store.get(envelope.envelope_id)?.status === 'handling') {
    const by = store.get(envelope.envelope_id)?.handling?.handled_by;
    if (by) store.release(envelope.envelope_id, by);
  }
}

async function listEvidenceFiles(evidenceDir: string, family: 'task_lifecycle' | 'inbox' | null): Promise<string[]> {
  const families = family ? [family] : ['task_lifecycle', 'inbox'] as const;
  const files: string[] = [];
  for (const item of families) {
    const dir = join(evidenceDir, item);
    const names = await readdir(dir).catch(() => []);
    for (const name of names.filter((entry) => entry.endsWith('.json')).sort()) {
      files.push(join(dir, name));
    }
  }
  return files;
}

async function readEvidenceRecord(path: string): Promise<MutationEvidenceRecord | Error> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as MutationEvidenceRecord;
  } catch (error) {
    return new Error(error instanceof Error ? error.message : String(error));
  }
}

function validateEvidence(record: MutationEvidenceRecord): string[] {
  const errors = validateMutationEvidenceRecord(record).map((error) => `${error.field}: ${error.message}`);
  if (errors.length > 0) return errors;
  const rebuilt = buildMutationEvidenceRecord({
    family: record.family,
    authority_class: record.authority_class,
    command: record.command,
    locus: record.locus,
    principal: record.principal,
    subject: record.subject,
    before: record.before,
    after: record.after,
    occurred_at: record.occurred_at,
    confirmation: record.confirmation,
    replay_payload: record.replay_payload,
  });
  if (rebuilt.operation_id !== record.operation_id) {
    errors.push(`operation_id mismatch: expected ${rebuilt.operation_id}`);
  }
  return errors;
}

function replayEnvelope(record: MutationEvidenceRecord): InboxEnvelope | null {
  const envelope = record.replay_payload.envelope;
  return envelope && typeof envelope === 'object' && !Array.isArray(envelope)
    ? envelope as InboxEnvelope
    : null;
}

function countFindings(findings: ReconcileFinding[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const finding of findings) counts[finding.status] = (counts[finding.status] ?? 0) + 1;
  return counts;
}

function parseFamily(value: string | undefined): 'task_lifecycle' | 'inbox' | null {
  if (!value) return null;
  return value === 'task_lifecycle' || value === 'inbox' ? value : null;
}

function currentFinding(record: MutationEvidenceRecord, detail: string): ReconcileFinding {
  return { operation_id: record.operation_id, family: record.family, subject_id: record.subject.id, status: 'current', detail };
}

function appliedFinding(record: MutationEvidenceRecord, detail: string): ReconcileFinding {
  return { operation_id: record.operation_id, family: record.family, subject_id: record.subject.id, status: 'applied', detail };
}

function malformedFinding(record: MutationEvidenceRecord, detail: string): ReconcileFinding {
  return { operation_id: record.operation_id, family: record.family, subject_id: record.subject.id, status: 'malformed', detail };
}

function conflictFinding(record: MutationEvidenceRecord, detail: string): ReconcileFinding {
  return { operation_id: record.operation_id, family: record.family, subject_id: record.subject.id, status: 'conflict', detail };
}

function unsupportedFinding(record: MutationEvidenceRecord): ReconcileFinding {
  return { operation_id: record.operation_id, family: record.family, subject_id: record.subject.id, status: 'unsupported', detail: `unsupported family ${record.family}` };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function errorResult(error: string): { exitCode: ExitCode; result: unknown } {
  return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error } };
}
