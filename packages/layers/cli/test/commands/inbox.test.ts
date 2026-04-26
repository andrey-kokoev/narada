import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  inboxListCommand,
  inboxNextCommand,
  inboxPromoteCommand,
  inboxShowCommand,
  inboxSubmitCommand,
  inboxTaskCommand,
  inboxTriageCommand,
  inboxWorkNextCommand,
} from '../../src/commands/inbox.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

describe('Canonical Inbox CLI commands', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-inbox-cli-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('submits, lists, shows, and promotes an envelope', async () => {
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'diagnostic',
      sourceRef: 'site-doctor:desktop-sunroom-2',
      kind: 'observation',
      authorityLevel: 'system_observed',
      payload: JSON.stringify({ hostname: 'desktop-sunroom-2', computer_name: 'DESKTOP-SUNROOM' }),
    });

    expect(submitted.exitCode).toBe(ExitCode.SUCCESS);
    const envelope = (submitted.result as { envelope: { envelope_id: string; payload: unknown } }).envelope;
    expect(envelope.envelope_id).toMatch(/^env_/);

    const listed = await inboxListCommand({ cwd: tempDir, format: 'json', limit: 10 });
    expect(listed.exitCode).toBe(ExitCode.SUCCESS);
    expect((listed.result as { count: number }).count).toBe(1);

    const shown = await inboxShowCommand({ cwd: tempDir, format: 'json', envelopeId: envelope.envelope_id });
    expect(shown.exitCode).toBe(ExitCode.SUCCESS);
    expect((shown.result as { envelope: { payload: unknown } }).envelope.payload).toEqual(envelope.payload);

    const promoted = await inboxPromoteCommand({
      cwd: tempDir,
      format: 'json',
      envelopeId: envelope.envelope_id,
      targetKind: 'decision',
      targetRef: 'decision:pc-site-identity-policy',
      by: 'operator',
    });
    expect(promoted.exitCode).toBe(ExitCode.SUCCESS);
    const promotedEnvelope = (promoted.result as { envelope: Record<string, unknown> }).envelope;
    expect(promotedEnvelope.status).toBe('promoted');
    expect((promoted.result as { enactment_status: string }).enactment_status).toBe('pending');
    expect(promotedEnvelope.payload).toEqual(envelope.payload);
    expect(promotedEnvelope.source).toEqual(
      expect.objectContaining({ kind: 'diagnostic', ref: 'site-doctor:desktop-sunroom-2' }),
    );
  });

  it('enacts task promotion through the sanctioned task create command and is idempotent', async () => {
    setupRepo(tempDir);
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'user_chat',
      sourceRef: 'operator:manual',
      kind: 'task_candidate',
      authorityLevel: 'operator_confirmed',
      payload: JSON.stringify({
        title: 'Handle captured inbox work',
        goal: 'Convert a captured envelope into governed work.',
        acceptance_criteria: ['Task exists', 'Promotion records task target'],
      }),
    });
    const envelope = (submitted.result as { envelope: { envelope_id: string } }).envelope;

    const promoted = await inboxPromoteCommand({
      cwd: tempDir,
      format: 'json',
      envelopeId: envelope.envelope_id,
      targetKind: 'task',
      targetRef: 'Handle captured inbox work',
      by: 'operator',
    });

    expect(promoted.exitCode).toBe(ExitCode.SUCCESS);
    const result = promoted.result as {
      enactment_status: string;
      target_mutation: boolean;
      target: { task_number: number; title: string };
      envelope: { promotion: { target_ref: string; enactment_status: string } };
    };
    expect(result.enactment_status).toBe('enacted');
    expect(result.target_mutation).toBe(true);
    expect(result.target.task_number).toBe(101);
    expect(result.target.title).toBe('Handle captured inbox work');
    expect(result.envelope.promotion.target_ref).toBe('task:101');
    expect(result.envelope.promotion.enactment_status).toBe('enacted');

    const repeated = await inboxPromoteCommand({
      cwd: tempDir,
      format: 'json',
      envelopeId: envelope.envelope_id,
      targetKind: 'task',
      targetRef: 'Handle captured inbox work',
      by: 'operator',
    });
    expect(repeated.exitCode).toBe(ExitCode.SUCCESS);
    expect((repeated.result as { already_promoted: boolean }).already_promoted).toBe(true);
    const taskFiles = readdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'))
      .filter((file) => file.includes('handle-captured-inbox-work'));
    expect(taskFiles).toHaveLength(1);
  });

  it('promotes task candidates through the ergonomic inbox task alias with overrides', async () => {
    setupRepo(tempDir);
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'user_chat',
      sourceRef: 'operator:manual',
      kind: 'task_candidate',
      authorityLevel: 'operator_confirmed',
      payload: JSON.stringify({
        title: 'Payload title',
        goal: 'Payload goal',
        acceptance_criteria: ['Payload criterion'],
      }),
    });
    const envelope = (submitted.result as { envelope: { envelope_id: string } }).envelope;

    const promoted = await inboxTaskCommand({
      cwd: tempDir,
      format: 'json',
      envelopeId: envelope.envelope_id,
      by: 'operator',
      title: 'Override title',
      goal: 'Override goal',
      criteria: ['Override criterion A', 'Override criterion B'],
    });

    expect(promoted.exitCode).toBe(ExitCode.SUCCESS);
    const result = promoted.result as {
      target: { title: string; file_path: string };
      envelope: { promotion: { target_ref: string; enactment_status: string } };
    };
    expect(result.target.title).toBe('Override title');
    const taskContent = readFileSync(result.target.file_path, 'utf8');
    expect(taskContent).toContain('Override goal');
    expect(taskContent).toContain('- [ ] Override criterion A');
    expect(taskContent).toContain('- [ ] Override criterion B');
    expect(taskContent).not.toContain('Payload criterion');
    expect(result.envelope.promotion.enactment_status).toBe('enacted');
  });

  it('shows the next received inbox envelope without mutating it', async () => {
    await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'cli',
      sourceRef: 'manual-a',
      kind: 'observation',
      authorityLevel: 'user_statement',
      payload: JSON.stringify({ note: 'Ignore' }),
    });
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'cli',
      sourceRef: 'manual-b',
      kind: 'task_candidate',
      authorityLevel: 'operator_confirmed',
      payload: JSON.stringify({ title: 'Next task candidate' }),
    });

    const next = await inboxNextCommand({
      cwd: tempDir,
      format: 'json',
      kind: 'task_candidate',
      limit: 2,
    });

    expect(next.exitCode).toBe(ExitCode.SUCCESS);
    const expected = (submitted.result as { envelope: { envelope_id: string } }).envelope;
    const result = next.result as { primary: { envelope_id: string; status: string }; alternatives: unknown[] };
    expect(result.primary.envelope_id).toBe(expected.envelope_id);
    expect(result.primary.status).toBe('received');
    expect(result.alternatives).toHaveLength(0);

    const listed = await inboxListCommand({ cwd: tempDir, format: 'json', status: 'received', limit: 10 });
    expect((listed.result as { count: number }).count).toBe(2);
  });

  it('triages envelopes to archive and task through explicit actions', async () => {
    const archiveCandidate = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'cli',
      sourceRef: 'manual',
      kind: 'observation',
      authorityLevel: 'user_statement',
      payload: JSON.stringify({ note: 'No action' }),
    });
    const archiveEnvelope = (archiveCandidate.result as { envelope: { envelope_id: string } }).envelope;
    const archived = await inboxTriageCommand({
      cwd: tempDir,
      format: 'json',
      envelopeId: archiveEnvelope.envelope_id,
      action: 'archive',
      by: 'operator',
    });
    expect(archived.exitCode).toBe(ExitCode.SUCCESS);
    expect((archived.result as { envelope: { status: string } }).envelope.status).toBe('archived');

    const taskCandidate = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'cli',
      sourceRef: 'manual',
      kind: 'task_candidate',
      authorityLevel: 'operator_confirmed',
      payload: JSON.stringify({ title: 'Triaged task' }),
    });
    setupRepo(tempDir);
    const taskEnvelope = (taskCandidate.result as { envelope: { envelope_id: string } }).envelope;
    const triagedTask = await inboxTriageCommand({
      cwd: tempDir,
      format: 'json',
      envelopeId: taskEnvelope.envelope_id,
      action: 'task',
      by: 'operator',
    });
    expect(triagedTask.exitCode).toBe(ExitCode.SUCCESS);
    expect((triagedTask.result as { enactment_status: string }).enactment_status).toBe('enacted');
  });

  it('returns work-next with admissible actions', async () => {
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'cli',
      sourceRef: 'manual',
      kind: 'task_candidate',
      authorityLevel: 'operator_confirmed',
      payload: JSON.stringify({ title: 'Work next task' }),
    });
    const envelope = (submitted.result as { envelope: { envelope_id: string } }).envelope;

    const workNext = await inboxWorkNextCommand({ cwd: tempDir, format: 'json' });

    expect(workNext.exitCode).toBe(ExitCode.SUCCESS);
    const result = workNext.result as {
      primary: { envelope_id: string };
      admissible_actions: Array<{ action: string; target_mutation: boolean; pending_kind?: string }>;
      alternatives_count: number;
    };
    expect(result.primary.envelope_id).toBe(envelope.envelope_id);
    expect(result.admissible_actions.map((action) => action.action)).toEqual(['task', 'archive', 'pending']);
    expect(result.admissible_actions.find((action) => action.action === 'pending')?.pending_kind).toBe('recorded_pending_crossing');
    expect(result.alternatives_count).toBe(0);
  });

  it('archives envelopes without requiring a target ref or creating target work', async () => {
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'cli',
      sourceRef: 'manual',
      kind: 'observation',
      authorityLevel: 'user_statement',
      payload: JSON.stringify({ note: 'No action' }),
    });
    const envelope = (submitted.result as { envelope: { envelope_id: string } }).envelope;

    const archived = await inboxPromoteCommand({
      cwd: tempDir,
      format: 'json',
      envelopeId: envelope.envelope_id,
      targetKind: 'archive',
      by: 'operator',
    });

    expect(archived.exitCode).toBe(ExitCode.SUCCESS);
    expect((archived.result as { target_mutation: boolean }).target_mutation).toBe(false);
    const archivedEnvelope = (archived.result as { envelope: { status: string; promotion: { target_kind: string } } }).envelope;
    expect(archivedEnvelope.status).toBe('archived');
    expect(archivedEnvelope.promotion.target_kind).toBe('archive');
  });

  it('records unsupported promotion targets as pending, not enacted', async () => {
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'cli',
      sourceRef: 'manual',
      kind: 'proposal',
      authorityLevel: 'user_statement',
      payload: JSON.stringify({ title: 'Maybe change a site' }),
    });
    const envelope = (submitted.result as { envelope: { envelope_id: string } }).envelope;

    const promoted = await inboxPromoteCommand({
      cwd: tempDir,
      format: 'json',
      envelopeId: envelope.envelope_id,
      targetKind: 'site_config_change',
      targetRef: 'site:desktop-sunroom-2',
      by: 'operator',
    });

    expect(promoted.exitCode).toBe(ExitCode.SUCCESS);
    expect(promoted.result).toMatchObject({
      enactment_status: 'pending',
      pending_kind: 'recorded_pending_crossing',
      target_mutation: false,
    });
  });

  it('requires target ref for pending triage', async () => {
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'cli',
      sourceRef: 'manual',
      kind: 'proposal',
      authorityLevel: 'user_statement',
      payload: JSON.stringify({ title: 'Maybe change a site' }),
    });
    const envelope = (submitted.result as { envelope: { envelope_id: string } }).envelope;

    const result = await inboxTriageCommand({
      cwd: tempDir,
      format: 'json',
      envelopeId: envelope.envelope_id,
      action: 'pending',
      targetKind: 'site_config_change',
      by: 'operator',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({ status: 'error', error: expect.stringContaining('target-ref') });
  });

  it('rejects invalid JSON payloads', async () => {
    const result = await inboxSubmitCommand({
      cwd: tempDir,
      format: 'json',
      sourceKind: 'cli',
      sourceRef: 'manual',
      kind: 'proposal',
      authorityLevel: 'user_statement',
      payload: '{not-json',
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({ status: 'error' });
  });
});

function setupRepo(tempDir: string): void {
  const tasksDir = join(tempDir, '.ai', 'do-not-open', 'tasks');
  mkdirSync(tasksDir, { recursive: true });
  writeFileSync(
    join(tasksDir, '20260420-100-alpha.md'),
    '---\nstatus: opened\n---\n\n# Task 100\n',
  );
}
