import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertAuthorityCloneForMutation,
  inspectAuthorityClonePosture,
  shouldGuardAuthorityClone,
} from '../../src/lib/narada-proper-authority.js';

describe('Narada proper authority clone routing', () => {
  it('allows mutating commands when no authority clone is configured', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'narada-unconfigured-'));
    try {
      const posture = inspectAuthorityClonePosture(cwd);
      expect(posture.status).toBe('unconfigured');
      expect(() => assertAuthorityCloneForMutation('task claim', [{ cwd }])).not.toThrow();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('allows the declared authority clone', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'narada-authority-'));
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

  it('refuses a configured non-authority clone before mutation', () => {
    const authority = mkdtempSync(join(tmpdir(), 'narada-authority-'));
    const embodiment = mkdtempSync(join(tmpdir(), 'narada-embodiment-'));
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

  it('does not guard read-only or dry-run surfaces', () => {
    expect(shouldGuardAuthorityClone('task read', ['123', {}])).toBe(false);
    expect(shouldGuardAuthorityClone('task graph', [{}])).toBe(false);
    expect(shouldGuardAuthorityClone('task create', [{ dryRun: true }])).toBe(false);
    expect(shouldGuardAuthorityClone('task lifecycle import', [{}])).toBe(true);
  });
});
