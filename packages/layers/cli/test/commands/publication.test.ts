import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');
vi.unmock('node:child_process');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  publicationConfirmCommand,
  publicationListCommand,
  publicationPrepareCommand,
} from '../../src/commands/publication.js';
import { openTaskLifecycleStore } from '../../src/lib/task-lifecycle-store.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

function git(cwd: string, args: string[]): string {
  return execFileSync(process.env.NARADA_GIT_BINARY ?? '/usr/bin/git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

describe('publication RPIZ surface', () => {
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'narada-publication-test-'));
    mkdirSync(join(repo, '.ai'), { recursive: true });
    git(repo, ['init', '-b', 'main']);
    git(repo, ['config', 'user.email', 'test@example.invalid']);
    git(repo, ['config', 'user.name', 'Test Agent']);
    writeFileSync(join(repo, 'README.md'), '# test\n');
    git(repo, ['add', 'README.md']);
    git(repo, ['commit', '-m', 'base']);
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('prepares a durable bundle without claiming remote publication', async () => {
    const base = git(repo, ['rev-parse', 'HEAD']);
    writeFileSync(join(repo, 'feature.txt'), 'hello\n');

    const result = await publicationPrepareCommand({
      message: 'Publish feature',
      by: 'architect',
      include: ['feature.txt'],
      baseRef: base,
      cwd: repo,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const publication = (result.result as { publication: Record<string, unknown> }).publication;
    expect(publication.status).toBe('prepared');
    expect(publication.commit_hash).toEqual(expect.any(String));
    expect(existsSync(String(publication.bundle_path))).toBe(true);
    expect(existsSync(String(publication.patch_path))).toBe(true);

    const store = openTaskLifecycleStore(repo);
    const row = store.getRepoPublication(String(publication.publication_id));
    store.db.close();
    expect(row?.status).toBe('prepared');
    expect(row?.pushed_at).toBeNull();
  });

  it('records confirmation separately from bundle preparation', async () => {
    const base = git(repo, ['rev-parse', 'HEAD']);
    writeFileSync(join(repo, 'feature.txt'), 'hello\n');
    const prepared = await publicationPrepareCommand({
      message: 'Publish feature',
      by: 'architect',
      include: ['feature.txt'],
      baseRef: base,
      cwd: repo,
      format: 'json',
    });
    const publicationId = String((prepared.result as { publication: Record<string, unknown> }).publication.publication_id);

    const confirmed = await publicationConfirmCommand({
      publicationId,
      status: 'pushed',
      by: 'operator',
      remoteRef: 'origin/main',
      cwd: repo,
      format: 'json',
    });

    expect(confirmed.exitCode).toBe(ExitCode.SUCCESS);
    const publication = (confirmed.result as { publication: Record<string, unknown> }).publication;
    expect(publication.status).toBe('pushed');
    expect(publication.confirmed_by).toBe('operator');

    const listed = await publicationListCommand({ status: 'pushed', cwd: repo, format: 'json' });
    expect((listed.result as { count: number }).count).toBe(1);
  });
});
