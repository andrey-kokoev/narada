import { describe, expect, it } from 'vitest';
import {
  DeniedSourceImportError,
  NonNeutralIdentityError,
  assertNeutralIdentities,
  assertNoDeniedSourceImports,
  findDeniedSourceImports,
} from '../src/index.js';
import { neutralRoster } from './fixtures/neutral-site.js';

describe('source import refusal', () => {
  it('detects denied andrey-user runtime and PC-locus inputs', () => {
    const findings = findDeniedSourceImports([
      'C:\\Users\\Andrey\\Narada\\.ai\\task-lifecycle.db',
      'C:\\Users\\Andrey\\Narada\\.ai\\do-not-open\\tasks\\20260501-1.md',
      'C:\\Users\\Andrey\\Narada\\.ai\\inbox.db',
      'C:\\ProgramData\\Narada\\sites\\pc\\desktop-sunroom-2\\runtime\\operator-surface-runtime.db',
    ]);

    expect(findings.map((finding) => finding.reason)).toEqual([
      'source task lifecycle database',
      'source task history',
      'source inbox database',
      'PC-locus runtime state',
    ]);
  });

  it('throws when denied source imports are requested', () => {
    expect(() => assertNoDeniedSourceImports(['C:\\Users\\Andrey\\Narada\\.ai\\agents\\roster.json']))
      .toThrow(DeniedSourceImportError);
  });

  it('accepts neutral fixture identities and rejects source-Site identities', () => {
    expect(() => assertNeutralIdentities(neutralRoster)).not.toThrow();
    expect(() => assertNeutralIdentities([{ identityId: 'andrey-user.Kevin', role: 'architect' }]))
      .toThrow(NonNeutralIdentityError);
  });
});
