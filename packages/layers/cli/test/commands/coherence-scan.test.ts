import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');
vi.unmock('node:child_process');

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
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
    expect(body).toMatchObject({ modules: ['operational', 'semantic', 'telos', 'documentation', 'mutation_evidence', 'locus'] });
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

  it('uses current-process lifecycle snapshot freshness instead of stale shell shims', async () => {
    const dbPath = join(tempDir, '.ai', 'task-lifecycle.db');
    const snapshotPath = join(tempDir, '.ai', 'task-lifecycle-snapshot.json');
    writeFileSync(dbPath, 'sqlite-placeholder');
    writeFileSync(snapshotPath, JSON.stringify({ snapshot_kind: 'task_lifecycle_snapshot', fresh: true }));
    const oldTime = new Date('2026-05-18T00:00:00.000Z');
    const freshTime = new Date('2026-05-18T00:00:10.000Z');
    utimesSync(dbPath, oldTime, oldTime);
    utimesSync(snapshotPath, freshTime, freshTime);
    mkdirSync(join(tempDir, 'scripts'), { recursive: true });
    writeFileSync(
      join(tempDir, 'scripts', 'guard-task-lifecycle-db.sh'),
      [
        '#!/usr/bin/env bash',
        'echo "/mnt/d/code/narada/node_modules/.bin/narada: 16: exec: node: not found" >&2',
        'exit 2',
      ].join('\n'),
    );

    const result = await coherenceScanCommand({
      cwd: tempDir,
      format: 'json',
      modules: ['operational'],
      limit: 20,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const body = result.result as { findings: Array<{ finding_id: string; evidence: string[] }> };
    expect(body.findings.map((finding) => finding.finding_id)).not.toContain('task-lifecycle-snapshot-stale');
    expect(JSON.stringify(body.findings)).not.toContain('/mnt/d/code/narada');
  });

  it('still reports stale lifecycle snapshots through the current process check', async () => {
    const dbPath = join(tempDir, '.ai', 'task-lifecycle.db');
    const snapshotPath = join(tempDir, '.ai', 'task-lifecycle-snapshot.json');
    writeFileSync(dbPath, 'sqlite-placeholder');
    writeFileSync(snapshotPath, JSON.stringify({ snapshot_kind: 'task_lifecycle_snapshot', stale: true }));
    const oldTime = new Date('2026-05-18T00:00:00.000Z');
    const freshTime = new Date('2026-05-18T00:00:10.000Z');
    utimesSync(snapshotPath, oldTime, oldTime);
    utimesSync(dbPath, freshTime, freshTime);

    const result = await coherenceScanCommand({
      cwd: tempDir,
      format: 'json',
      modules: ['operational'],
      limit: 20,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const body = result.result as { findings: Array<{ finding_id: string; evidence: string[] }> };
    const stale = body.findings.find((finding) => finding.finding_id === 'task-lifecycle-snapshot-stale');
    expect(stale).toBeDefined();
    expect(stale!.evidence).toEqual(expect.arrayContaining([
      'snapshot_freshness=snapshot_stale',
    ]));
    expect(JSON.stringify(stale)).not.toContain('exec: node: not found');
  });

  it('scans authority inversion inventory only when explicitly selected', async () => {
    const defaultScan = await coherenceScanCommand({ cwd: tempDir, format: 'json' });
    const authorityScan = await coherenceScanCommand({
      cwd: tempDir,
      format: 'json',
      modules: ['authority_inversion'],
      limit: 2,
    });

    expect(defaultScan.exitCode).toBe(ExitCode.SUCCESS);
    expect((defaultScan.result as { modules: string[] }).modules).not.toContain('authority_inversion');
    expect(authorityScan.exitCode).toBe(ExitCode.SUCCESS);
    expect(authorityScan.result).toMatchObject({
      modules: ['authority_inversion'],
      finding_count: 2,
      findings: [
        {
          module: 'authority_inversion',
          finding_id: 'authority-inversion-task-markdown-projection-authority',
          locus: 'task_lifecycle',
          kind: 'task_candidate',
          cooldown_key: 'authority-inversion:task-markdown-projection-authority',
        },
        {
          module: 'authority_inversion',
          finding_id: 'authority-inversion-inbox-db-envelope-authority',
          locus: 'inbox',
          kind: 'observation',
        },
      ],
    });
  });

  it('submits authority inversion findings without duplicating active cooldown keys', async () => {
    const store = new SqliteInboxStore(join(tempDir, '.ai', 'inbox.db'));
    const first = await coherenceScanCommand({
      cwd: tempDir,
      format: 'json',
      modules: ['authority_inversion'],
      limit: 1,
      submit: true,
      store,
    });
    const second = await coherenceScanCommand({
      cwd: tempDir,
      format: 'json',
      modules: ['authority_inversion'],
      limit: 1,
      submit: true,
      store,
    });

    expect(first.exitCode).toBe(ExitCode.SUCCESS);
    expect(second.exitCode).toBe(ExitCode.SUCCESS);
    expect((first.result as { submitted: unknown[] }).submitted).toHaveLength(1);
    expect((second.result as { submitted: unknown[] }).submitted).toHaveLength(0);
    expect(store.list({ limit: 10 })[0].payload).toMatchObject({
      module: 'authority_inversion',
      cooldown_key: 'authority-inversion:task-markdown-projection-authority',
    });
    store.close();
  });

  it('flags secret-like changed artifacts without recording raw values', async () => {
    writeFileSync(join(tempDir, 'operator-output.txt'), 'API_TOKEN=sk-testsecretvalue123456\n');

    const result = await coherenceScanCommand({
      cwd: tempDir,
      format: 'json',
      modules: ['authority_inversion'],
      limit: 20,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const body = result.result as { findings: Array<{ finding_id: string; evidence: string[]; proposed_action: string }> };
    const finding = body.findings.find((item) => item.finding_id === 'authority-inversion-secret-value-artifact-detected');
    expect(finding).toBeDefined();
    expect(finding).toMatchObject({
      proposed_action: expect.stringContaining('capability references'),
    });
    expect(finding!.evidence).toEqual([
      'secret_like_artifact=operator-output.txt:pattern=secret_key_assignment:value_recorded=false',
      'secret_like_artifact=operator-output.txt:pattern=provider_secret_literal:value_recorded=false',
    ]);
    expect(JSON.stringify(finding)).not.toContain('sk-testsecretvalue123456');
  });

  it('flags changed CLI command sources that bypass output admission helpers', async () => {
    const commandPath = join(tempDir, 'packages', 'layers', 'cli', 'src', 'commands', 'raw-output.ts');
    writeFileSync(
      commandPath,
      [
        'export async function rawOutputCommand(): Promise<void> {',
        '  console.log("raw transcript " + "x".repeat(1000));',
        '}',
      ].join('\n'),
    );

    const result = await coherenceScanCommand({
      cwd: tempDir,
      format: 'json',
      modules: ['authority_inversion'],
      limit: 20,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const body = result.result as { findings: Array<{ finding_id: string; evidence: string[]; proposed_action: string }> };
    const finding = body.findings.find((item) => item.finding_id === 'authority-inversion-cli-output-admission-bypass-detected');
    expect(finding).toBeDefined();
    expect(finding).toMatchObject({
      proposed_action: expect.stringContaining('formattedResult'),
      evidence: [
        'cli_output_bypass=packages/layers/cli/src/commands/raw-output.ts:pattern=console_stdout_stderr:raw_output_recorded=false',
      ],
    });
    expect(JSON.stringify(finding)).not.toContain('raw transcript');
  });

  it('reports missing mutation evidence for dirty authority surfaces and dedupes submissions', async () => {
    writeFileSync(join(tempDir, '.ai', 'task-lifecycle-snapshot.json'), JSON.stringify({ changed: true }));
    const store = new SqliteInboxStore(join(tempDir, '.ai', 'inbox.db'));
    const first = await coherenceScanCommand({
      cwd: tempDir,
      format: 'json',
      modules: ['mutation_evidence'],
      submit: true,
      store,
    });
    const second = await coherenceScanCommand({
      cwd: tempDir,
      format: 'json',
      modules: ['mutation_evidence'],
      submit: true,
      store,
    });

    expect(first.exitCode).toBe(ExitCode.SUCCESS);
    expect(second.exitCode).toBe(ExitCode.SUCCESS);
    expect(first.result).toMatchObject({
      modules: ['mutation_evidence'],
      findings: [{
        finding_id: 'mutation-evidence-missing-for-authority-surface',
        proposed_action: expect.stringContaining('mutation evidence'),
      }],
    });
    expect((first.result as { submitted: unknown[] }).submitted).toHaveLength(1);
    expect((second.result as { submitted: unknown[] }).submitted).toHaveLength(0);
    store.close();
  });

  it('does not report missing mutation evidence when evidence artifacts are dirty', async () => {
    writeFileSync(join(tempDir, '.ai', 'task-lifecycle-snapshot.json'), JSON.stringify({ changed: true }));
    mkdirSync(join(tempDir, '.ai', 'mutation-evidence', 'task_lifecycle'), { recursive: true });
    writeFileSync(
      join(tempDir, '.ai', 'mutation-evidence', 'task_lifecycle', 'mev_current.json'),
      JSON.stringify({ schema: 'https://narada.dev/schemas/mutation-evidence/v1' }),
    );

    const result = await coherenceScanCommand({
      cwd: tempDir,
      format: 'json',
      modules: ['mutation_evidence'],
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      modules: ['mutation_evidence'],
      finding_count: 0,
      findings: [],
    });
  });

  it('reports wrong-locus mutation risk with an exact next command', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'authority-clone.json'),
      JSON.stringify({
        site_id: 'narada-proper',
        authority_root: join(tempDir, '..', 'narada-authority'),
      }, null, 2),
    );

    const result = await coherenceScanCommand({
      cwd: tempDir,
      format: 'json',
      modules: ['locus'],
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      modules: ['locus'],
      findings: [{
        finding_id: 'wrong-locus-mutation-risk',
        module: 'locus',
        proposed_action: expect.stringContaining('narada <same-command>'),
      }],
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
  writeFileSync(
    join(cwd, 'docs', 'concepts', 'authority-inversion-inventory.json'),
    JSON.stringify({
      findings: [
        {
          finding_id: 'task-markdown-projection-authority',
          surface: 'task_lifecycle',
          visible_artifact: '.ai/do-not-open/tasks/*.md',
          hidden_authority_structure: 'command-mediated task lifecycle',
          current_guard: 'task file guard',
          gap: 'markdown can look authoritative',
          severity: 'warning',
          recommended_follow_up: 'Surface advisory warning.',
          candidate_tasks: [992, 993],
        },
        {
          finding_id: 'inbox-db-envelope-authority',
          surface: 'inbox',
          visible_artifact: '.ai/inbox.db',
          hidden_authority_structure: 'inert envelopes and governed promotion',
          current_guard: 'inbox export/import',
          gap: 'transitions need normalized mutation evidence',
          severity: 'info',
          recommended_follow_up: 'Emit inbox mutation evidence.',
          candidate_tasks: [996],
        },
      ],
    }, null, 2),
  );
  const git = gitBinary();
  execFileSync(git, ['init', '-b', 'main'], { cwd });
  execFileSync(git, ['config', 'user.email', 'test@example.invalid'], { cwd });
  execFileSync(git, ['config', 'user.name', 'Test Agent'], { cwd });
  execFileSync(git, ['add', '.gitignore', '.ai/task-lifecycle-snapshot.json'], { cwd });
  execFileSync(git, ['commit', '-m', 'base'], { cwd });
}

function gitBinary(): string {
  return process.env.NARADA_GIT_BINARY ?? (process.platform === 'win32' ? 'git' : '/usr/bin/git');
}
