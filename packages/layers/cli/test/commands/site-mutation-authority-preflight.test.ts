import { vi } from 'vitest';

vi.unmock('node:child_process');
vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { siteMutationAuthorityPreflightCommand } from '../../src/commands/site-mutation-authority-preflight.js';

const gitBinary = process.env.NARADA_GIT_BINARY ?? '/usr/bin/git';

describe('site mutation authority preflight', () => {
  it('classifies a Narada authority locus with task state surfaces', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'narada-site-authority-'));
    try {
      initGit(cwd);
      mkdirSync(join(cwd, '.ai', 'do-not-open', 'tasks'), { recursive: true });
      writeFileSync(join(cwd, '.ai', 'task-lifecycle-snapshot.json'), '{"tasks":[]}');

      const { result } = await siteMutationAuthorityPreflightCommand({
        cwd,
        mutationFamily: 'task_lifecycle',
        format: 'json',
      });

      expect(result).toMatchObject({
        status: 'success',
        locus_state: 'authority_locus',
        mutation_safety: 'allowed_with_command',
        next_safe_command: 'narada work-next --agent <agent> --claim',
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('reports configured sibling embodiment inbox-drop warnings', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'narada-site-authority-'));
    const sibling = mkdtempSync(join(tmpdir(), 'narada-site-sibling-'));
    try {
      initGit(cwd);
      mkdirSync(join(cwd, '.ai', 'do-not-open', 'tasks'), { recursive: true });
      writeFileSync(join(cwd, '.ai', 'task-lifecycle-snapshot.json'), '{"tasks":[]}');
      mkdirSync(join(sibling, '.ai', 'inbox-drop'), { recursive: true });
      writeFileSync(join(sibling, '.ai', 'inbox-drop', '001.md'), '# Pending\n');
      writeFileSync(join(cwd, '.ai', 'authority-clone.json'), JSON.stringify({
        site_id: 'test-site',
        authority_root: cwd,
        embodiments: [
          { id: 'authority', root: cwd, role: 'authority', mutation_policy: 'allow' },
          { id: 'sibling', root: sibling, role: 'read_only_forwarding', mutation_policy: 'refuse_or_forward' },
        ],
      }));

      const { result } = await siteMutationAuthorityPreflightCommand({
        cwd,
        mutationFamily: 'publication',
        format: 'json',
      });

      expect(result).toMatchObject({
        status: 'success',
        locus_state: 'authority_locus',
      });
      const data = result as { embodiment_warnings: string[]; embodiments: Array<{ id: string; inbox_drop_count: number }> };
      expect(data.embodiments.some((e) => e.id === 'sibling' && e.inbox_drop_count === 1)).toBe(true);
      expect(data.embodiment_warnings).toContain('sibling has 1 pending inbox-drop file(s)');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(sibling, { recursive: true, force: true });
    }
  });

  it('refuses mutation from an unknown locus', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'narada-site-unknown-'));
    try {
      const { result } = await siteMutationAuthorityPreflightCommand({
        cwd,
        mutationFamily: 'inbox',
        format: 'json',
      });

      expect(result).toMatchObject({
        status: 'success',
        locus_state: 'unknown',
        mutation_safety: 'refuse',
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('refuses mutation from a read-only embodiment', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'narada-site-read-only-'));
    try {
      initGit(cwd);
      mkdirSync(join(cwd, '.ai'), { recursive: true });
      writeFileSync(join(cwd, '.ai', 'read-only-embodiment.json'), '{"authority":"elsewhere"}');
      writeFileSync(join(cwd, '.ai', 'inbox.db'), '');

      const { result } = await siteMutationAuthorityPreflightCommand({
        cwd,
        mutationFamily: 'inbox',
        format: 'json',
      });

      expect(result).toMatchObject({
        status: 'success',
        locus_state: 'read_only_embodiment',
        mutation_safety: 'refuse',
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('limits stale clones to inspection only', async () => {
    const remote = mkdtempSync(join(tmpdir(), 'narada-site-remote-'));
    const local = mkdtempSync(join(tmpdir(), 'narada-site-local-'));
    const other = mkdtempSync(join(tmpdir(), 'narada-site-other-'));
    try {
      git(remote, ['init', '--bare', '-b', 'main']);
      initGit(local);
      mkdirSync(join(local, '.ai', 'inbox-envelopes'), { recursive: true });
      writeFileSync(join(local, 'README.md'), 'base\n');
      git(local, ['add', '.']);
      git(local, ['commit', '-m', 'base']);
      git(local, ['remote', 'add', 'origin', remote]);
      git(local, ['push', '-u', 'origin', 'main']);

      git(other, ['clone', remote, '.']);
      git(other, ['config', 'user.email', 'test@example.invalid']);
      git(other, ['config', 'user.name', 'Narada Test']);
      writeFileSync(join(other, 'REMOTE.md'), 'new\n');
      git(other, ['add', '.']);
      git(other, ['commit', '-m', 'advance remote']);
      git(other, ['push', 'origin', 'main']);
      git(local, ['fetch', 'origin']);

      const { result } = await siteMutationAuthorityPreflightCommand({
        cwd: local,
        mutationFamily: 'inbox',
        format: 'json',
      });

      expect(result).toMatchObject({
        status: 'success',
        locus_state: 'stale_clone',
        mutation_safety: 'inspect_only',
        next_safe_command: 'git pull --ff-only && narada mutation-evidence reconcile --apply',
      });
    } finally {
      rmSync(remote, { recursive: true, force: true });
      rmSync(local, { recursive: true, force: true });
      rmSync(other, { recursive: true, force: true });
    }
  });
});

function initGit(cwd: string): void {
  git(cwd, ['init', '-b', 'main']);
  git(cwd, ['config', 'user.email', 'test@example.invalid']);
  git(cwd, ['config', 'user.name', 'Narada Test']);
}

function git(cwd: string, args: string[]): string {
  return execFileSync(gitBinary, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
