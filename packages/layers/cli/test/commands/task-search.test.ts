import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { taskSearchCommand } from '../../src/commands/task-search.js';
import { openTaskLifecycleStore } from '../../src/lib/task-lifecycle-store.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

describe('task search operator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-task-search-'));
    mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('uses SQLite lifecycle and task spec metadata when searching markdown text', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260425-711-search.md'),
      `---\nstatus: opened\n---\n\n# Markdown Title\n\nSearch needle lives in compatibility markdown.\n`,
    );
    const store = openTaskLifecycleStore(tempDir);
    try {
      store.upsertLifecycle({
        task_id: '20260425-711-search',
        task_number: 711,
        status: 'closed',
        governed_by: 'task_close:test',
        closed_at: '2026-04-25T00:00:00Z',
        closed_by: 'test',
        closure_mode: 'operator_direct',
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-04-25T00:00:00Z',
      });
      store.upsertTaskSpec({
        task_id: '20260425-711-search',
        task_number: 711,
        title: 'SQLite Spec Title',
        chapter_markdown: null,
        goal_markdown: null,
        context_markdown: null,
        required_work_markdown: null,
        non_goals_markdown: null,
        acceptance_criteria_json: '[]',
        dependencies_json: '[]',
        updated_at: '2026-04-25T00:00:00Z',
      });
    } finally {
      store.db.close();
    }

    const result = await taskSearchCommand({
      query: 'needle',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const body = result.result as { results: Array<{ title?: string; status?: string }> };
    expect(body.results).toHaveLength(1);
    expect(body.results[0]!.title).toBe('SQLite Spec Title');
    expect(body.results[0]!.status).toBe('closed');
  });
});
