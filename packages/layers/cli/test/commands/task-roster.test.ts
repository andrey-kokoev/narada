import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');
vi.mock('../../src/lib/learning-recall.js', () => ({
  recallAcceptedLearning: async () => ({
    guidance: [
      {
        artifact_id: '20260422-003',
        title: 'Recommended assignments are operative unless rejected',
        principle: 'When the architect/operator recommends a target assignment and the human operator does not disagree or correct it, the recommendation is operative and must be recorded in the roster immediately.',
        source_path: '/mock/accepted/20260422-003-roster.json',
        not_applicable_when: [],
      },
    ],
    warnings: [],
  }),
  formatGuidanceForHumans: (guidance: Array<{ title: string; principle: string }>) =>
    guidance.map((g) => `• ${g.title}: ${g.principle}`),
  formatGuidanceForJson: (guidance: Array<{ artifact_id: string; title: string; principle: string; not_applicable_when: string[] }>) =>
    guidance.map((g) => ({
      artifact_id: g.artifact_id,
      title: g.title,
      principle: g.principle,
      not_applicable_when: g.not_applicable_when,
    })),
}));

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  taskRosterShowCommand,
  taskRosterAssignCommand,
  taskRosterReviewCommand,
  taskRosterDoneCommand,
  taskRosterIdleCommand,
  taskRosterAddCommand,
} from '../../src/commands/task-roster.js';
import {
  loadRoster,
  updateAgentRosterEntry,
  formatRoster,
  readTaskFile,
  loadAssignment,
  saveReport,
} from '../../src/lib/task-governance.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { Database } from '@narada2/control-plane';
import { openTaskLifecycleStore, SqliteTaskLifecycleStore } from '../../src/lib/task-lifecycle-store.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupRepo(tempDir: string, roster?: unknown) {
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });

  const fixture = (roster ?? {
    version: 2,
    updated_at: '2026-01-01T00:00:00Z',
    agents: [
      {
        agent_id: 'test-agent',
        role: 'implementer',
        capabilities: ['claim'],
        first_seen_at: '2026-01-01T00:00:00Z',
        last_active_at: '2026-01-01T00:00:00Z',
        status: 'idle',
        task: null,
        last_done: null,
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        agent_id: 'reviewer-agent',
        role: 'reviewer',
        capabilities: ['derive', 'propose'],
        first_seen_at: '2026-01-01T00:00:00Z',
        last_active_at: '2026-01-01T00:00:00Z',
        status: 'idle',
        task: null,
        last_done: null,
        updated_at: '2026-01-01T00:00:00Z',
      },
    ],
  }) as {
    updated_at: string;
    agents: Array<{
      agent_id: string;
      role: string;
      capabilities: string[];
      first_seen_at: string;
      last_active_at: string;
      status?: string;
      task?: number | null;
      last_done?: number | null;
      updated_at?: string;
    }>;
  };

  const db = new Database(join(tempDir, '.ai', 'task-lifecycle.db'));
  const store = new SqliteTaskLifecycleStore({ db });
  store.initSchema();
  for (const agent of fixture.agents) {
    store.upsertRosterEntry({
      agent_id: agent.agent_id,
      role: agent.role,
      capabilities_json: JSON.stringify(agent.capabilities),
      first_seen_at: agent.first_seen_at,
      last_active_at: agent.last_active_at,
      status: agent.status ?? 'idle',
      task_number: agent.task ?? null,
      last_done: agent.last_done ?? null,
      updated_at: agent.updated_at ?? fixture.updated_at,
    });
  }
  db.close();
}

describe('task roster operator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-task-roster-test-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('show', () => {
    it('returns roster in human format', async () => {
      const result = await taskRosterShowCommand({ cwd: tempDir, format: 'human' });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.result).toContain('test-agent');
      expect(result.result).toContain('reviewer-agent');
      // Default human output is terse; guidance is gated behind --verbose
      expect(result.result).not.toContain('Active guidance:');
    });

    it('shows guidance in human format when verbose is set', async () => {
      const result = await taskRosterShowCommand({ cwd: tempDir, format: 'human', verbose: true });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.result).toContain('test-agent');
      expect(result.result).toContain('Active guidance:');
      expect(result.result).toContain('Recommended assignments are operative unless rejected');
    });

    it('returns roster in json format', async () => {
      const result = await taskRosterShowCommand({ cwd: tempDir, format: 'json' });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(typeof result.result).toBe('object');
      const parsed = result.result as { roster: { agents: unknown[] }; guidance: unknown[] };
      expect(parsed.roster.agents).toHaveLength(2);
      expect(parsed.guidance.length).toBeGreaterThan(0);
      expect(parsed.guidance[0]).toMatchObject({
        artifact_id: '20260422-003',
      });
    });

    it('fails with clear error when roster is missing', async () => {
      const emptyDir = mkdtempSync(join(tmpdir(), 'narada-empty-'));
      try {
        const result = await taskRosterShowCommand({ cwd: emptyDir, format: 'human' });
        expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
        expect((result.result as { error: string }).error).toMatch(/Failed to load roster/);
      } finally {
        rmSync(emptyDir, { recursive: true, force: true });
      }
    });
  });

  describe('assign', () => {
    it('records status working and task number', async () => {
      writeFileSync(
        join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-385-test.md'),
        '---\ntask_id: 385\nstatus: opened\n---\n\n# Task 385\n',
      );

      const result = await taskRosterAssignCommand({
        taskNumber: '385',
        agent: 'test-agent',
        cwd: tempDir,
        format: 'json',
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.result).toMatchObject({
        status: 'ok',
        agent: 'test-agent',
        agent_status: 'working',
        task: 385,
      });

      expect(result.result).not.toHaveProperty('guidance');

      const roster = await loadRoster(tempDir);
      const entry = roster.agents.find((a) => a.agent_id === 'test-agent');
      expect(entry?.status).toBe('working');
      expect(entry?.task).toBe(385);
      expect(entry?.updated_at).toBeDefined();
    });

    it('includes guidance in JSON only when verbose is set', async () => {
      writeFileSync(
        join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-385-test.md'),
        '---\ntask_id: 385\nstatus: opened\n---\n\n# Task 385\n',
      );

      const result = await taskRosterAssignCommand({
        taskNumber: '385',
        agent: 'test-agent',
        cwd: tempDir,
        format: 'json',
        verbose: true,
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const parsed = result.result as { guidance: unknown[] };
      expect(parsed.guidance.length).toBeGreaterThan(0);
      expect(parsed.guidance[0]).toMatchObject({
        artifact_id: '20260422-003',
      });
    });

    it('fails when agent does not exist', async () => {
      const result = await taskRosterAssignCommand({
        taskNumber: '385',
        agent: 'ghost-agent',
        cwd: tempDir,
        format: 'json',
      });
      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
      expect((result.result as { error: string }).error).toMatch(/not found in roster/);
    });

    it('fails on invalid task number', async () => {
      const result = await taskRosterAssignCommand({
        taskNumber: 'not-a-number',
        agent: 'test-agent',
        cwd: tempDir,
        format: 'json',
      });
      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
      expect((result.result as { error: string }).error).toBe('Invalid task number');
    });

    it('claims an opened task by default', async () => {
      writeFileSync(
        join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-385-test.md'),
        '---\ntask_id: 385\nstatus: opened\n---\n\n# Task 385\n',
      );

      const result = await taskRosterAssignCommand({
        taskNumber: '385',
        agent: 'test-agent',
        cwd: tempDir,
        format: 'json',
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const parsed = result.result as { claimed: boolean };
      expect(parsed.claimed).toBe(true);

      // Task file updated to claimed
      const taskContent = readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-385-test.md'), 'utf8');
      expect(taskContent).toContain('status: claimed');

      // Assignment record created in SQLite authority
      const assignment = await loadAssignment(tempDir, '20260420-385-test');
      expect(assignment).not.toBeNull();
      expect(assignment.task_id).toBe('20260420-385-test');
      expect(assignment.assignments).toHaveLength(1);
      expect(assignment.assignments[0].agent_id).toBe('test-agent');

      const store = openTaskLifecycleStore(tempDir);
      try {
        const parsedWithIntent = result.result as { assignment_intent_id: string };
        const intent = store.getAssignmentIntent(parsedWithIntent.assignment_intent_id);
        expect(intent?.status).toBe('applied');
        expect(intent?.kind).toBe('roster_assign');
        expect(intent?.lifecycle_status_after).toBe('claimed');
        expect(intent?.roster_status_after).toBe('working');
      } finally {
        store.db.close();
      }
    });

    it('preserves depends_on through claim', async () => {
      writeFileSync(
        join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-998-dep.md'),
        '---\ntask_id: 998\nstatus: closed\nclosed_by: operator\nclosed_at: 2026-04-20T00:00:00Z\n---\n\n# Task 998\n\n## Acceptance Criteria\n\n- [x] Criterion 1\n\n## Execution Notes\n\nCompleted.\n\n## Verification\n\nVerified.\n',
      );
      writeFileSync(
        join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-385-test.md'),
        '---\ntask_id: 385\nstatus: opened\ndepends_on:\n  - 998\nextra: preserved\n---\n\n# Task 385\n',
      );

      const result = await taskRosterAssignCommand({
        taskNumber: '385',
        agent: 'test-agent',
        cwd: tempDir,
        format: 'json',
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);

      const { frontMatter } = await readTaskFile(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-385-test.md'));
      expect(frontMatter.status).toBe('claimed');
      expect(frontMatter.depends_on).toEqual([998]);
      expect(frontMatter.extra).toBe('preserved');
    });

    it('fails when claim validation fails and leaves roster unchanged', async () => {
      // No task file — claim validation (findTaskFile) will fail
      const result = await taskRosterAssignCommand({
        taskNumber: '385',
        agent: 'test-agent',
        cwd: tempDir,
        format: 'json',
      });

      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
      expect((result.result as { error: string }).error).toMatch(/Task not found/);

      // Roster must NOT have been updated
      const roster = await loadRoster(tempDir);
      const entry = roster.agents.find((a) => a.agent_id === 'test-agent');
      expect(entry?.status).not.toBe('working');
      expect(entry?.task).not.toBe(385);
    });

    it('fails when dependencies are unmet and leaves roster unchanged', async () => {
      writeFileSync(
        join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-998-dep.md'),
        '---\ntask_id: 998\nstatus: opened\n---\n\n# Task 998\n',
      );
      writeFileSync(
        join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-385-test.md'),
        '---\ntask_id: 385\nstatus: opened\ndepends_on:\n  - 998\n---\n\n# Task 385\n',
      );

      const result = await taskRosterAssignCommand({
        taskNumber: '385',
        agent: 'test-agent',
        cwd: tempDir,
        format: 'json',
      });

      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
      expect((result.result as { error: string }).error).toMatch(/unmet dependencies/);

      // Roster must NOT have been updated
      const roster = await loadRoster(tempDir);
      const entry = roster.agents.find((a) => a.agent_id === 'test-agent');
      expect(entry?.status).not.toBe('working');
    });

    it('is explicit and non-destructive for already-claimed tasks', async () => {
      writeFileSync(
        join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-385-test.md'),
        '---\ntask_id: 385\nstatus: claimed\n---\n\n# Task 385\n',
      );

      const result = await taskRosterAssignCommand({
        taskNumber: '385',
        agent: 'test-agent',
        cwd: tempDir,
        format: 'json',
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const parsed = result.result as { claimed: boolean; warnings?: string[] };
      expect(parsed.claimed).toBe(false);
      expect(parsed.warnings?.some((w) => w.includes('already claimed'))).toBe(true);

      // Roster updated
      const roster = await loadRoster(tempDir);
      expect(roster.agents.find((a) => a.agent_id === 'test-agent')?.status).toBe('working');
      expect(roster.agents.find((a) => a.agent_id === 'test-agent')?.task).toBe(385);
    });

    it('supports --no-claim to skip claiming', async () => {
      writeFileSync(
        join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-385-test.md'),
        '---\ntask_id: 385\nstatus: opened\n---\n\n# Task 385\n',
      );

      const result = await taskRosterAssignCommand({
        taskNumber: '385',
        agent: 'test-agent',
        cwd: tempDir,
        format: 'json',
        noClaim: true,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const parsed = result.result as { claimed: boolean; warnings?: string[] };
      expect(parsed.claimed).toBe(false);
      expect(parsed.warnings?.some((w) => w.includes('--no-claim'))).toBe(true);

      // Task file unchanged
      const taskContent = readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-385-test.md'), 'utf8');
      expect(taskContent).toContain('status: opened');

      // Roster updated
      const roster = await loadRoster(tempDir);
      expect(roster.agents.find((a) => a.agent_id === 'test-agent')?.status).toBe('working');
    });
  });

  describe('review', () => {
    it('records status reviewing and task number', async () => {
      writeFileSync(
        join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-370-test.md'),
        '---\ntask_id: 370\nstatus: in_review\n---\n\n# Task 370\n',
      );

      const result = await taskRosterReviewCommand({
        taskNumber: '370',
        agent: 'reviewer-agent',
        cwd: tempDir,
        format: 'json',
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.result).toMatchObject({
        status: 'ok',
        agent: 'reviewer-agent',
        agent_status: 'reviewing',
        task: 370,
        intent: 'review',
      });

      const roster = await loadRoster(tempDir);
      const entry = roster.agents.find((a) => a.agent_id === 'reviewer-agent');
      expect(entry?.status).toBe('reviewing');
      expect(entry?.task).toBe(370);

      // Assignment record created with review intent (released immediately)
      const assignment = await loadAssignment(tempDir, '20260420-370-test');
      expect(assignment).not.toBeNull();
      expect(assignment.assignments).toHaveLength(1);
      expect(assignment.assignments[0].intent).toBe('review');
      expect(assignment.assignments[0].released_at).not.toBeNull();
    });
  });

  describe('done', () => {
    it('records status done, clears task, and sets last_done', async () => {
      // First assign a task
      await taskRosterAssignCommand({
        taskNumber: '385',
        agent: 'test-agent',
        cwd: tempDir,
        format: 'json',
      });

      // Then mark done
      const result = await taskRosterDoneCommand({
        taskNumber: '385',
        agent: 'test-agent',
        cwd: tempDir,
        format: 'json',
        allowIncomplete: true,
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.result).toMatchObject({
        status: 'ok',
        agent: 'test-agent',
        agent_status: 'done',
        last_done: 385,
      });
      expect(result.result).toHaveProperty('roster_updated_at');
      expect(result.result).not.toHaveProperty('roster');
      expect(result.result).not.toHaveProperty('guidance');

      const roster = await loadRoster(tempDir);
      const entry = roster.agents.find((a) => a.agent_id === 'test-agent');
      expect(entry?.status).toBe('done');
      expect(entry?.task).toBeNull();
      expect(entry?.last_done).toBe(385);
    });

    it('fails by default when no WorkResultReport exists for the task', async () => {
      // Create a task file so findTaskFile can resolve it
      mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
      writeFileSync(
        join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-385-test.md'),
        '---\ntask_id: 385\nstatus: claimed\n---\n\n# Task 385\n',
      );

      // First assign a task
      await taskRosterAssignCommand({
        taskNumber: '385',
        agent: 'test-agent',
        cwd: tempDir,
        format: 'json',
      });

      const result = await taskRosterDoneCommand({
        taskNumber: '385',
        agent: 'test-agent',
        cwd: tempDir,
        format: 'human',
      });

      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
      expect((result.result as { error: string }).error).toContain('no execution evidence');
      expect((result.result as { error: string }).error).toContain('--allow-incomplete');
    });

    it('records done with warnings only when incomplete evidence is explicitly allowed', async () => {
      mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
      writeFileSync(
        join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-386-test.md'),
        '---\ntask_id: 386\nstatus: claimed\n---\n\n# Task 386\n\n## Acceptance Criteria\n- [ ] Unchecked item\n',
      );
      await saveReport(tempDir, {
          report_id: 'wrr_1234567890_20260420-386-test_other-agent',
          task_number: 386,
          task_id: '20260420-386-test',
          agent_id: 'other-agent',
          assignment_id: 'x',
          reported_at: '2026-01-01T00:00:00Z',
          summary: 'Done',
          changed_files: [],
          verification: [],
          known_residuals: [],
          ready_for_review: true,
          report_status: 'submitted',
      });

      const result = await taskRosterDoneCommand({
        taskNumber: '386',
        agent: 'test-agent',
        cwd: tempDir,
        format: 'human',
        allowIncomplete: true,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.result as string).toContain('unchecked acceptance criteria');
      expect(result.result as string).toContain('explicitly allowed');
    });

    it('fails in strict mode when evidence is missing', async () => {
      mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
      writeFileSync(
        join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-387-test.md'),
        '---\ntask_id: 387\nstatus: claimed\n---\n\n# Task 387\n',
      );

      const result = await taskRosterDoneCommand({
        taskNumber: '387',
        agent: 'test-agent',
        cwd: tempDir,
        format: 'json',
        strict: true,
      });

      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
      const parsed = result.result as { error: string; strict: boolean };
      expect(parsed.strict).toBe(true);
      expect(parsed.error).toContain('no execution evidence');
    });

    it('succeeds in strict mode when evidence is complete', async () => {
      mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
      writeFileSync(
        join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-388-test.md'),
        '---\ntask_id: 388\nstatus: claimed\n---\n\n# Task 388\n\n## Acceptance Criteria\n- [x] Done\n\n## Execution Notes\nCompleted.\n\n## Verification\nChecked.\n',
      );
      await saveReport(tempDir, {
          report_id: 'wrr_1234567890_20260420-388-test_test-agent',
          task_number: 388,
          task_id: '20260420-388-test',
          agent_id: 'test-agent',
          assignment_id: 'x',
          reported_at: '2026-01-01T00:00:00Z',
          summary: 'Done',
          changed_files: [],
          verification: [],
          known_residuals: [],
          ready_for_review: true,
          report_status: 'submitted',
      });

      const result = await taskRosterDoneCommand({
        taskNumber: '388',
        agent: 'test-agent',
        cwd: tempDir,
        format: 'json',
        strict: true,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const parsed = result.result as { status: string; warnings: string[] | undefined };
      expect(parsed.status).toBe('ok');
      expect(parsed.warnings).toBeUndefined();
    });

    it('does not block done for a complete task just because no review artifact exists', async () => {
      mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
      writeFileSync(
        join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-389-test.md'),
        '---\ntask_id: 389\nstatus: closed\nclosed_by: operator\nclosed_at: 2026-04-20T00:00:00Z\n---\n\n# Task 389\n\n## Acceptance Criteria\n- [x] Done\n\n## Execution Notes\nCompleted.\n\n## Verification\nChecked.\n',
      );

      const result = await taskRosterDoneCommand({
        taskNumber: '389',
        agent: 'reviewer-agent',
        cwd: tempDir,
        format: 'json',
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.result).toMatchObject({
        status: 'ok',
        agent: 'reviewer-agent',
        agent_status: 'done',
        last_done: 389,
      });
    });
  });

  describe('idle', () => {
    it('clears task without changing last_done', async () => {
      // First assign and done to set last_done
      await taskRosterAssignCommand({
        taskNumber: '385',
        agent: 'test-agent',
        cwd: tempDir,
        format: 'json',
      });
      await taskRosterDoneCommand({
        taskNumber: '385',
        agent: 'test-agent',
        cwd: tempDir,
        format: 'json',
        allowIncomplete: true,
      });

      // Then idle
      const result = await taskRosterIdleCommand({
        agent: 'test-agent',
        cwd: tempDir,
        format: 'json',
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.result).toMatchObject({
        status: 'ok',
        agent: 'test-agent',
        agent_status: 'idle',
      });

      const roster = await loadRoster(tempDir);
      const entry = roster.agents.find((a) => a.agent_id === 'test-agent');
      expect(entry?.status).toBe('idle');
      expect(entry?.task).toBeNull();
      expect(entry?.last_done).toBe(385); // preserved
    });
  });

  describe('add', () => {
    it('adds a new idle agent to the roster', async () => {
      const result = await taskRosterAddCommand({
        agent: 'architect',
        role: 'implementer',
        cwd: tempDir,
        format: 'json',
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.result).toMatchObject({
        status: 'ok',
        agent: 'architect',
        agent_status: 'idle',
      });

      const roster = await loadRoster(tempDir);
      const entry = roster.agents.find((agent) => agent.agent_id === 'architect');
      expect(entry).toMatchObject({
        role: 'implementer',
        status: 'idle',
        task: null,
      });
    });
  });

  describe('updateAgentRosterEntry', () => {
    it('persists atomic writes', async () => {
      const roster = await updateAgentRosterEntry(tempDir, 'test-agent', {
        status: 'blocked',
        task: 123,
      });
      expect(roster.agents.find((a) => a.agent_id === 'test-agent')?.status).toBe('blocked');

      // Re-read from disk to confirm persistence
      const reloaded = await loadRoster(tempDir);
      expect(reloaded.agents.find((a) => a.agent_id === 'test-agent')?.status).toBe('blocked');
    });
  });

  describe('formatRoster', () => {
    it('formats human-readable output', () => {
      const roster = {
        version: 2,
        updated_at: '2026-01-01T00:00:00Z',
        agents: [
          {
            agent_id: 'a1',
            role: 'implementer',
            capabilities: [],
            first_seen_at: '2026-01-01T00:00:00Z',
            last_active_at: '2026-01-01T00:00:00Z',
            status: 'working',
            task: 42,
            last_done: 10,
            updated_at: '2026-01-01T00:00:00Z',
          },
        ],
      };
      const output = formatRoster(roster, 'human');
      expect(output).toContain('a1');
      expect(output).toContain('working');
      expect(output).toContain('task=42');
    });

    it('formats json output', () => {
      const roster = {
        version: 2,
        updated_at: '2026-01-01T00:00:00Z',
        agents: [
          {
            agent_id: 'a1',
            role: 'implementer',
            capabilities: [],
            first_seen_at: '2026-01-01T00:00:00Z',
            last_active_at: '2026-01-01T00:00:00Z',
          },
        ],
      };
      const output = formatRoster(roster, 'json');
      const parsed = JSON.parse(output);
      expect(parsed.agents[0].agent_id).toBe('a1');
    });
  });

  describe('race safety', () => {
    it('concurrent assign to different agents both persist', async () => {
      writeFileSync(
        join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-100-test.md'),
        '---\ntask_id: 100\nstatus: opened\n---\n\n# Task 100\n',
      );
      writeFileSync(
        join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-200-test.md'),
        '---\ntask_id: 200\nstatus: opened\n---\n\n# Task 200\n',
      );

      const [r1, r2] = await Promise.all([
        taskRosterAssignCommand({
          taskNumber: '100',
          agent: 'test-agent',
          cwd: tempDir,
          format: 'json',
        }),
        taskRosterAssignCommand({
          taskNumber: '200',
          agent: 'reviewer-agent',
          cwd: tempDir,
          format: 'json',
        }),
      ]);

      expect(r1.exitCode).toBe(ExitCode.SUCCESS);
      expect(r2.exitCode).toBe(ExitCode.SUCCESS);

      const roster = await loadRoster(tempDir);
      expect(roster.agents.find((a) => a.agent_id === 'test-agent')?.status).toBe('working');
      expect(roster.agents.find((a) => a.agent_id === 'test-agent')?.task).toBe(100);
      expect(roster.agents.find((a) => a.agent_id === 'reviewer-agent')?.status).toBe('working');
      expect(roster.agents.find((a) => a.agent_id === 'reviewer-agent')?.task).toBe(200);
    });

    it('rapid sequential mutations do not lose updates', async () => {
      writeFileSync(
        join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-100-test.md'),
        '---\ntask_id: 100\nstatus: opened\n---\n\n# Task 100\n',
      );
      writeFileSync(
        join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-200-test.md'),
        '---\ntask_id: 200\nstatus: opened\n---\n\n# Task 200\n',
      );

      await taskRosterAssignCommand({ taskNumber: '100', agent: 'test-agent', cwd: tempDir, format: 'json' });
      await taskRosterAssignCommand({ taskNumber: '200', agent: 'reviewer-agent', cwd: tempDir, format: 'json' });
      await taskRosterDoneCommand({ taskNumber: '100', agent: 'test-agent', cwd: tempDir, format: 'json', allowIncomplete: true });
      await taskRosterIdleCommand({ agent: 'reviewer-agent', cwd: tempDir, format: 'json' });

      const roster = await loadRoster(tempDir);
      expect(roster.agents.find((a) => a.agent_id === 'test-agent')?.status).toBe('done');
      expect(roster.agents.find((a) => a.agent_id === 'test-agent')?.last_done).toBe(100);
      expect(roster.agents.find((a) => a.agent_id === 'reviewer-agent')?.status).toBe('idle');
      expect(roster.agents.find((a) => a.agent_id === 'reviewer-agent')?.task).toBeNull();
    });

    it('lock is released after a failed mutation', async () => {
      writeFileSync(
        join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-100-test.md'),
        '---\ntask_id: 100\nstatus: opened\n---\n\n# Task 100\n',
      );

      const result = await taskRosterAssignCommand({
        taskNumber: '100',
        agent: 'ghost-agent',
        cwd: tempDir,
        format: 'json',
      });
      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);

      // A subsequent mutation should succeed (lock was released)
      const result2 = await taskRosterAssignCommand({
        taskNumber: '100',
        agent: 'test-agent',
        cwd: tempDir,
        format: 'json',
      });
      expect(result2.exitCode).toBe(ExitCode.SUCCESS);
    });
  });
});
