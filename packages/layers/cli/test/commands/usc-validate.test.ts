import { vi } from 'vitest';
vi.unmock('node:fs');
vi.unmock('node:fs/promises');

// Override the global USC mock so this test simulates missing USC packages
vi.mock('@narada.usc/core/src/validator.js', () => ({
  validateAll: vi.fn(() => {
    throw new Error('USC packages are not installed');
  }),
}));

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { uscValidateCommand } from '../../src/commands/usc-validate.js';
import { validateUscRepo, populateSchemaCache } from '../../src/lib/usc-schema-cache.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('usc-validate command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-usc-validate-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('reports error when target path is missing', async () => {
    const result = await uscValidateCommand({ path: '' });
    expect(result.exitCode).not.toBe(0);
    expect((result.result as any).status).toBe('error');
  });

  it('falls back to cached schemas when USC packages are unavailable', async () => {
    // Create a mock USC repo with required files
    const uscDir = join(tempDir, 'usc');
    mkdirSync(uscDir, { recursive: true });
    writeFileSync(
      join(uscDir, 'construction-state.json'),
      JSON.stringify({ name: 'test-app', version: 1 }),
    );
    writeFileSync(
      join(uscDir, 'task-graph.json'),
      JSON.stringify({ tasks: [] }),
    );

    // Populate cache with a schema that has required keys
    const cacheDir = join(tempDir, '.ai', 'usc-schema-cache');
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      join(cacheDir, 'construction-state.schema.json'),
      JSON.stringify({ type: 'object', required: ['name'] }),
    );
    writeFileSync(
      join(cacheDir, 'task-graph.schema.json'),
      JSON.stringify({ type: 'object', required: ['tasks'] }),
    );

    // USC packages are not installed in this test environment
    const validation = await validateUscRepo(tempDir);

    // Should use cached-schema fallback
    expect(validation.results.every((r) => r.source === 'cached-schema')).toBe(true);
    expect(validation.allPassed).toBe(true);
    expect(validation.results).toHaveLength(2);
  });

  it('cached-schema fallback detects missing required keys', async () => {
    const uscDir = join(tempDir, 'usc');
    mkdirSync(uscDir, { recursive: true });
    // construction-state.json missing required 'name' key
    writeFileSync(join(uscDir, 'construction-state.json'), JSON.stringify({ version: 1 }));
    writeFileSync(join(uscDir, 'task-graph.json'), JSON.stringify({ tasks: [] }));

    const cacheDir = join(tempDir, '.ai', 'usc-schema-cache');
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      join(cacheDir, 'construction-state.schema.json'),
      JSON.stringify({ type: 'object', required: ['name'] }),
    );
    writeFileSync(
      join(cacheDir, 'task-graph.schema.json'),
      JSON.stringify({ type: 'object', required: ['tasks'] }),
    );

    const validation = await validateUscRepo(tempDir);
    expect(validation.allPassed).toBe(false);
    const csResult = validation.results.find((r) => r.name === 'construction-state.json');
    expect(csResult?.valid).toBe(false);
    expect(csResult?.errors.some((e) => e.includes('name'))).toBe(true);
  });

  it('falls back gracefully when no cache exists', async () => {
    const uscDir = join(tempDir, 'usc');
    mkdirSync(uscDir, { recursive: true });
    writeFileSync(join(uscDir, 'construction-state.json'), JSON.stringify({}));
    writeFileSync(join(uscDir, 'task-graph.json'), JSON.stringify({}));

    // No schema cache populated
    const validation = await validateUscRepo(tempDir);
    expect(validation.allPassed).toBe(false);
    const cacheResult = validation.results.find((r) => r.name === 'schema-cache');
    expect(cacheResult?.valid).toBe(false);
    expect(cacheResult?.errors[0]).toContain('No cached schemas');
  });

  it('CLI returns structured result for fallback validation', async () => {
    const uscDir = join(tempDir, 'usc');
    mkdirSync(uscDir, { recursive: true });
    writeFileSync(
      join(uscDir, 'construction-state.json'),
      JSON.stringify({ name: 'test', version: 1 }),
    );
    writeFileSync(join(uscDir, 'task-graph.json'), JSON.stringify({ tasks: [] }));

    const cacheDir = join(tempDir, '.ai', 'usc-schema-cache');
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      join(cacheDir, 'construction-state.schema.json'),
      JSON.stringify({ type: 'object', required: ['name'] }),
    );
    writeFileSync(
      join(cacheDir, 'task-graph.schema.json'),
      JSON.stringify({ type: 'object', required: ['tasks'] }),
    );

    const result = await uscValidateCommand({ path: tempDir });
    expect(result.exitCode).toBe(0);
    const data = result.result as any;
    expect(data.status).toBe('success');
    expect(data.allPassed).toBe(true);
    expect(data.results.every((r: any) => r.source === 'cached-schema')).toBe(true);
  });
});
