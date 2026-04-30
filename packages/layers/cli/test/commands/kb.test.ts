import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { kbAliasAddCommand, kbLintCommand, kbSearchCommand } from '../../src/commands/kb.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

describe('kb lookup metadata commands', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-kb-test-'));
    mkdirSync(join(tempDir, 'kb', 'cpy'), { recursive: true });
    writeFileSync(
      join(tempDir, 'kb', 'cpy', 'parquet-desync.md'),
      '# CPY Data Refresh Runbook\n\nCanonical implementation notes mention object storage and ELT reconciliation only.\n',
    );
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('adds lookup aliases and symptoms without manual prose editing and finds by symptom phrase', async () => {
    const add = await kbAliasAddCommand({
      cwd: tempDir,
      file: 'kb/cpy/parquet-desync.md',
      alias: ['studio week wrong numbers'],
      symptom: ['parquet desync'],
      system: ['cpy'],
      failureMode: ['derived dataset stale'],
      by: 'operator',
      format: 'json',
    });

    expect(add.exitCode).toBe(ExitCode.SUCCESS);
    expect(add.result).toMatchObject({
      status: 'success',
      mutation_performed: true,
      metadata: {
        lookup_aliases: ['studio week wrong numbers'],
        symptoms: ['parquet desync'],
        systems: ['cpy'],
        failure_modes: ['derived dataset stale'],
      },
    });
    const raw = readFileSync(join(tempDir, 'kb', 'cpy', 'parquet-desync.md'), 'utf8');
    expect(raw).toContain('lookup_aliases');
    expect(raw).toContain('parquet desync');

    const search = await kbSearchCommand({
      cwd: tempDir,
      query: 'parquet desync',
      format: 'json',
    });

    expect(search.exitCode).toBe(ExitCode.SUCCESS);
    expect(search.result).toMatchObject({
      status: 'success',
      count: 1,
      matches: [{
        path: 'kb/cpy/parquet-desync.md',
        title: 'CPY Data Refresh Runbook',
        matched_fields: expect.arrayContaining(['symptoms']),
      }],
      authority_boundary: expect.stringContaining('Site-local KB/runbook files only'),
    });
  });

  it('lints incident runbooks for future operator search phrases', async () => {
    const lint = await kbLintCommand({
      cwd: tempDir,
      format: 'json',
    });

    expect(lint.exitCode).toBe(ExitCode.SUCCESS);
    expect(lint.result).toMatchObject({
      status: 'warning',
      findings: [{
        path: 'kb/cpy/parquet-desync.md',
        finding: 'missing_lookup_aliases_or_symptoms',
        closure_question: 'What would the Operator or future agent search for next time?',
        repair_command: expect.stringContaining('narada kb alias add'),
      }],
    });
  });
});
