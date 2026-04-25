import { vi } from 'vitest';
vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { verifyExplainCommand } from '../../src/commands/verify-explain.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('verify-explain command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-verify-explain-test-'));
    mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns error when no task number provided', async () => {
    const result = await verifyExplainCommand(
      {},
      { configPath: './config.json', verbose: false, logger: {} as any },
    );
    expect(result.exitCode).toBe(1);
    expect((result.result as any).status).toBe('error');
  });

  it('returns error when task not found', async () => {
    const result = await verifyExplainCommand(
      { taskNumber: '999', cwd: tempDir },
      { configPath: './config.json', verbose: false, logger: {} as any },
    );
    expect(result.exitCode).toBe(1);
    expect((result.result as any).status).toBe('error');
    expect((result.result as any).error).toContain('not found');
  });

  it('reports no inference when task has no file paths', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'),
      '---\ntask_id: 999\nstatus: opened\n---\n\n# Task 999\n\nJust words, no file paths.\n',
    );

    const result = await verifyExplainCommand(
      { taskNumber: '999', cwd: tempDir },
      { configPath: './config.json', verbose: false, logger: {} as any },
    );
    expect(result.exitCode).toBe(0);
    const data = result.result as any;
    expect(data.inference).toBe('none');
    expect(data.message).toContain('Could not infer');
  });

  it('infers files and suggests verification from task content', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-998-test-task.md'),
      '---\ntask_id: 998\nstatus: opened\n---\n\n# Task 998\n\nModify `packages/layers/cli/src/commands/foo.ts` and `packages/layers/cli/src/lib/bar.ts`.\n',
    );

    const result = await verifyExplainCommand(
      { taskNumber: '998', cwd: tempDir },
      { configPath: './config.json', verbose: false, logger: {} as any },
    );
    expect(result.exitCode).toBe(0);
    const data = result.result as any;
    expect(data.inference).toBe('derived');
    expect(data.inferred_files).toContain('packages/layers/cli/src/commands/foo.ts');
    expect(data.inferred_files).toContain('packages/layers/cli/src/lib/bar.ts');
    expect(data.suggestion).toBeDefined();
    expect(data.suggestion.command).toBe('pnpm verify');
    expect(data.suggestion.policy.allowed).toBe(true);
  });
});
