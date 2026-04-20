import { describe, expect, it } from 'vitest';
import {
  classifyCommandScope,
  checkCommandPolicy,
  extractTestFiles,
} from '../../src/lib/verify-policy.js';

describe('verify-policy', () => {
  describe('classifyCommandScope', () => {
    it('classifies pnpm verify', () => {
      expect(classifyCommandScope('pnpm verify')).toBe('verify');
    });

    it('classifies single test file', () => {
      expect(classifyCommandScope('vitest run test/unit/foo.test.ts')).toBe('single-file');
      expect(classifyCommandScope('pnpm --filter @narada2/cli exec vitest run test/commands/foo.test.ts')).toBe('single-file');
    });

    it('classifies multiple test files', () => {
      expect(classifyCommandScope('vitest run test/a.test.ts test/b.test.ts')).toBe('multi-file');
    });

    it('classifies package-level commands', () => {
      expect(classifyCommandScope('pnpm --filter @narada2/charters test')).toBe('package');
      expect(classifyCommandScope('pnpm exec vitest run')).toBe('package');
    });

    it('classifies full-suite commands', () => {
      expect(classifyCommandScope('ALLOW_FULL_TESTS=1 pnpm test:full')).toBe('full-suite');
      expect(classifyCommandScope('pnpm test')).toBe('full-suite');
    });

    it('classifies other commands', () => {
      expect(classifyCommandScope('echo hello')).toBe('other');
    });
  });

  describe('checkCommandPolicy', () => {
    it('allows verify', () => {
      const result = checkCommandPolicy('pnpm verify');
      expect(result.allowed).toBe(true);
      expect(result.scope).toBe('verify');
    });

    it('allows single-file by default', () => {
      const result = checkCommandPolicy('vitest run test/foo.test.ts');
      expect(result.allowed).toBe(true);
      expect(result.scope).toBe('single-file');
    });

    it('rejects multi-file by default', () => {
      const result = checkCommandPolicy('vitest run test/a.test.ts test/b.test.ts');
      expect(result.allowed).toBe(false);
      expect(result.scope).toBe('multi-file');
    });

    it('allows multi-file with override', () => {
      const result = checkCommandPolicy('vitest run test/a.test.ts test/b.test.ts', {
        allowMultiFile: true,
      });
      expect(result.allowed).toBe(true);
    });

    it('rejects package-level by default', () => {
      const result = checkCommandPolicy('pnpm --filter @narada2/charters test');
      expect(result.allowed).toBe(false);
      expect(result.scope).toBe('package');
    });

    it('allows package-level with override', () => {
      const result = checkCommandPolicy('pnpm --filter @narada2/charters test', {
        allowPackage: true,
      });
      expect(result.allowed).toBe(true);
    });

    it('rejects full-suite by default', () => {
      const result = checkCommandPolicy('pnpm test:full');
      expect(result.allowed).toBe(false);
      expect(result.scope).toBe('full-suite');
    });

    it('allows full-suite with override', () => {
      const result = checkCommandPolicy('pnpm test:full', { allowFullSuite: true });
      expect(result.allowed).toBe(true);
    });
  });

  describe('extractTestFiles', () => {
    it('extracts test file paths', () => {
      expect(extractTestFiles('vitest run test/foo.test.ts')).toEqual(['test/foo.test.ts']);
      expect(extractTestFiles('vitest run test/a.test.ts test/b.spec.js')).toEqual([
        'test/a.test.ts',
        'test/b.spec.js',
      ]);
    });

    it('returns empty array when no test files', () => {
      expect(extractTestFiles('pnpm verify')).toEqual([]);
    });
  });
});
