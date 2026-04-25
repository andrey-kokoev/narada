import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chapterFinishRangeCommand } from '../../src/commands/chapter-finish-range.js';
import { openTaskLifecycleStore } from '../../src/lib/task-lifecycle-store.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

describe('chapter finish-range operator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-chapter-finish-range-'));
    mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
    mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
    mkdirSync(join(tempDir, '.ai', 'learning', 'accepted'), { recursive: true });
    writeFileSync(join(tempDir, '.ai', 'agents', 'roster.json'), JSON.stringify({
      version: 2,
      updated_at: '2026-01-01T00:00:00Z',
      agents: [{
        agent_id: 'a2',
        role: 'implementer',
        capabilities: ['claim'],
        first_seen_at: '2026-01-01T00:00:00Z',
        last_active_at: '2026-01-01T00:00:00Z',
      }],
    }));
    for (const n of [701, 702]) {
      writeFileSync(
        join(tempDir, '.ai', 'do-not-open', 'tasks', `20260425-${n}-range-task.md`),
        `---\nstatus: opened\n---\n\n# Task ${n}\n\n## Acceptance Criteria\n\n- [ ] Criterion ${n}\n`,
      );
    }
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('claims, proves, finishes, and closes each task in a range', async () => {
    const result = await chapterFinishRangeCommand({
      range: '701-702',
      agent: 'a2',
      summaryPrefix: 'Completed range task',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const parsed = result.result as {
      status: string;
      count: number;
      failures: number;
      tasks: Array<{ task_number: number; close_action: string; evidence_verdict: string }>;
      results?: unknown[];
    };
    expect(parsed.status).toBe('success');
    expect(parsed.count).toBe(2);
    expect(parsed.failures).toBe(0);
    expect(parsed.results).toBeUndefined();
    expect(parsed.tasks).toEqual([
      { task_number: 701, action: 'finished', close_action: 'closed', evidence_verdict: 'complete', failure: undefined },
      { task_number: 702, action: 'finished', close_action: 'closed', evidence_verdict: 'complete', failure: undefined },
    ]);

    const store = openTaskLifecycleStore(tempDir);
    try {
      expect(store.getLifecycleByNumber(701)?.status).toBe('closed');
      expect(store.getLifecycleByNumber(701)?.closure_mode).toBe('agent_finish');
      expect(store.getLifecycleByNumber(702)?.status).toBe('closed');
    } finally {
      store.db.close();
    }
  });
});
