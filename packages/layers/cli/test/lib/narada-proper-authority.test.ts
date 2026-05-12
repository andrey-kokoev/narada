import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertAuthorityCloneForMutation,
  inspectAuthorityClonePosture,
  shouldGuardAuthorityClone,
} from '../../src/lib/narada-proper-authority.js';

function testTempDir(prefix: string): string {
  const base = join(process.cwd(), '.tmp-test');
  mkdirSync(base, { recursive: true });
  return mkdtempSync(join(base, prefix));
}

describe('Narada proper authority clone routing', () => {
  it('allows mutating commands when no authority clone is configured', () => {
    const cwd = testTempDir('narada-unconfigured-');
    try {
      const posture = inspectAuthorityClonePosture(cwd);
      expect(posture.status).toBe('unconfigured');
      expect(() => assertAuthorityCloneForMutation('task claim', [{ cwd }])).not.toThrow();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('allows the declared authority clone', () => {
    const cwd = testTempDir('narada-authority-');
    try {
      mkdirSync(join(cwd, '.ai'), { recursive: true });
      writeFileSync(join(cwd, '.ai', 'authority-clone.json'), JSON.stringify({ authority_root: cwd }));

      const posture = inspectAuthorityClonePosture(cwd);
      expect(posture.status).toBe('authority_clone');
      expect(() => assertAuthorityCloneForMutation('task claim', [{ cwd }])).not.toThrow();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('reads canonical Site embodiments and reports sibling inbox-drop residue', () => {
    const authority = testTempDir('narada-authority-');
    const sibling = testTempDir('narada-sibling-');
    try {
      mkdirSync(join(authority, '.ai'), { recursive: true });
      mkdirSync(join(sibling, '.ai', 'inbox-drop'), { recursive: true });
      writeFileSync(join(sibling, '.ai', 'inbox-drop', '001.md'), '# Pending\n');
      writeFileSync(join(authority, '.ai', 'authority-clone.json'), JSON.stringify({
        site_id: 'narada-proper',
        authority_root: authority,
        embodiments: [
          { id: 'authority', root: authority, role: 'authority', mutation_policy: 'allow' },
          { id: 'sibling', root: sibling, role: 'read_only_forwarding', mutation_policy: 'refuse_or_forward' },
        ],
      }));

      const posture = inspectAuthorityClonePosture(authority);

      expect(posture.status).toBe('authority_clone');
      expect(posture.embodiments).toEqual([
        expect.objectContaining({ id: 'authority', role: 'authority', current: true }),
        expect.objectContaining({ id: 'sibling', role: 'read_only_forwarding', current: false, inbox_drop_count: 1 }),
      ]);
    } finally {
      rmSync(authority, { recursive: true, force: true });
      rmSync(sibling, { recursive: true, force: true });
    }
  });

  it('refuses a configured non-authority clone before mutation', () => {
    const authority = testTempDir('narada-authority-');
    const embodiment = testTempDir('narada-embodiment-');
    try {
      mkdirSync(join(embodiment, '.ai'), { recursive: true });
      writeFileSync(join(embodiment, '.ai', 'authority-clone.json'), JSON.stringify({ authority_root: authority }));

      const posture = inspectAuthorityClonePosture(embodiment);
      expect(posture.status).toBe('non_authority_clone');
      expect(() => assertAuthorityCloneForMutation('task claim', [{ cwd: embodiment }]))
        .toThrow(/not the declared Narada proper authority clone/);
    } finally {
      rmSync(authority, { recursive: true, force: true });
      rmSync(embodiment, { recursive: true, force: true });
    }
  });

  it('allows an explicitly admitted temporary authority path from .narada/site.json', () => {
    const authority = testTempDir('narada-authority-');
    const embodiment = testTempDir('narada-embodiment-');
    try {
      mkdirSync(join(embodiment, '.ai'), { recursive: true });
      mkdirSync(join(embodiment, '.narada'), { recursive: true });
      writeFileSync(join(embodiment, '.ai', 'authority-clone.json'), JSON.stringify({
        authority_root: authority,
        embodiments: [
          { id: 'authority', root: authority, role: 'authority', mutation_policy: 'allow' },
          { id: 'windows', root: embodiment, role: 'read_only_forwarding', mutation_policy: 'refuse_or_forward' },
        ],
      }));
      writeFileSync(join(embodiment, '.narada', 'site.json'), JSON.stringify({
        schema: 'narada.site.seed.v0',
        site_id: 'narada-proper',
        repo_root: embodiment,
        site_root: join(embodiment, '.narada'),
        authority_admission: {
          kind: 'operator_explicit_temporary_path_admission',
          admitted_path: embodiment,
          canonical_authority_root: authority,
        },
        admission_state: {
          runtime_state_imported: false,
        },
      }));

      const posture = inspectAuthorityClonePosture(embodiment);

      expect(posture.status).toBe('authority_clone');
      expect(posture.is_authority).toBe(true);
      expect(posture.temporary_authority_admission).toBe(true);
      expect(() => assertAuthorityCloneForMutation('task claim', [{ cwd: embodiment }])).not.toThrow();
    } finally {
      rmSync(authority, { recursive: true, force: true });
      rmSync(embodiment, { recursive: true, force: true });
    }
  });

  it('does not guard read-only or dry-run surfaces', () => {
    expect(shouldGuardAuthorityClone('task read', ['123', {}])).toBe(false);
    expect(shouldGuardAuthorityClone('task graph', [{}])).toBe(false);
    expect(shouldGuardAuthorityClone('task create', [{ dryRun: true }])).toBe(false);
    expect(shouldGuardAuthorityClone('task lifecycle import', [{}])).toBe(true);
  });
});
