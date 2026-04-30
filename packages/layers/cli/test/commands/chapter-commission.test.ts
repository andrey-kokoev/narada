import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chapterCommissionCommand } from '../../src/commands/chapter-commission.js';
import { openTaskLifecycleStore } from '../../src/lib/task-lifecycle-store.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

process.env.NARADA_TASK_LIFECYCLE_FAST_SQLITE = '1';

function setupRepo(tempDir: string): void {
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
  const store = openTaskLifecycleStore(tempDir);
  try {
    store.ensureTaskNumberFloor(120);
  } finally {
    store.db.close();
  }
}

function writeCommissionInput(tempDir: string, body: unknown): string {
  const path = join(tempDir, 'commission.json');
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  return 'commission.json';
}

describe('chapter commission command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-chapter-commission-test-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('commissions a chapter and ordered tasks from structured input', async () => {
    const input = writeCommissionInput(tempDir, {
      slug: 'batch-ergonomics',
      title: 'Batch Ergonomics',
      depends_on: [100],
      tasks: [
        {
          title: 'Preserve criteria arrays',
          goal: 'Criteria arrays survive commissioning.',
          required_work: ['Do first thing', 'Do second thing'],
          non_goals: ['Do not comma-join Alpha, Beta', 'Do not flatten lists'],
          acceptance_criteria: ['Preserve Smith, Jane as one item', 'Create lifecycle row'],
        },
        {
          title: 'Return bounded output',
          goal: 'Output names only the useful coordinates.',
          acceptance_criteria: ['Summary is compact'],
        },
      ],
    });

    const result = await chapterCommissionCommand({ cwd: tempDir, input, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const commissioned = result.result as {
      chapter: { task_numbers: number[]; path: string };
      tasks: Array<{ task_number: number; task_id: string; file_path: string; acceptance_criteria: string[] }>;
      lifecycle_statuses: Array<{ task_number: number; status: string }>;
      bounded_output: boolean;
    };
    expect(commissioned.chapter.task_numbers).toEqual([121, 122]);
    expect(commissioned.tasks).toHaveLength(2);
    expect(commissioned.tasks[0]!.acceptance_criteria).toEqual([
      'Preserve Smith, Jane as one item',
      'Create lifecycle row',
    ]);
    expect(commissioned.lifecycle_statuses).toEqual([
      { task_number: 121, status: 'opened' },
      { task_number: 122, status: 'opened' },
    ]);
    expect(commissioned.bounded_output).toBe(true);
    expect(readFileSync(commissioned.chapter.path, 'utf8')).toContain('Batch Ergonomics');
    const firstTaskContent = readFileSync(commissioned.tasks[0]!.file_path, 'utf8');
    expect(firstTaskContent).toContain('1. Do first thing');
    expect(firstTaskContent).toContain('2. Do second thing');
    expect(firstTaskContent).toContain('- Do not comma-join Alpha, Beta');
    expect(firstTaskContent).not.toContain('Do first thing,Do second thing');
    expect(firstTaskContent).toContain('- [ ] Preserve Smith, Jane as one item');

    const store = openTaskLifecycleStore(tempDir);
    try {
      expect(store.getLastAllocated()).toBe(122);
      expect(store.getLifecycleByNumber(121)?.status).toBe('opened');
      const spec = store.getTaskSpecByNumber(121);
      expect(spec!.required_work_markdown).toContain('1. Do first thing');
      expect(spec!.non_goals_markdown).toContain('- Do not comma-join Alpha, Beta');
      expect(JSON.parse(spec!.acceptance_criteria_json)).toEqual([
        'Preserve Smith, Jane as one item',
        'Create lifecycle row',
      ]);
      expect(JSON.parse(spec!.dependencies_json)).toEqual([100]);
    } finally {
      store.db.close();
    }
  });

  it('rejects invalid structured input before allocation or files', async () => {
    const input = writeCommissionInput(tempDir, {
      slug: 'bad-batch',
      title: 'Bad Batch',
      tasks: [
        {
          title: 'Missing criteria',
          goal: 'This should fail.',
        },
      ],
    });

    const result = await chapterCommissionCommand({ cwd: tempDir, input, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'error',
      error: expect.stringContaining('acceptance_criteria'),
    });
    expect(readdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'))).toEqual([]);
    const store = openTaskLifecycleStore(tempDir);
    try {
      expect(store.getLastAllocated()).toBe(120);
      expect(store.getAllLifecycle()).toEqual([]);
    } finally {
      store.db.close();
    }
  });

  it('returns compact dry-run output without mutating lifecycle', async () => {
    const input = writeCommissionInput(tempDir, {
      slug: 'dry-run-batch',
      title: 'Dry Run Batch',
      tasks: [
        { title: 'One', goal: 'One goal', acceptance_criteria: ['One criterion'] },
      ],
    });

    const result = await chapterCommissionCommand({ cwd: tempDir, input, dryRun: true, format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'dry_run',
      mutation_performed: false,
      bounded_output: true,
      dirty_published_posture: {
        portable_state_requires_export: false,
      },
    });
    expect(readdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'))).toEqual([]);
    const store = openTaskLifecycleStore(tempDir);
    try {
      expect(store.getLastAllocated()).toBe(120);
    } finally {
      store.db.close();
    }
  });
});
