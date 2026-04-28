import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inboxIngestFilesCommand, inboxListCommand } from '../../src/commands/inbox.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

describe('inbox ingest-files', () => {
  let tempDir: string;
  let dropDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-inbox-ingest-files-'));
    dropDir = join(tempDir, '.ai', 'inbox-drop');
    mkdirSync(dropDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('dry-runs dated numbered file candidates without mutating inbox', async () => {
    writeFileSync(join(dropDir, '20260428-001-mailbox-filter.md'), '# Mailbox filter\n\nAdmit this.\n');

    const result = await inboxIngestFilesCommand({ cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      mode: 'dry_run',
      count: 1,
      admissible: 1,
      admitted: 0,
    });

    const listed = await inboxListCommand({ cwd: tempDir, format: 'json' });
    expect(listed.result).toMatchObject({ count: 0 });
  });

  it('admits a dated numbered markdown file as one file_drop envelope', async () => {
    writeFileSync(
      join(dropDir, '20260428-002-human-message.md'),
      [
        '---',
        'kind: task_candidate',
        'title: Human message',
        '---',
        '',
        'Turn this into governed work.',
        '',
      ].join('\n'),
    );

    const result = await inboxIngestFilesCommand({ cwd: tempDir, format: 'json', admit: true, by: 'architect' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({ admitted: 1, skipped: 0, rejected: 0 });

    const listed = await inboxListCommand({ cwd: tempDir, format: 'json', status: 'received' });
    const envelopes = (listed.result as { envelopes: Array<Record<string, unknown>> }).envelopes;
    expect(envelopes).toHaveLength(1);
    expect(envelopes[0]).toMatchObject({
      source: { kind: 'file_drop' },
      kind: 'task_candidate',
      authority: { level: 'user_statement', principal: 'architect' },
    });
  });

  it('admits a dated numbered folder using README body and supporting file metadata', async () => {
    const folder = join(dropDir, '20260428-003-folder-message');
    mkdirSync(folder);
    writeFileSync(join(folder, 'README.md'), '# Folder message\n\nBody text.\n');
    writeFileSync(join(folder, 'evidence.log'), 'support\n');

    const result = await inboxIngestFilesCommand({ cwd: tempDir, format: 'json', admit: true, by: 'architect' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const candidates = (result.result as { candidates: Array<Record<string, unknown>> }).candidates;
    expect(candidates[0]).toMatchObject({
      status: 'admitted',
      item_kind: 'folder',
      supporting_file_count: 1,
      title: 'Folder message',
    });
  });

  it('rejects invalid item names and folders without body files', async () => {
    writeFileSync(join(dropDir, 'not-numbered.md'), 'hello\n');
    const folder = join(dropDir, '20260428-004-empty-folder');
    mkdirSync(folder);
    writeFileSync(join(folder, 'note.txt'), 'not a canonical body file\n');

    const result = await inboxIngestFilesCommand({ cwd: tempDir, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({ count: 2, rejected: 2 });
    const candidates = (result.result as { candidates: Array<Record<string, unknown>> }).candidates;
    expect(candidates.map((item) => item.status)).toEqual(['rejected', 'rejected']);
  });

  it('skips duplicate admits by stable path and digest source ref', async () => {
    writeFileSync(join(dropDir, '20260428-005-repeat.md'), '# Repeat\n\nSame content.\n');

    const first = await inboxIngestFilesCommand({ cwd: tempDir, format: 'json', admit: true, by: 'architect' });
    const second = await inboxIngestFilesCommand({ cwd: tempDir, format: 'json', admit: true, by: 'architect' });

    expect(first.result).toMatchObject({ admitted: 1 });
    expect(second.result).toMatchObject({ admitted: 0, skipped: 1 });
    const listed = await inboxListCommand({ cwd: tempDir, format: 'json', status: 'received' });
    expect(listed.result).toMatchObject({ count: 1 });
  });
});
