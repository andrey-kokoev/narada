import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { roleLoopNextCommand } from '../../src/commands/role-loop.js';
import { openTaskLifecycleStore } from '../../src/lib/task-lifecycle-store.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

describe('role-loop next command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-role-loop-'));
    mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
    execFileSync(process.env.NARADA_GIT_BINARY ?? '/usr/bin/git', ['init', '-b', 'main'], { cwd: tempDir });
    execFileSync(process.env.NARADA_GIT_BINARY ?? '/usr/bin/git', ['config', 'user.email', 'test@example.invalid'], { cwd: tempDir });
    execFileSync(process.env.NARADA_GIT_BINARY ?? '/usr/bin/git', ['config', 'user.name', 'Test Agent'], { cwd: tempDir });
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260430-20-review.md'),
      '---\ntask_id: 20260430-20-review\nstatus: in_review\n---\n\n# Pending review\n\n## Goal\nReview it.\n',
    );
    const store = openTaskLifecycleStore(tempDir);
    try {
      store.upsertRosterEntry({
        agent_id: 'architect',
        role: 'architect',
        capabilities_json: JSON.stringify(['review']),
        first_seen_at: '2026-04-30T00:00:00.000Z',
        last_active_at: '2026-04-30T00:00:00.000Z',
        status: 'idle',
        task_number: null,
        last_done: null,
        updated_at: '2026-04-30T00:00:00.000Z',
      });
      store.upsertLifecycle({
        task_id: '20260430-20-review',
        task_number: 20,
        status: 'in_review',
        governed_by: null,
        closed_at: null,
        closed_by: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-04-30T00:00:00.000Z',
      });
      store.upsertTaskSpec({
        task_id: '20260430-20-review',
        task_number: 20,
        title: 'Pending review',
        chapter_markdown: null,
        goal_markdown: 'Review it.',
        context_markdown: null,
        required_work_markdown: '1. Review.',
        non_goals_markdown: null,
        acceptance_criteria_json: JSON.stringify(['Reviewed.']),
        dependencies_json: JSON.stringify([]),
        updated_at: '2026-04-30T00:00:00.000Z',
      });
    } finally {
      store.db.close();
    }
    execFileSync(process.env.NARADA_GIT_BINARY ?? '/usr/bin/git', ['add', '.'], { cwd: tempDir });
    execFileSync(process.env.NARADA_GIT_BINARY ?? '/usr/bin/git', ['commit', '-m', 'base'], { cwd: tempDir });
    writeFileSync(join(tempDir, 'packages.txt'), 'dirty\n');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('covers Architect review identity path quickly without the full work-next fixture', async () => {
    const result = await roleLoopNextCommand({ cwd: tempDir, role: 'architect', format: 'json' });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'success',
      mutation_performed: false,
      schema: 'https://narada.dev/schemas/role-loop-next/v1',
      agent: 'architect',
      mode: 'peek_compact',
      duty_loop_state: 'handoff_needed',
      duty_loop_transition_basis: {
        pending_reviews_count: 1,
        dirty: true,
      },
      next: {
        action_kind: 'idle',
        pending_reviews_count: 1,
      },
      recommended_command: 'Builder no-work is not system idle; Architect/reviewer must clear pending review or closure work.',
      dirty_ownership: {
        dirty: true,
        count: expect.any(Number),
        groups: {
          unknown: 1,
        },
      },
      role_loop_contract: expect.stringContaining('Operator nudge `next`'),
    });
    expect(JSON.stringify(result.result)).not.toContain('Review it.');
    expect(JSON.stringify(result.result)).not.toContain('--agent architect --verdict accepted');
  });
});
