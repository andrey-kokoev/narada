import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  commandRunCommand,
  commandRunInspectCommand,
  commandRunListCommand,
  resolveCommandRunPreset,
} from '../../src/commands/command-run.js';
import { openTaskLifecycleStore } from '../../src/lib/task-lifecycle-store.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

describe('command-run CEIZ surface', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-command-run-test-'));
    mkdirSync(join(tempDir, '.ai'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('persists bounded command output with digests and linkage', async () => {
    const store = openTaskLifecycleStore(tempDir);
    store.upsertLifecycle({
      task_id: 'task-100',
      task_number: 100,
      status: 'opened',
      governed_by: null,
      closed_at: null,
      closed_by: null,
      reopened_at: null,
      reopened_by: null,
      continuation_packet_json: null,
      updated_at: '2026-01-01T00:00:00Z',
    });

    const result = await commandRunCommand({
      argv: JSON.stringify(['/usr/bin/printf', 'x'.repeat(3000)]),
      taskNumber: 100,
      agent: 'a1',
      requester: 'a1',
      requesterKind: 'agent',
      cwd: tempDir,
      store,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const run = (result.result as { run: Record<string, unknown> }).run;
    expect(run.status).toBe('succeeded');
    expect(run.task_id).toBe('task-100');
    expect(run.task_number).toBe(100);
    expect(run.agent_id).toBe('a1');
    expect(String(run.stdout_admitted_excerpt)).toContain('[truncated]');
    expect(String(run.stdout_admitted_excerpt).length).toBeLessThan(2200);
    expect(run.stdout_digest).toEqual(expect.any(String));
    expect(run).not.toHaveProperty('stdout');
    expect(run).not.toHaveProperty('stderr');
    store.db.close();
  });

  it('inspect full exposes metadata, not raw unbounded streams', async () => {
    const runResult = await commandRunCommand({
      argv: JSON.stringify(['/usr/bin/printf', 'hello']),
      cwd: tempDir,
      format: 'json',
    });
    const runId = ((runResult.result as { run: { run_id: string } }).run).run_id;

    const inspect = await commandRunInspectCommand({
      runId,
      full: true,
      cwd: tempDir,
      format: 'json',
    });

    expect(inspect.exitCode).toBe(ExitCode.SUCCESS);
    const run = (inspect.result as { run: Record<string, unknown> }).run;
    expect(run.full_output_available).toBe(false);
    expect(run).not.toHaveProperty('stdout');
    expect(run).not.toHaveProperty('stderr');
  });

  it('list returns bounded summaries without admitted excerpts', async () => {
    await commandRunCommand({
      argv: JSON.stringify(['/usr/bin/printf', 'hello']),
      agent: 'a1',
      cwd: tempDir,
      format: 'json',
    });

    const listed = await commandRunListCommand({
      agent: 'a1',
      limit: 1,
      cwd: tempDir,
      format: 'json',
    });

    expect(listed.exitCode).toBe(ExitCode.SUCCESS);
    const result = listed.result as { count: number; runs: Array<Record<string, unknown>> };
    expect(result.count).toBe(1);
    expect(result.runs[0]).toMatchObject({
      status: 'succeeded',
      agent_id: 'a1',
    });
    expect(result.runs[0]).not.toHaveProperty('stdout_admitted_excerpt');
    expect(result.runs[0]).not.toHaveProperty('stderr_admitted_excerpt');
  });

  it('declares bounded diagnostic presets for build, graph, and workbench surfaces', () => {
    const build = resolveCommandRunPreset('cli-build', tempDir);
    expect(build.argv).toEqual(['pnpm', '--filter', '@narada2/cli', 'build']);
    expect(build.sideEffect).toBe('workspace_write');

    const graph = resolveCommandRunPreset('task-graph-json', tempDir);
    expect(graph.argv).toContain('task');
    expect(graph.argv).toContain('graph');
    expect(graph.argv).toContain('--include-closed');
    expect(graph.sideEffect).toBe('read_only');

    const workbench = resolveCommandRunPreset('workbench-diagnose', tempDir);
    expect(workbench.argv).toContain('workbench');
    expect(workbench.argv).toContain('diagnose');
    expect(workbench.sideEffect).toBe('read_only');
  });

  it('rejects preset combined with an ad hoc command', async () => {
    const result = await commandRunCommand({
      preset: 'task-graph-json',
      argv: JSON.stringify(['/usr/bin/printf', 'hello']),
      cwd: tempDir,
      format: 'json',
    });
    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({ status: 'error' });
  });

  it('executes read-only diagnostic presets through CEIZ storage', async () => {
    mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });

    const result = await commandRunCommand({
      preset: 'workbench-diagnose',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const run = (result.result as { run: Record<string, unknown> }).run;
    expect(run.status).toBe('succeeded');
    expect(run.side_effect_class).toBe('read_only');
    expect(String(run.stdout_admitted_excerpt)).toContain('"source": "workbench"');
    expect(run).not.toHaveProperty('stdout');
  });
});
