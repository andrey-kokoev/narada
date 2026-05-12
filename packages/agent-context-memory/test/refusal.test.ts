import { describe, expect, it } from 'vitest';
import { DeniedSourceImportError, assertNoDeniedSourceImports, findDeniedSourceImports } from '../src/index.js';

describe('agent-context memory import refusal', () => {
  it('detects source runtime state imports', () => {
    const findings = findDeniedSourceImports([
      'C:\\Users\\Andrey\\Narada\\.ai\\state\\agent-context.sqlite',
      'C:\\Users\\Andrey\\Narada\\.narada\\checkpoints\\thread.md',
      'C:\\Users\\Andrey\\Narada\\.ai\\agents\\roster.json',
      'C:\\ProgramData\\Narada\\sites\\pc\\desktop-sunroom-2\\runtime\\operator-surface-input-events\\input.json',
      'C:\\Users\\Andrey\\.codex\\sessions\\session.json',
    ]);

    expect(findings.map((finding) => finding.reason)).toEqual([
      'source agent-context database',
      'source checkpoint history',
      'source roster authority',
      'PC-locus runtime state',
      'identity-specific agent runtime state',
    ]);
  });

  it('throws before source state admission', () => {
    expect(() => assertNoDeniedSourceImports(['C:\\Users\\Andrey\\Narada\\secrets\\token.txt']))
      .toThrow(DeniedSourceImportError);
  });
});
