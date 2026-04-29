import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ExitCode } from '../../src/lib/exit-codes.js';
import {
  lawAckCommand,
  lawChangeAddCommand,
  lawListCommand,
  lawStatusCommand,
  lawUnreadCommand,
} from '../../src/commands/law.js';
import { taskClaimCommand } from '../../src/commands/task-claim.js';
import { saveRoster } from '../../src/lib/task-governance.js';

const ROSTER = {
  version: 1,
  updated_at: '2026-01-01T00:00:00Z',
  agents: [
    { agent_id: 'builder', role: 'builder', capabilities: ['claim'], first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z' },
    { agent_id: 'architect', role: 'architect', capabilities: ['review'], first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z' },
  ],
};

function setupRepo(cwd: string): void {
  mkdirSync(join(cwd, '.ai', 'agents'), { recursive: true });
  mkdirSync(join(cwd, '.ai', 'do-not-open', 'tasks'), { recursive: true });
  writeFileSync(join(cwd, '.ai', 'agents', 'roster.json'), JSON.stringify(ROSTER, null, 2));
  writeFileSync(
    join(cwd, '.ai', 'do-not-open', 'tasks', '20260420-999-test.md'),
    '---\ntask_id: 999\nstatus: opened\n---\n\n# Task 999\n',
  );
}

describe('law change propagation commands', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-law-test-'));
    setupRepo(tempDir);
    await saveRoster(tempDir, JSON.parse(JSON.stringify(ROSTER)));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates and lists durable law change records', async () => {
    const added = await lawChangeAddCommand({
      cwd: tempDir,
      issuer: 'operator',
      summary: 'Read new Builder startup law',
      files: 'AGENTS.md,SEMANTICS.md',
      commit: 'abc123',
      requiredRoles: 'builder',
      format: 'json',
    });

    expect(added.exitCode).toBe(ExitCode.SUCCESS);
    const change = (added.result as { change: { change_id: string } }).change;
    const raw = JSON.parse(readFileSync(join(tempDir, '.ai', 'law', 'changes', `${change.change_id}.json`), 'utf8')) as Record<string, unknown>;
    expect(raw).toMatchObject({
      schema: 'https://narada.dev/schemas/law-change/v1',
      issuer: 'operator',
      summary: 'Read new Builder startup law',
      commit: 'abc123',
      required_roles: ['builder'],
    });

    const listed = await lawListCommand({ cwd: tempDir, format: 'json' });
    expect(listed.result).toMatchObject({ status: 'success', count: 1 });
  });

  it('records agent acknowledgements and clears unread status', async () => {
    const added = await lawChangeAddCommand({
      cwd: tempDir,
      issuer: 'operator',
      summary: 'Builder law',
      requiredRoles: 'builder',
      format: 'json',
    });
    const changeId = ((added.result as { change: { change_id: string } }).change.change_id);

    const unreadBefore = await lawUnreadCommand({ cwd: tempDir, agent: 'builder', role: 'builder', format: 'json' });
    expect(unreadBefore.result).toMatchObject({ count: 1 });

    const ack = await lawAckCommand({
      cwd: tempDir,
      changeId,
      agent: 'builder',
      role: 'builder',
      session: 'session-1',
      operatorSurfaceIdentity: 'narada-proper-builder',
      format: 'json',
    });
    expect(ack.exitCode).toBe(ExitCode.SUCCESS);
    expect(ack.result).toMatchObject({
      receipt: {
        change_id: changeId,
        agent_id: 'builder',
        role: 'builder',
        session_id: 'session-1',
        operator_surface_identity: 'narada-proper-builder',
        status: 'acknowledged',
      },
    });

    const status = await lawStatusCommand({ cwd: tempDir, agent: 'builder', role: 'builder', format: 'json' });
    expect(status.result).toMatchObject({ admission: 'clear', unread_count: 0, receipt_count: 1 });
  });

  it('blocks task claim when mandatory law is unread and passes after ack', async () => {
    const added = await lawChangeAddCommand({
      cwd: tempDir,
      issuer: 'operator',
      summary: 'Builder must read this',
      requiredRoles: 'builder',
      format: 'json',
    });
    const changeId = ((added.result as { change: { change_id: string } }).change.change_id);

    const blocked = await taskClaimCommand({ cwd: tempDir, taskNumber: '999', agent: 'builder', format: 'json' });
    expect(blocked.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(blocked.result).toMatchObject({
      error: 'law_update_required',
      law_update_required: true,
      unread_law_changes: [{ change_id: changeId }],
    });

    await lawAckCommand({ cwd: tempDir, changeId, agent: 'builder', role: 'builder', format: 'json' });
    const claimed = await taskClaimCommand({ cwd: tempDir, taskNumber: '999', agent: 'builder', format: 'json' });
    expect(claimed.exitCode).toBe(ExitCode.SUCCESS);
  });

  it('does not block roles outside the required role scope', async () => {
    await lawChangeAddCommand({
      cwd: tempDir,
      issuer: 'operator',
      summary: 'Architect-only law',
      requiredRoles: 'architect',
      format: 'json',
    });

    const unread = await lawUnreadCommand({ cwd: tempDir, agent: 'builder', role: 'builder', format: 'json' });
    expect(unread.result).toMatchObject({ count: 0 });
  });

  it('previews dry-run law changes without writing records', async () => {
    const preview = await lawChangeAddCommand({
      cwd: tempDir,
      issuer: 'operator',
      summary: 'Preview only',
      dryRun: true,
      format: 'json',
    });

    expect(preview.exitCode).toBe(ExitCode.SUCCESS);
    expect(preview.result).toMatchObject({ dry_run: true, mutation_performed: false });
    const listed = await lawListCommand({ cwd: tempDir, format: 'json' });
    expect(listed.result).toMatchObject({ count: 0 });
  });
});
