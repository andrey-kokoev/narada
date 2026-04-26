import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  inboxListCommand,
  inboxPromoteCommand,
  inboxShowCommand,
  inboxSubmitCommand,
} from '../../src/commands/inbox.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

describe('Canonical Inbox CLI commands', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-inbox-cli-'));
    setupRepo(tempDir);
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
      target_mutation: false,
    });
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
