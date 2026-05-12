import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { roleLoopNextCommand, roleLoopNextObligationCommand } from '../../src/commands/role-loop.js';
import { openTaskLifecycleStore } from '../../src/lib/task-lifecycle-store.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

function gitBinary(): string {
  return process.env.NARADA_GIT_BINARY ?? (process.platform === 'win32' ? 'git' : '/usr/bin/git');
}

describe('role-loop next command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-role-loop-'));
    mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
    execFileSync(gitBinary(), ['init', '-b', 'main'], { cwd: tempDir });
    execFileSync(gitBinary(), ['config', 'user.email', 'test@example.invalid'], { cwd: tempDir });
    execFileSync(gitBinary(), ['config', 'user.name', 'Test Agent'], { cwd: tempDir });
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
    execFileSync(gitBinary(), ['add', '.'], { cwd: tempDir });
    execFileSync(gitBinary(), ['commit', '-m', 'base'], { cwd: tempDir });
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
      workboard_summary: {
        exploration_required_for_full_payload: true,
      },
      role_loop_contract: expect.stringContaining('Operator nudge `next`'),
    });
    expect(result.result).not.toHaveProperty('workboard');
    expect(JSON.stringify(result.result)).not.toContain('Review it.');
    expect(JSON.stringify(result.result)).not.toContain('--agent architect --verdict accepted');
  });

  it('requires an explicit flag before returning compact workboard exploration payload', async () => {
    const result = await roleLoopNextCommand({
      cwd: tempDir,
      role: 'architect',
      includeWorkboard: true,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      workboard_summary: {
        exploration_required_for_full_payload: true,
      },
      workboard: {
        counts: expect.any(Object),
        recommended_command: 'narada task workboard --view compact --format json',
      },
    });
  });

  it('returns one bounded next obligation without workboard or doctrine transcript payloads', async () => {
    const store = openTaskLifecycleStore(tempDir);
    try {
      store.upsertDirectedObligation({
        obligation_id: 'obl_review_20',
        source_kind: 'task_report',
        source_ref: 'report:20',
        source_agent_id: 'builder',
        target_agent_id: null,
        target_role: 'architect',
        target_ref: 'role:architect',
        kind: 'review_request',
        status: 'open',
        task_id: '20260430-20-review',
        task_number: 20,
        evidence_json: JSON.stringify({ summary: 'Review task 20.' }),
        consumption_rule_json: JSON.stringify({
          review_command: 'narada task review 20 --agent architect --verdict accepted',
        }),
        created_at: '2026-04-30T00:00:00.000Z',
        updated_at: '2026-04-30T00:00:00.000Z',
        consumed_at: null,
        consumed_by: null,
        consumption_ref: null,
      });
    } finally {
      store.db.close();
    }

    const result = await roleLoopNextObligationCommand({
      cwd: tempDir,
      role: 'architect',
      recurrenceKey: 'architect-loop-output-austerity',
      format: 'human',
    });
    const packet = result.result as {
      _formatted: string;
      output_budget: { max_lines: number; max_bytes: number; status: string };
      obligation: { action_kind: string; ref: string; command: string };
      capa_recurrence: { status: string; key: string };
      exploration: { broad_workboard_command: string };
    };

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(packet.obligation).toMatchObject({
      action_kind: 'directed_obligation',
      ref: 'obligation:obl_review_20',
      command: 'narada task review 20 --agent architect --verdict accepted',
    });
    expect(packet.capa_recurrence).toMatchObject({
      status: 'marked',
      key: 'architect-loop-output-austerity',
    });
    expect(packet.exploration.broad_workboard_command).toBe('narada task workboard --view compact --format json');
    expect(packet.output_budget.status).toBe('within_budget');
    expect(packet._formatted.split(/\r?\n/).length).toBeLessThanOrEqual(packet.output_budget.max_lines);
    expect(Buffer.byteLength(packet._formatted, 'utf8')).toBeLessThanOrEqual(packet.output_budget.max_bytes);
    expect(JSON.stringify(packet)).not.toContain('blocked_or_hidden_work');
    expect(JSON.stringify(packet)).not.toContain('architect_duty_loop');
    expect(JSON.stringify(packet)).not.toContain('review_handoff_requirements');

    const jsonResult = await roleLoopNextObligationCommand({
      cwd: tempDir,
      role: 'architect',
      recurrenceKey: 'architect-loop-output-austerity',
      format: 'json',
    });
    const jsonPacket = jsonResult.result as {
      output_budget: { max_bytes: number; status: string };
    };
    expect(jsonPacket.output_budget.status).toBe('within_budget');
    expect(Buffer.byteLength(JSON.stringify(jsonPacket), 'utf8')).toBeLessThanOrEqual(jsonPacket.output_budget.max_bytes);
  });
});
