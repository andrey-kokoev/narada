import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  uscInitCommand,
  satisfiesVersionRange,
  checkUscVersion,
} from '../../src/commands/usc-init.js';
import {
  populateSchemaCache,
  hasSchemaCache,
  getCachedSchemaPath,
  listCachedSchemas,
} from '../../src/lib/usc-schema-cache.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* ── Mock USC packages (soft dependencies, may not be installed) ────────── */

vi.mock('@narada.usc/compiler', () => ({
  initRepo: vi.fn(),
  plan: vi.fn(() => ({
    taskGraphPath: '/test/usc/task-graph.json',
    summary: { task_count: 1, proposed_count: 0, admitted_count: 1 },
  })),
  createCycle: vi.fn(),
}));

vi.mock('@narada.usc/compiler/src/refine-intent.js', () => ({
  refineIntent: vi.fn(() => Promise.resolve({ detected_domain: 'test' })),
}));

vi.mock('@narada.usc/core/src/validator.js', () => ({
  validateAll: vi.fn(() => ({ results: [], allPassed: true })),
}));

/* ── Mock node:module so createRequire resolves our fake USC packages ───── */

let fakeUscRoot = '';

vi.mock('node:module', async () => {
  const actual = await vi.importActual<typeof import('node:module')>('node:module');
  return {
    ...actual,
    createRequire: vi.fn(() => ({
      resolve: vi.fn((id: string) => {
        if (id === '@narada.usc/compiler/package.json') {
          return join(fakeUscRoot, 'packages', 'compiler', 'package.json');
        }
        throw new Error(`Cannot resolve ${id}`);
      }),
    })),
  };
});

/* ── Tests ──────────────────────────────────────────────────────────────── */

describe(' USC version utilities', () => {
  it('satisfies exact version', () => {
    expect(satisfiesVersionRange('1.0.0', '1.0.0')).toBe(true);
    expect(satisfiesVersionRange('1.0.0', '2.0.0')).toBe(false);
  });

  it('satisfies caret (^) range', () => {
    expect(satisfiesVersionRange('^1.0.0', '1.0.0')).toBe(true);
    expect(satisfiesVersionRange('^1.0.0', '1.2.3')).toBe(true);
    expect(satisfiesVersionRange('^1.0.0', '2.0.0')).toBe(false);
    expect(satisfiesVersionRange('^0.5.0', '0.5.1')).toBe(true);
    expect(satisfiesVersionRange('^0.5.0', '0.6.0')).toBe(false);
  });

  it('reads expected version from Narada root package.json', () => {
    const expected = checkUscVersion().expected;
    // The real repo root has config.uscVersion set
    expect(expected).toBe('^1.0.0');
  });
});

describe('usc-init command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-usc-init-test-'));
    fakeUscRoot = tempDir;

    // Create fake USC compiler package with compatible version
    const compilerPkgDir = join(tempDir, 'packages', 'compiler');
    mkdirSync(compilerPkgDir, { recursive: true });
    writeFileSync(
      join(compilerPkgDir, 'package.json'),
      JSON.stringify({ name: '@narada.usc/compiler', version: '1.2.3' }),
    );

    // Create a fake schema directory
    const schemaDir = join(tempDir, 'packages', 'compiler', 'schemas');
    mkdirSync(schemaDir, { recursive: true });
    writeFileSync(
      join(schemaDir, 'construction-state.schema.json'),
      JSON.stringify({ type: 'object', properties: {} }),
    );

    // Silence console output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('throws with clear error on version mismatch', async () => {
    // Override the fake package to an incompatible version
    writeFileSync(
      join(tempDir, 'packages', 'compiler', 'package.json'),
      JSON.stringify({ name: '@narada.usc/compiler', version: '2.0.0' }),
    );

    const targetDir = join(tempDir, 'target');
    await expect(uscInitCommand({ path: targetDir })).rejects.toThrow(
      'USC compiler version 2.0.0 is installed; Narada requires ^1.0.0',
    );
  });

  it('throws with install hint when USC is not installed', async () => {
    // Make createRequire throw for the compiler package
    fakeUscRoot = '/nonexistent';
    const targetDir = join(tempDir, 'target');
    await expect(uscInitCommand({ path: targetDir })).rejects.toThrow(
      'USC packages are not installed',
    );
  });

  it('initializes a USC repo on happy path', async () => {
    fakeUscRoot = tempDir;
    const targetDir = join(tempDir, 'target');

    await uscInitCommand({ path: targetDir, name: 'test-app' });

    expect(existsSync(join(targetDir, 'usc', 'artifacts'))).toBe(true);
    expect(existsSync(join(targetDir, 'README.md'))).toBe(true);

    const readme = readFileSync(join(targetDir, 'README.md'), 'utf8');
    expect(readme).toContain('narada.usc.test-app');
  });

  it('caches schemas after successful init', async () => {
    fakeUscRoot = tempDir;
    const targetDir = join(tempDir, 'target');

    await uscInitCommand({ path: targetDir, name: 'test-app' });

    expect(hasSchemaCache(targetDir)).toBe(true);
    const schemas = listCachedSchemas(targetDir);
    expect(schemas).toContain('construction-state.schema.json');
    expect(getCachedSchemaPath(targetDir, 'construction-state.schema.json')).not.toBeNull();
  });

  it('populates schema cache directly', () => {
    const targetDir = join(tempDir, 'target');
    const result = populateSchemaCache(tempDir, targetDir);
    expect(result.cached).toBe(1);
    expect(hasSchemaCache(targetDir)).toBe(true);
  });

  it('skips gracefully when USC packages are missing (schema cache)', () => {
    const targetDir = join(tempDir, 'target');
    const result = populateSchemaCache('/nonexistent/usc', targetDir);
    expect(result.cached).toBe(0);
    expect(hasSchemaCache(targetDir)).toBe(false);
  });

  it('handles intent refinement when --intent is provided', async () => {
    fakeUscRoot = tempDir;
    const targetDir = join(tempDir, 'target');

    await uscInitCommand({ path: targetDir, name: 'test-app', intent: 'Build a test app' });

    expect(existsSync(join(targetDir, 'usc', 'refinement.json'))).toBe(true);
    expect(existsSync(join(targetDir, 'usc', 'refinement.md'))).toBe(true);
  });
});
