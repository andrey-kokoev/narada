import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { siteImmuneScanCommand } from '../../src/commands/site-immune-scan.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

describe('site immune scan', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `narada-site-immune-${process.pid}-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('reports clean minimal Site posture without mutating', async () => {
    writeFileSync(join(tempDir, 'config.json'), JSON.stringify({
      site_id: 'immune-clean',
      site_kind: 'project',
      site_root: tempDir,
      locus: { authority_locus: 'project' },
    }, null, 2), 'utf8');

    const result = await siteImmuneScanCommand({ cwd: tempDir, format: 'json' });
    const payload = result.result as { status: string; immune_posture: string; counts: { tamper_suspected: number } };

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(payload.status).toBe('ok');
    expect(payload.immune_posture).toBe('observe_classify_report_only');
    expect(payload.counts.tamper_suspected).toBe(0);
  });

  it('flags malformed config as tamper-suspected', async () => {
    writeFileSync(join(tempDir, 'config.json'), '{bad json', 'utf8');

    const result = await siteImmuneScanCommand({ cwd: tempDir, format: 'json' });
    const payload = result.result as { status: string; findings: Array<{ zone: string; predicate: string; severity: string }> };

    expect(result.exitCode).toBe(ExitCode.INTEGRITY_ISSUES);
    expect(payload.status).toBe('tamper_suspected');
    expect(payload.findings).toContainEqual(expect.objectContaining({
      zone: 'site_config',
      predicate: 'config_parse',
      severity: 'tamper_suspected',
    }));
  });

  it('flags malformed mutation evidence as tamper-suspected', async () => {
    writeFileSync(join(tempDir, 'config.json'), JSON.stringify({ site_id: 'immune-evidence' }), 'utf8');
    const evidenceDir = join(tempDir, '.ai', 'mutation-evidence', 'task_lifecycle');
    mkdirSync(evidenceDir, { recursive: true });
    writeFileSync(join(evidenceDir, 'bad.json'), JSON.stringify({ operation_id: 'not-enough' }), 'utf8');

    const result = await siteImmuneScanCommand({ cwd: tempDir, format: 'json' });
    const payload = result.result as { status: string; findings: Array<{ zone: string; predicate: string; severity: string; path?: string }> };

    expect(result.exitCode).toBe(ExitCode.INTEGRITY_ISSUES);
    expect(payload.status).toBe('tamper_suspected');
    expect(payload.findings).toContainEqual(expect.objectContaining({
      zone: 'mutation_evidence',
      predicate: 'evidence_record_shape',
      severity: 'tamper_suspected',
      path: join(evidenceDir, 'bad.json'),
    }));
  });

  it('warns when task lifecycle DB exists without exported snapshot', async () => {
    writeFileSync(join(tempDir, 'config.json'), JSON.stringify({ site_id: 'immune-snapshot' }), 'utf8');
    const taskDir = join(tempDir, '.ai', 'tasks');
    mkdirSync(taskDir, { recursive: true });
    writeFileSync(join(taskDir, 'task-lifecycle.db'), 'not-a-real-db-for-this-predicate', 'utf8');

    const result = await siteImmuneScanCommand({ cwd: tempDir, format: 'json' });
    const payload = result.result as { status: string; next_commands: string[]; findings: Array<{ zone: string; severity: string }> };

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(payload.status).toBe('attention');
    expect(payload.next_commands).toContain('narada task lifecycle export --output .ai/task-lifecycle-snapshot.json');
    expect(payload.findings).toContainEqual(expect.objectContaining({
      zone: 'task_lifecycle_snapshot',
      severity: 'warning',
    }));
  });
});
