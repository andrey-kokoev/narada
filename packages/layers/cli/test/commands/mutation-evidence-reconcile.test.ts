import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildMutationEvidenceRecord,
  serializeMutationEvidenceRecord,
} from '@narada2/task-governance-core/mutation-evidence';
import { SqliteInboxStore, type InboxEnvelope } from '@narada2/control-plane';
import { mutationEvidenceReconcileCommand } from '../../src/commands/mutation-evidence.js';
import { openTaskLifecycleStore } from '../../src/lib/task-lifecycle-store.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

describe('mutation evidence reconcile command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-mutation-evidence-reconcile-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('dry-runs and applies missing task lifecycle evidence idempotently', async () => {
    const record = buildTaskLifecycleEvidence({
      task_id: '20260427-123-example',
      task_number: 123,
      status: 'closed',
    });
    writeEvidence(tempDir, 'task_lifecycle', record.operation_id, serializeMutationEvidenceRecord(record));

    const dryRun = await mutationEvidenceReconcileCommand({ cwd: tempDir, format: 'json' });
    expect(dryRun.exitCode).toBe(ExitCode.SUCCESS);
    expect(dryRun.result).toMatchObject({
      mode: 'dry_run',
      counts: { missing: 1 },
    });

    const applied = await mutationEvidenceReconcileCommand({ cwd: tempDir, format: 'json', apply: true });
    expect(applied.exitCode).toBe(ExitCode.SUCCESS);
    expect(applied.result).toMatchObject({
      mode: 'apply',
      applied: 1,
      counts: { applied: 1 },
    });

    const repeated = await mutationEvidenceReconcileCommand({ cwd: tempDir, format: 'json', apply: true });
    expect(repeated.exitCode).toBe(ExitCode.SUCCESS);
    expect(repeated.result).toMatchObject({
      applied: 0,
      counts: { current: 1 },
    });

    const store = openTaskLifecycleStore(tempDir);
    try {
      expect(store.getLifecycleByNumber(123)?.status).toBe('closed');
    } finally {
      store.db.close();
    }
  });

  it('applies inbox evidence from replay envelope without merging raw SQLite', async () => {
    const envelope: InboxEnvelope = {
      envelope_id: 'env_replay',
      received_at: '2026-04-27T00:00:00.000Z',
      source: { kind: 'cli', ref: 'manual' },
      kind: 'proposal',
      authority: { level: 'operator_confirmed', principal: 'operator' },
      payload: { title: 'Replay me' },
      status: 'promoted',
      promotion: {
        target_kind: 'site_config_change',
        target_ref: 'site:desktop',
        promoted_at: '2026-04-27T00:01:00.000Z',
        promoted_by: 'operator',
        enactment_status: 'pending',
      },
    };
    const record = buildMutationEvidenceRecord({
      family: 'inbox',
      authority_class: 'resolve',
      command: 'inbox promote pending',
      locus: tempDir,
      principal: 'operator',
      subject: { kind: 'inbox_envelope', id: envelope.envelope_id, number: null },
      before: { envelope_id: envelope.envelope_id, status: 'received' },
      after: { envelope_id: envelope.envelope_id, status: 'promoted' },
      occurred_at: '2026-04-27T00:01:00.000Z',
      confirmation: { kind: 'read_back', status: 'confirmed', detail: 'read back promoted' },
      replay_payload: { envelope },
    });
    writeEvidence(tempDir, 'inbox', record.operation_id, serializeMutationEvidenceRecord(record));

    const applied = await mutationEvidenceReconcileCommand({ cwd: tempDir, format: 'json', apply: true });
    expect(applied.exitCode).toBe(ExitCode.SUCCESS);
    expect(applied.result).toMatchObject({ applied: 1 });

    const store = new SqliteInboxStore(join(tempDir, '.ai', 'inbox.db'));
    try {
      expect(store.get('env_replay')).toMatchObject({
        status: 'promoted',
        promotion: { target_kind: 'site_config_change', enactment_status: 'pending' },
      });
    } finally {
      store.close();
    }
  });

  it('refuses malformed evidence and reports duplicate operation ids', async () => {
    const record = buildTaskLifecycleEvidence({
      task_id: '20260427-124-example',
      task_number: 124,
      status: 'claimed',
    });
    writeEvidence(tempDir, 'task_lifecycle', 'a', serializeMutationEvidenceRecord(record));
    writeEvidence(tempDir, 'task_lifecycle', 'b', serializeMutationEvidenceRecord(record));
    writeEvidence(tempDir, 'inbox', 'bad', '{not-json');

    const result = await mutationEvidenceReconcileCommand({ cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
      counts: {
        duplicate: 1,
        malformed: 1,
      },
    });
  });
});

function buildTaskLifecycleEvidence(after: { task_id: string; task_number: number; status: string }) {
  return buildMutationEvidenceRecord({
    family: 'task_lifecycle',
    authority_class: 'confirm',
    command: 'task close',
    locus: tempDirForRecord(after.task_number),
    principal: 'operator',
    subject: { kind: 'task', id: after.task_id, number: after.task_number },
    before: { ...after, status: 'in_review' },
    after,
    occurred_at: '2026-04-27T00:00:00.000Z',
    confirmation: { kind: 'read_back', status: 'confirmed', detail: `status=${after.status}` },
    replay_payload: { task_id: after.task_id, task_number: after.task_number, after_status: after.status },
  });
}

function tempDirForRecord(taskNumber: number): string {
  return `/tmp/narada-mutation-evidence-test-${taskNumber}`;
}

function writeEvidence(tempDir: string, family: string, name: string, body: string): void {
  const dir = join(tempDir, '.ai', 'mutation-evidence', family);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.json`), body);
}
