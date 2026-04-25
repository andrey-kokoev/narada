import { vi } from 'vitest';
vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { suggestVerification } from '../../src/lib/file-to-test-mapper.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('file-to-test-mapper', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-mapper-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('suggests verify for docs changes', () => {
    const suggestion = suggestVerification(['docs/system.md'], tempDir);
    expect(suggestion.command).toBe('pnpm verify');
    expect(suggestion.scope).toBe('verify');
    expect(suggestion.confidence).toBe('medium');
  });

  it('suggests verify for task file changes', () => {
    const suggestion = suggestVerification(['.ai/do-not-open/tasks/20260420-999-test.md'], tempDir);
    expect(suggestion.command).toBe('pnpm verify');
    expect(suggestion.scope).toBe('verify');
  });

  it('maps CLI command file to mirrored test', () => {
    const srcDir = join(tempDir, 'packages', 'layers', 'cli', 'src', 'commands');
    const testDir = join(tempDir, 'packages', 'layers', 'cli', 'test', 'commands');
    mkdirSync(srcDir, { recursive: true });
    mkdirSync(testDir, { recursive: true });
    writeFileSync(join(srcDir, 'foo.ts'), 'export const foo = 1;');
    writeFileSync(join(testDir, 'foo.test.ts'), 'test("foo", () => {});');

    const suggestion = suggestVerification([join(srcDir, 'foo.ts')], tempDir);
    expect(suggestion.scope).toBe('single-file');
    expect(suggestion.confidence).toBe('high');
    expect(suggestion.command).toContain('vitest run');
    expect(suggestion.command).toContain('foo.test.ts');
  });

  it('maps CLI lib file to mirrored test', () => {
    const srcDir = join(tempDir, 'packages', 'layers', 'cli', 'src', 'lib');
    const testDir = join(tempDir, 'packages', 'layers', 'cli', 'test', 'lib');
    mkdirSync(srcDir, { recursive: true });
    mkdirSync(testDir, { recursive: true });
    writeFileSync(join(srcDir, 'bar.ts'), 'export const bar = 1;');
    writeFileSync(join(testDir, 'bar.test.ts'), 'test("bar", () => {});');

    const suggestion = suggestVerification([join(srcDir, 'bar.ts')], tempDir);
    expect(suggestion.scope).toBe('single-file');
    expect(suggestion.confidence).toBe('high');
  });

  it('maps control-plane file when exactly one test exists', () => {
    const srcDir = join(tempDir, 'packages', 'layers', 'control-plane', 'src', 'ids');
    const testDir = join(tempDir, 'packages', 'layers', 'control-plane', 'test', 'unit', 'ids');
    mkdirSync(srcDir, { recursive: true });
    mkdirSync(testDir, { recursive: true });
    writeFileSync(join(srcDir, 'event-id.ts'), 'export const id = 1;');
    writeFileSync(join(testDir, 'event-id.test.ts'), 'test("id", () => {});');

    const suggestion = suggestVerification([join(srcDir, 'event-id.ts')], tempDir);
    expect(suggestion.scope).toBe('single-file');
    expect(suggestion.confidence).toBe('high');
    expect(suggestion.command).toContain('event-id.test.ts');
  });

  it('falls back to verify when no mapping found', () => {
    const suggestion = suggestVerification(['packages/layers/cli/src/unknown.ts'], tempDir);
    expect(suggestion.command).toBe('pnpm verify');
    expect(suggestion.scope).toBe('verify');
    expect(suggestion.confidence).toBe('low');
  });

  it('suggests multi-file when multiple tests mapped', () => {
    const srcDir1 = join(tempDir, 'packages', 'layers', 'cli', 'src', 'commands');
    const srcDir2 = join(tempDir, 'packages', 'layers', 'cli', 'src', 'lib');
    const testDir1 = join(tempDir, 'packages', 'layers', 'cli', 'test', 'commands');
    const testDir2 = join(tempDir, 'packages', 'layers', 'cli', 'test', 'lib');
    mkdirSync(srcDir1, { recursive: true });
    mkdirSync(srcDir2, { recursive: true });
    mkdirSync(testDir1, { recursive: true });
    mkdirSync(testDir2, { recursive: true });
    writeFileSync(join(srcDir1, 'a.ts'), '');
    writeFileSync(join(srcDir2, 'b.ts'), '');
    writeFileSync(join(testDir1, 'a.test.ts'), '');
    writeFileSync(join(testDir2, 'b.test.ts'), '');

    const suggestion = suggestVerification(
      [join(srcDir1, 'a.ts'), join(srcDir2, 'b.ts')],
      tempDir,
    );
    expect(suggestion.scope).toBe('multi-file');
    expect(suggestion.command).toContain('a.test.ts');
    expect(suggestion.command).toContain('b.test.ts');
  });
});
