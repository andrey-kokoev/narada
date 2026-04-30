import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateMutationEvidenceRecord, type MutationEvidenceRecord } from '@narada2/task-governance/mutation-evidence';
import {
  inboxExportCommand,
  inboxImportCommand,
  inboxPendingCommand,
  inboxPromoteCommand,
  inboxSubmitCommand,
  inboxTaskCommand,
  inboxTriageCommand,
} from '../../src/commands/inbox.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

describe('inbox mutation evidence', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-inbox-mutation-evidence-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('emits submit evidence with received read-back state', async () => {
    const submitted = await submitEnvelope(tempDir, 'proposal', { title: 'Captured proposal' });

    expect(submitted.exitCode).toBe(ExitCode.SUCCESS);
    const envelope = (submitted.result as { envelope: { envelope_id: string } }).envelope;
    const evidence = findEvidence(tempDir, 'inbox submit', envelope.envelope_id);
    expect(evidence.authority_class).toBe('claim');
    expect(evidence.before).toBeNull();
    expect(evidence.after).toMatchObject({ status: 'received', kind: 'proposal' });
    expect(evidence.confirmation).toMatchObject({ kind: 'read_back', status: 'confirmed' });
  });

  it('emits archive triage evidence without target-zone mutation', async () => {
    const submitted = await submitEnvelope(tempDir, 'observation', { note: 'No action' });
    const envelope = (submitted.result as { envelope: { envelope_id: string } }).envelope;

    const archived = await inboxTriageCommand({
      cwd: tempDir,
      format: 'json',
      envelopeId: envelope.envelope_id,
      action: 'archive',
      by: 'operator',
    });

    expect(archived.exitCode).toBe(ExitCode.SUCCESS);
    const evidence = findEvidence(tempDir, 'inbox promote archive', envelope.envelope_id);
    expect(evidence.before).toMatchObject({ status: 'received' });
    expect(evidence.after).toMatchObject({
      status: 'archived',
      promotion_target_kind: 'archive',
    });
    expect((evidence.replay_payload.command_result as { target_mutation?: boolean }).target_mutation).toBe(false);
  });

  it('emits pending crossing evidence without enactment authority', async () => {
    const submitted = await submitEnvelope(tempDir, 'proposal', { title: 'Maybe site change' });
    const envelope = (submitted.result as { envelope: { envelope_id: string } }).envelope;

    const pending = await inboxPendingCommand({
      cwd: tempDir,
      format: 'json',
      envelopeId: envelope.envelope_id,
      to: 'site_config_change:site:desktop-sunroom-2',
      by: 'operator',
    });

    expect(pending.exitCode).toBe(ExitCode.SUCCESS);
    const evidence = findEvidence(tempDir, 'inbox promote pending', envelope.envelope_id);
    expect(evidence.after).toMatchObject({
      status: 'promoted',
      promotion_target_kind: 'site_config_change',
      promotion_target_ref: 'site:desktop-sunroom-2',
      promotion_enactment_status: 'pending',
    });
  });

  it('normalizes task pending targets without duplicating the task prefix', async () => {
    setupRepo(tempDir);
    const submitted = await submitEnvelope(tempDir, 'proposal', { title: 'Maybe task follow-up' });
    const envelope = (submitted.result as { envelope: { envelope_id: string } }).envelope;

    const pending = await inboxPendingCommand({
      cwd: tempDir,
      format: 'json',
      envelopeId: envelope.envelope_id,
      to: 'task:100',
      by: 'operator',
    });

    expect(pending.exitCode).toBe(ExitCode.SUCCESS);
    const promoted = (pending.result as { envelope: { promotion: { target_kind: string; target_ref: string } } }).envelope;
    expect(promoted.promotion).toMatchObject({
      target_kind: 'task',
      target_ref: '100',
    });
    const evidence = findEvidence(tempDir, 'inbox promote task target', envelope.envelope_id);
    expect(evidence.after).toMatchObject({
      promotion_target_kind: 'task',
      promotion_target_ref: '100',
    });
  });

  it('emits task promotion evidence after creating target task', async () => {
    setupRepo(tempDir);
    const submitted = await submitEnvelope(tempDir, 'task_candidate', {
      title: 'Promoted task',
      goal: 'Handle promoted task.',
      acceptance_criteria: ['Task created from inbox envelope.'],
    });
    const envelope = (submitted.result as { envelope: { envelope_id: string } }).envelope;

    const promoted = await inboxTaskCommand({
      cwd: tempDir,
      format: 'json',
      envelopeId: envelope.envelope_id,
      by: 'operator',
    });

    expect(promoted.exitCode).toBe(ExitCode.SUCCESS);
    const evidence = findEvidence(tempDir, 'inbox promote task', envelope.envelope_id);
    expect(evidence.after).toMatchObject({
      status: 'promoted',
      promotion_target_kind: 'task',
      promotion_enactment_status: 'enacted',
    });
    expect((evidence.replay_payload.command_result as { target_mutation?: boolean }).target_mutation).toBe(true);
  });

  it('emits import replay evidence without fabricating new mutation authority', async () => {
    const sourceDir = mkdtempSync(join(tmpdir(), 'narada-inbox-mutation-source-'));
    try {
      const submitted = await submitEnvelope(sourceDir, 'observation', { note: 'Portable envelope' });
      expect(submitted.exitCode).toBe(ExitCode.SUCCESS);
      const exported = await inboxExportCommand({ cwd: sourceDir, format: 'json' });
      expect(exported.exitCode).toBe(ExitCode.SUCCESS);

      const imported = await inboxImportCommand({
        cwd: tempDir,
        format: 'json',
        fromDir: join(sourceDir, '.ai', 'inbox-envelopes'),
      });

      expect(imported.exitCode).toBe(ExitCode.SUCCESS);
      const evidence = readEvidence(tempDir).find((record) => record.command === 'inbox import');
      expect(evidence).toBeTruthy();
      expect(evidence?.principal).toBe('import_replay');
      expect(evidence?.confirmation.kind).toBe('import_replay');
      expect(evidence?.after?.status).toBe('received');
    } finally {
      rmSync(sourceDir, { recursive: true, force: true });
    }
  });
});

async function submitEnvelope(tempDir: string, kind: string, payload: Record<string, unknown>) {
  return inboxSubmitCommand({
    cwd: tempDir,
    format: 'json',
    sourceKind: 'cli',
    sourceRef: 'manual',
    kind,
    authorityLevel: 'operator_confirmed',
    principal: 'operator',
    payload: JSON.stringify(payload),
  });
}

function setupRepo(tempDir: string): void {
  const tasksDir = join(tempDir, '.ai', 'do-not-open', 'tasks');
  mkdirSync(tasksDir, { recursive: true });
  writeFileSync(
    join(tasksDir, '20260420-100-alpha.md'),
    '---\nstatus: opened\n---\n\n# Task 100\n',
  );
}

function readEvidence(tempDir: string): MutationEvidenceRecord[] {
  const dir = join(tempDir, '.ai', 'mutation-evidence', 'inbox');
  return readdirSync(dir)
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => {
      const parsed = JSON.parse(readFileSync(join(dir, entry), 'utf8')) as MutationEvidenceRecord;
      expect(validateMutationEvidenceRecord(parsed)).toEqual([]);
      return parsed;
    });
}

function findEvidence(tempDir: string, command: string, envelopeId: string): MutationEvidenceRecord {
  const record = readEvidence(tempDir).find((item) => item.command === command && item.subject.id === envelopeId);
  if (!record) throw new Error(`missing mutation evidence for ${command} ${envelopeId}`);
  return record;
}
