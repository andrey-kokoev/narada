import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { mkdtempSync, rmSync } from 'node:fs';
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
      targetKind: 'task',
      targetRef: 'task:pc-site-identity-policy',
      by: 'operator',
    });
    expect(promoted.exitCode).toBe(ExitCode.SUCCESS);
    const promotedEnvelope = (promoted.result as { envelope: Record<string, unknown> }).envelope;
    expect(promotedEnvelope.status).toBe('promoted');
    expect(promotedEnvelope.payload).toEqual(envelope.payload);
    expect(promotedEnvelope.source).toEqual(
      expect.objectContaining({ kind: 'diagnostic', ref: 'site-doctor:desktop-sunroom-2' }),
    );
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
