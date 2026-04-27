import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');
vi.unmock('node:child_process');

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteInboxStore } from '@narada2/control-plane';
import { coherenceScanCommand } from '../../src/commands/coherence-scan.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

describe('coherence scan command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-coherence-scan-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('reports bounded findings without mutating inbox by default', async () => {
    const result = await coherenceScanCommand({ cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const body = result.result as { mode: string; finding_count: number; findings: Array<{ finding_id: string; kind: string }>; submitted: unknown[] };
    expect(body.mode).toBe('dry_run');
    expect(body).toMatchObject({ modules: ['operational', 'semantic', 'telos', 'documentation'] });
    expect(body.submitted).toEqual([]);
    expect(body.finding_count).toBe(1);
    expect(body.findings[0]).toMatchObject({
      finding_id: 'work-next-missing-peek',
      module: 'operational',
      kind: 'task_candidate',
    });

    const store = new SqliteInboxStore(join(tempDir, '.ai', 'inbox.db'));
    expect(store.list({ limit: 10 })).toHaveLength(0);
    store.close();
  });

  it('submits explicit inbox task candidates and dedupes active cooldown keys', async () => {
    const store = new SqliteInboxStore(join(tempDir, '.ai', 'inbox.db'));
    const first = await coherenceScanCommand({ cwd: tempDir, format: 'json', submit: true, store });
    const second = await coherenceScanCommand({ cwd: tempDir, format: 'json', submit: true, store });

    expect(first.exitCode).toBe(ExitCode.SUCCESS);
    expect(second.exitCode).toBe(ExitCode.SUCCESS);
    expect((first.result as { submitted: unknown[] }).submitted).toHaveLength(1);
    expect((second.result as { submitted: unknown[] }).submitted).toHaveLength(0);

    const envelopes = store.list({ status: 'received', limit: 10 });
    expect(envelopes).toHaveLength(1);
    expect(envelopes[0]).toMatchObject({
      kind: 'task_candidate',
      authority: { level: 'system_observed', principal: 'coherence-scan' },
      source: { kind: 'system_observation', ref: 'coherence-scan:work-next-missing-peek' },
    });
    expect(envelopes[0].payload).toMatchObject({
      module: 'operational',
      cooldown_key: 'work-next-missing-peek',
      proposed_action: 'Add narada work-next --peek as a no-claim read-only inspection mode.',
    });
    store.close();
  });

  it('runs selected charter modules only', async () => {
    const operational = await coherenceScanCommand({
      cwd: tempDir,
      format: 'json',
      modules: ['operational'],
    });
    const semantic = await coherenceScanCommand({
      cwd: tempDir,
      format: 'json',
      modules: ['semantic,telos,documentation'],
    });

    expect(operational.exitCode).toBe(ExitCode.SUCCESS);
    expect(operational.result).toMatchObject({
      modules: ['operational'],
      findings: [{ module: 'operational', finding_id: 'work-next-missing-peek' }],
    });
    expect(semantic.exitCode).toBe(ExitCode.SUCCESS);
    expect(semantic.result).toMatchObject({
      modules: ['semantic', 'telos', 'documentation'],
      finding_count: 0,
    });
  });

  it('rejects unknown charter modules', async () => {
    const result = await coherenceScanCommand({
      cwd: tempDir,
      format: 'json',
      modules: ['unknown'],
    });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
      error: expect.stringContaining("Invalid coherence module 'unknown'"),
    });
  });
});

function setupRepo(cwd: string): void {
  mkdirSync(join(cwd, '.ai'), { recursive: true });
  writeFileSync(join(cwd, '.gitignore'), '.ai/task-lifecycle.db\n');
  writeFileSync(join(cwd, '.ai', 'task-lifecycle-snapshot.json'), JSON.stringify({ snapshot_kind: 'task_lifecycle_snapshot' }));
  mkdirSync(join(cwd, 'packages', 'layers', 'cli', 'src', 'commands'), { recursive: true });
  writeFileSync(join(cwd, 'packages', 'layers', 'cli', 'src', 'commands', 'work-next-register.ts'), 'program.command("work-next");\n');
  writeFileSync(join(cwd, 'packages', 'layers', 'cli', 'src', 'commands', 'work-next.ts'), 'export interface WorkNextOptions { agent?: string }\n');
  writeFileSync(join(cwd, 'AGENTS.md'), 'Narada is a composed topology of authority-homogeneous zones connected by governed crossings.\n');
  writeFileSync(join(cwd, 'SEMANTICS.md'), 'zone and governed crossing\n');
  mkdirSync(join(cwd, 'docs', 'concepts'), { recursive: true });
  writeFileSync(join(cwd, 'docs', 'concepts', 'inhabited-evolution.md'), 'build what the operation has earned\n');
  writeFileSync(
    join(cwd, 'docs', 'concepts', 'self-maintenance-coherence-loop.md'),
    [
      'treat earned evolution as valid unless an explicit invariant is violated',
      'Repair, promotion, and execution are never default scanner actions',
      'Documentation Coherency',
      'Documentation findings should use the same envelope path',
      'premature machinery',
    ].join('\n'),
  );
  execFileSync(process.env.NARADA_GIT_BINARY ?? '/usr/bin/git', ['init', '-b', 'main'], { cwd });
  execFileSync(process.env.NARADA_GIT_BINARY ?? '/usr/bin/git', ['config', 'user.email', 'test@example.invalid'], { cwd });
  execFileSync(process.env.NARADA_GIT_BINARY ?? '/usr/bin/git', ['config', 'user.name', 'Test Agent'], { cwd });
  execFileSync(process.env.NARADA_GIT_BINARY ?? '/usr/bin/git', ['add', '.gitignore', '.ai/task-lifecycle-snapshot.json'], { cwd });
  execFileSync(process.env.NARADA_GIT_BINARY ?? '/usr/bin/git', ['commit', '-m', 'base'], { cwd });
}
