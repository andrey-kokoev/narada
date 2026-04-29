import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database, SqliteInboxStore } from '@narada2/control-plane';
import { taskHandoffCommand } from '../../src/commands/task-handoff.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { parseFrontMatter } from '../../src/lib/task-governance.js';
import { parseTaskSpecFromMarkdown } from '../../src/lib/task-spec.js';
import { SqliteTaskLifecycleStore } from '../../src/lib/task-lifecycle-store.js';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
}

function seedTask(tempDir: string) {
  const taskId = '20260429-321-test-handoff';
  const raw = `---\ntask_id: ${taskId}\nstatus: claimed\ndepends_on: [300]\n---\n
# Task 321: Test Handoff

## Goal
Build the handoff packet command.

## Context
This context is intentionally long enough to prove that the handoff packet uses a summary rather than dumping arbitrary task body content into operator output.

## Required Work
1. Emit packet.
2. Keep output bounded.

## Acceptance Criteria
- [ ] Emits JSON
- [ ] Writes artifact
`;
  writeFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', `${taskId}.md`), raw);
  const { frontMatter, body } = parseFrontMatter(raw);
  const spec = parseTaskSpecFromMarkdown({ taskId, taskNumber: 321, frontMatter, body });
  const db = new Database(join(tempDir, '.ai', 'task-lifecycle.db'));
  const store = new SqliteTaskLifecycleStore({ db });
  store.initSchema();
  store.upsertLifecycle({
    task_id: taskId,
    task_number: 321,
    status: 'claimed',
    governed_by: null,
    closed_at: null,
    closed_by: null,
    reopened_at: null,
    reopened_by: null,
    continuation_packet_json: null,
    updated_at: new Date().toISOString(),
  });
  store.upsertTaskSpec({
    task_id: spec.task_id,
    task_number: spec.task_number,
    title: spec.title,
    chapter_markdown: spec.chapter,
    goal_markdown: spec.goal,
    context_markdown: spec.context,
    required_work_markdown: spec.required_work,
    non_goals_markdown: spec.non_goals,
    acceptance_criteria_json: JSON.stringify(spec.acceptance_criteria),
    dependencies_json: JSON.stringify(spec.dependencies),
    updated_at: spec.updated_at,
  });
  store.insertAssignment({
    assignment_id: 'assign-321',
    task_id: taskId,
    agent_id: 'builder',
    claimed_at: new Date().toISOString(),
    released_at: null,
    release_reason: null,
    intent: 'primary',
  });
  store.insertReport({
    report_id: 'wrr_321',
    task_id: taskId,
    agent_id: 'builder',
    summary: 'Partial result',
    changed_files_json: JSON.stringify(['packages/layers/cli/src/commands/task-handoff.ts']),
    verification_json: JSON.stringify([{ command: 'pnpm verify', result: 'pending' }]),
    submitted_at: new Date().toISOString(),
  });
  db.close();

  const inbox = new SqliteInboxStore(join(tempDir, '.ai', 'inbox.db'));
  const envelope = inbox.insert({
    envelope_id: 'env_source_321',
    received_at: new Date().toISOString(),
    source: { kind: 'user_chat', ref: 'operator:test' },
    kind: 'observation',
    authority: { level: 'operator_confirmed', principal: 'operator' },
    payload: { large: 'payload should not appear in handoff source summary' },
  });
  inbox.promote(envelope.envelope_id, {
    target_kind: 'task',
    target_ref: 'task:321',
    promoted_at: new Date().toISOString(),
    promoted_by: 'architect',
  });
  inbox.close();
}

describe('task handoff command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-task-handoff-'));
    setupRepo(tempDir);
    seedTask(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('emits a bounded JSON handoff packet', async () => {
    const result = await taskHandoffCommand({ cwd: tempDir, taskNumber: '321', format: 'json', by: 'architect' });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const parsed = result.result as { packet: Record<string, any> };

    expect(parsed.packet.packet_type).toBe('task_handoff');
    expect(parsed.packet.task.task_number).toBe(321);
    expect(parsed.packet.task.assignment.agent_id).toBe('builder');
    expect(parsed.packet.task.dependencies).toEqual([300]);
    expect(parsed.packet.source_envelopes).toEqual([
      expect.objectContaining({ envelope_id: 'env_source_321', source_ref: 'operator:test', target_ref: 'task:321' }),
    ]);
    expect(JSON.stringify(parsed.packet.source_envelopes)).not.toContain('payload should not appear');
    expect(parsed.packet.changed_loci).toEqual(['packages/layers/cli/src/commands/task-handoff.ts']);
    expect(parsed.packet.output_bounds.full_task_body_included).toBe(false);
    expect(parsed.packet.output_bounds.full_inbox_payloads_included).toBe(false);
  });

  it('writes a durable artifact and emits bounded human output', async () => {
    const result = await taskHandoffCommand({ cwd: tempDir, taskNumber: '321', format: 'human', artifact: true });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const human = String((result.result as { _formatted: string })._formatted);
    expect(human).toContain('Task handoff packet: 321');
    expect(human).toContain('Artifact: .ai/handoffs/task-321-handoff.json');
    expect(human).not.toContain('This context is intentionally long');

    const artifact = JSON.parse(readFileSync(join(tempDir, '.ai', 'handoffs', 'task-321-handoff.json'), 'utf8'));
    expect(artifact.packet_type).toBe('task_handoff');
    expect(artifact.task.task_number).toBe(321);
  });

  it('optionally routes the handoff through inbox as an observation', async () => {
    const result = await taskHandoffCommand({
      cwd: tempDir,
      taskNumber: '321',
      format: 'json',
      routeInbox: true,
      by: 'architect',
    });
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const parsed = result.result as { inbox_envelope_id: string; route_kind: string };
    expect(parsed.route_kind).toBe('observation');

    const inbox = new SqliteInboxStore(join(tempDir, '.ai', 'inbox.db'));
    const envelope = inbox.get(parsed.inbox_envelope_id);
    inbox.close();
    expect(envelope?.kind).toBe('observation');
    expect((envelope?.payload as { packet_type?: string }).packet_type).toBe('task_handoff');
    expect(readdirSync(join(tempDir, '.ai', 'inbox-envelopes')).some((name) => name.includes(parsed.inbox_envelope_id))).toBe(true);
    expect(readdirSync(join(tempDir, '.ai', 'mutation-evidence', 'inbox')).length).toBeGreaterThan(0);
  });

  it('refuses disallowed Builder upstream handoff routing', async () => {
    writeFileSync(join(tempDir, 'config.json'), JSON.stringify({
      message_routing_authority: {
        default_policy: 'deny_cross_locus_unless_allowed',
        principals: {
          builder: {
            may_send: [
              { target_locus: 'local_user_site', kinds: ['task_handoff'], authority_levels: ['agent_reported'], condition: 'always' },
            ],
            may_not_send: [
              { target_locus: 'narada_proper', kinds: ['*'], reason: 'Builder reports locally; Architect escalates upstream.' },
            ],
          },
        },
      },
    }), 'utf8');

    const refused = await taskHandoffCommand({
      cwd: tempDir,
      taskNumber: '321',
      format: 'json',
      routeInbox: true,
      by: 'builder',
      targetLocus: 'narada_proper',
    });
    expect(refused.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((refused.result as { error: string }).error).toContain('Builder reports locally');

    const allowed = await taskHandoffCommand({
      cwd: tempDir,
      taskNumber: '321',
      format: 'json',
      routeInbox: true,
      by: 'builder',
      targetLocus: 'local_user_site',
    });
    expect(allowed.exitCode).toBe(ExitCode.SUCCESS);
  });
});
