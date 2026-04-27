import { vi } from 'vitest';

vi.unmock('node:child_process');
vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inboxShowCommand, inboxSubmitCommand } from '../../src/commands/inbox.js';
import { resumeCommand } from '../../src/commands/resume.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

function setupRepo(tempDir: string): void {
  execFileSync('git', ['init', '-b', 'main'], { cwd: tempDir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tempDir });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: tempDir });
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
  writeFileSync(
    join(tempDir, '.ai', 'agents', 'roster.json'),
    JSON.stringify({
      version: 2,
      schema: 'https://narada.dev/schemas/agent-roster/v2',
      updated_at: '2026-01-01T00:00:00Z',
      agents: [{
        agent_id: 'architect',
        role: 'architect',
        capabilities: ['claim', 'execute', 'review'],
        first_seen_at: '2026-01-01T00:00:00Z',
        last_active_at: '2026-01-01T00:00:00Z',
        status: 'idle',
        task: null,
        last_done: null,
        updated_at: '2026-01-01T00:00:00Z',
      }],
    }, null, 2),
  );
  writeFileSync(join(tempDir, 'README.md'), '# test\n');
  execFileSync('git', ['add', '.'], { cwd: tempDir });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: tempDir, stdio: 'ignore' });
}

describe('resume continuity brief', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-resume-test-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns a read-only continuity brief without claiming inbox work', async () => {
    const submitted = await inboxSubmitCommand({
      cwd: tempDir,
      sourceKind: 'user_chat',
      sourceRef: 'chat:resume',
      kind: 'observation',
      authorityLevel: 'user_statement',
      principal: 'operator',
      payload: '{"title":"Resume me"}',
      format: 'json',
    });
    const envelopeId = (submitted.result as { envelope: { envelope_id: string } }).envelope.envelope_id;

    const result = await resumeCommand({ agent: 'architect', cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      agent_id: 'architect',
      locus: {
        kind: 'git_worktree',
      },
      repo: {
        repo_root: tempDir,
        branch: 'main',
        dirty_count: expect.any(Number),
        dirty_summary: expect.objectContaining({
          count: expect.any(Number),
          categories: expect.any(Object),
        }),
      },
      inbox: {
        received: 1,
        handling: 0,
        pending: 0,
        next: { envelope_id: envelopeId },
      },
      next_work: {
        action_kind: 'inbox_work',
        primary: { envelope_id: envelopeId },
      },
      tool_hydration: null,
    });

    const shown = await inboxShowCommand({ cwd: tempDir, envelopeId, format: 'json' });
    expect((shown.result as { envelope: { status: string } }).envelope.status).toBe('received');
  });

  it('summarizes dirty repo state without dumping unbounded file lists', async () => {
    writeFileSync(join(tempDir, 'README.md'), '# changed\n');
    writeFileSync(join(tempDir, 'new-file.txt'), 'new\n');

    const result = await resumeCommand({ agent: 'architect', cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      repo: {
        dirty_summary: {
          count: 2,
          categories: {
            modified: 1,
            untracked: 1,
          },
          truncated: false,
        },
      },
    });
  });

  it('reports current task work without claiming additional work', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'agents', 'roster.json'),
      JSON.stringify({
        version: 2,
        schema: 'https://narada.dev/schemas/agent-roster/v2',
        updated_at: '2026-01-01T00:00:00Z',
        agents: [{
          agent_id: 'architect',
          role: 'architect',
          capabilities: ['claim', 'execute', 'review'],
          first_seen_at: '2026-01-01T00:00:00Z',
          last_active_at: '2026-01-01T00:00:00Z',
          status: 'working',
          task: 100,
          last_done: null,
          updated_at: '2026-01-01T00:00:00Z',
        }],
      }, null, 2),
    );
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-100-current.md'),
      '---\ntask_id: 100\nstatus: claimed\n---\n\n# Current Task\n',
    );

    const result = await resumeCommand({ agent: 'architect', cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      tasks: {
        current: {
          task_number: 100,
          current: true,
        },
      },
      next_work: {
        action_kind: 'task_work',
        primary: {
          task_number: 100,
        },
      },
    });
  });

  it('keeps codex hydration advisory and separate from continuity recovery', async () => {
    const result = await resumeCommand({ agent: 'architect', cwd: tempDir, withTool: 'codex', format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      tool_hydration: {
        status: 'advisory',
        tool: 'codex',
        command: expect.stringContaining('codex'),
      },
    });
  });
});
