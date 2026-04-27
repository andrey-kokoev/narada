import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inboxSubmitCommand } from '../../src/commands/inbox.js';
import { workNextCommand } from '../../src/commands/work-next.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

function setupRepo(tempDir: string): void {
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks', 'tasks', 'assignments'), { recursive: true });
  writeFileSync(
    join(tempDir, '.ai', 'agents', 'roster.json'),
    JSON.stringify({
      version: 2,
      schema: 'https://narada.dev/schemas/agent-roster/v2',
      updated_at: '2026-01-01T00:00:00Z',
      agents: [
        {
          agent_id: 'architect',
          role: 'architect',
          capabilities: ['claim', 'execute', 'review'],
          first_seen_at: '2026-01-01T00:00:00Z',
          last_active_at: '2026-01-01T00:00:00Z',
          status: 'idle',
          task: null,
          last_done: null,
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    }, null, 2),
  );
}

describe('work-next unified next action', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-work-next-test-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns task work before inbox work', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260427-100-test.md'),
      '---\ntask_id: 100\nstatus: opened\n---\n\n# Task 100\n\n## Goal\nDo task work.\n',
    );
    const inbox = await inboxSubmitCommand({
      cwd: tempDir,
      sourceKind: 'user_chat',
      sourceRef: 'chat:1',
      kind: 'task_candidate',
      authorityLevel: 'operator_confirmed',
      principal: 'operator',
      payload: '{"title":"Inbox work","goal":"Handle inbox."}',
      format: 'json',
    });
    expect(inbox.exitCode).toBe(ExitCode.SUCCESS);

    const result = await workNextCommand({ agent: 'architect', cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      action_kind: 'task_work',
      agent_id: 'architect',
      primary: { task_number: 100 },
    });
    expect(readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260427-100-test.md'), 'utf8')).toContain('status: claimed');
  });

  it('claims inbox work when no task work is available', async () => {
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      sourceKind: 'user_chat',
      sourceRef: 'chat:2',
      kind: 'task_candidate',
      authorityLevel: 'operator_confirmed',
      principal: 'operator',
      payload: '{"title":"Inbox work","goal":"Handle inbox."}',
      format: 'json',
    });
    expect(submitted.exitCode).toBe(ExitCode.SUCCESS);

    const result = await workNextCommand({ agent: 'architect', cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      action_kind: 'inbox_work',
      agent_id: 'architect',
      primary: {
        status: 'handling',
        handling: { handled_by: 'architect' },
      },
    });
  });

  it('returns idle when no task or inbox work exists', async () => {
    const result = await workNextCommand({ agent: 'architect', cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'empty',
      action_kind: 'idle',
      agent_id: 'architect',
      primary: null,
      reason: 'no_task_or_inbox_work',
    });
  });

  it('returns agent_not_found before inbox work for non-roster agents', async () => {
    await inboxSubmitCommand({
      cwd: tempDir,
      sourceKind: 'user_chat',
      sourceRef: 'chat:3',
      kind: 'task_candidate',
      authorityLevel: 'operator_confirmed',
      principal: 'operator',
      payload: '{"title":"Inbox work","goal":"Handle inbox."}',
      format: 'json',
    });

    const result = await workNextCommand({ agent: 'ghost', cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
      reason: 'agent_not_found',
      agent_id: 'ghost',
    });
  });
});
