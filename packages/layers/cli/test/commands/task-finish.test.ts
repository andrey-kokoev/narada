import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { taskFinishCommand } from '../../src/commands/task-finish.js';
import { taskClaimCommand } from '../../src/commands/task-claim.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupRepo(tempDir: string, roster?: unknown) {
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks', 'tasks', 'assignments'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks', 'tasks', 'reports'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'reviews'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'learning', 'accepted'), { recursive: true });

  writeFileSync(
    join(tempDir, '.ai', 'agents', 'roster.json'),
    JSON.stringify(roster ?? {
      version: 2,
      updated_at: '2026-01-01T00:00:00Z',
      agents: [
        {
          agent_id: 'impl-agent',
          role: 'implementer',
          capabilities: ['claim'],
          first_seen_at: '2026-01-01T00:00:00Z',
          last_active_at: '2026-01-01T00:00:00Z',
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
    }, null, 2),
  );

  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'),
    '---\ntask_id: 999\nstatus: opened\n---\n\n# Task 999: Test Task\n\n## Acceptance Criteria\n\n- [x] Criterion A\n- [x] Criterion B\n',
  );

  writeFileSync(
    join(tempDir, '.ai', 'learning', 'accepted', '20260422-004-report.json'),
    JSON.stringify({
      artifact_id: '20260422-004',
      state: 'accepted',
      title: 'Report completeness',
      content: {
        principle: 'Work result reports must include changed files and verification evidence.',
      },
      scopes: ['report', 'task-governance'],
    }, null, 2),
  );
}

describe('task finish operator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-task-finish-test-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('implementer finish', () => {
    it('submits report and clears roster when all evidence is present', async () => {
      // Claim the task first
      await taskClaimCommand({ taskNumber: '999', agent: 'impl-agent', cwd: tempDir, format: 'json' });

      const result = await taskFinishCommand({
        taskNumber: '999',
        agent: 'impl-agent',
        summary: 'Implemented feature X',
        changedFiles: 'src/foo.ts,src/bar.ts',
        verification: JSON.stringify([{ command: 'pnpm test', result: 'passed' }]),
        residuals: JSON.stringify(['Edge case not covered']),
        cwd: tempDir,
        format: 'json',
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.result as Record<string, unknown>;
      expect(data.report_action).toBe('submitted');
      expect(data.report_id).toBeTruthy();
      expect(data.roster_transition).toBe('done');
      expect(data.evidence_verdict).toBe('needs_review');
    });

    it('fails when no summary is provided for a claimed task without report', async () => {
      await taskClaimCommand({ taskNumber: '999', agent: 'impl-agent', cwd: tempDir, format: 'json' });

      const result = await taskFinishCommand({
        taskNumber: '999',
        agent: 'impl-agent',
        cwd: tempDir,
        format: 'json',
      });

      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
      const data = result.result as { error?: string };
      expect(data.error).toContain('--summary');
    });

    it('reuses existing report and clears roster', async () => {
      await taskClaimCommand({ taskNumber: '999', agent: 'impl-agent', cwd: tempDir, format: 'json' });

      // Submit report first
      await taskFinishCommand({
        taskNumber: '999',
        agent: 'impl-agent',
        summary: 'First report',
        changedFiles: 'src/foo.ts',
        verification: JSON.stringify([{ command: 'pnpm test', result: 'passed' }]),
        cwd: tempDir,
        format: 'json',
      });

      // Finish again — should reuse
      const result = await taskFinishCommand({
        taskNumber: '999',
        agent: 'impl-agent',
        summary: 'Second report',
        cwd: tempDir,
        format: 'json',
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.result as Record<string, unknown>;
      expect(data.report_action).toBe('reused');
      expect(data.roster_transition).toBe('done');

      // Only one report file should exist
      const reportsDir = join(tempDir, '.ai', 'do-not-open', 'tasks', 'tasks', 'reports');
      const reportFiles = require('node:fs').readdirSync(reportsDir).filter((f: string) => f.endsWith('.json'));
      expect(reportFiles.length).toBe(1);
    });

    it('--allow-incomplete clears roster but reports incomplete evidence', async () => {
      await taskClaimCommand({ taskNumber: '999', agent: 'impl-agent', cwd: tempDir, format: 'json' });

      const result = await taskFinishCommand({
        taskNumber: '999',
        agent: 'impl-agent',
        summary: 'Minimal report',
        cwd: tempDir,
        format: 'json',
        allowIncomplete: true,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.result as Record<string, unknown>;
      expect(data.allow_incomplete).toBe(true);
      expect(data.roster_transition).toBe('done');
    });
  });

  describe('reviewer finish', () => {
    it('submits review and clears roster when verdict is provided', async () => {
      // Set up: claim, report, and transition to in_review
      await taskClaimCommand({ taskNumber: '999', agent: 'impl-agent', cwd: tempDir, format: 'json' });

      const { taskReportCommand } = await import('../../src/commands/task-report.js');
      await taskReportCommand({
        taskNumber: '999',
        agent: 'impl-agent',
        summary: 'Done',
        changedFiles: 'src/x.ts',
        verification: JSON.stringify([{ command: 'pnpm test', result: 'pass' }]),
        cwd: tempDir,
        format: 'json',
      });

      const result = await taskFinishCommand({
        taskNumber: '999',
        agent: 'reviewer-agent',
        verdict: 'accepted',
        cwd: tempDir,
        format: 'json',
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.result as Record<string, unknown>;
      expect(data.review_action).toBe('submitted');
      expect(data.review_id).toBeTruthy();
      expect(data.roster_transition).toBe('done');
    });

    it('fails when no verdict is provided for in_review task without review', async () => {
      // Set up: claim and report to get to in_review
      await taskClaimCommand({ taskNumber: '999', agent: 'impl-agent', cwd: tempDir, format: 'json' });

      const { taskReportCommand } = await import('../../src/commands/task-report.js');
      await taskReportCommand({
        taskNumber: '999',
        agent: 'impl-agent',
        summary: 'Done',
        changedFiles: 'src/x.ts',
        verification: JSON.stringify([{ command: 'pnpm test', result: 'pass' }]),
        cwd: tempDir,
        format: 'json',
      });

      const result = await taskFinishCommand({
        taskNumber: '999',
        agent: 'reviewer-agent',
        cwd: tempDir,
        format: 'json',
      });

      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
      const data = result.result as { error?: string };
      expect(data.error).toContain('--verdict');
    });

    it('reuses existing review and clears roster', async () => {
      // Set up: claim, report, transition to in_review
      await taskClaimCommand({ taskNumber: '999', agent: 'impl-agent', cwd: tempDir, format: 'json' });

      const { taskReportCommand } = await import('../../src/commands/task-report.js');
      await taskReportCommand({
        taskNumber: '999',
        agent: 'impl-agent',
        summary: 'Done',
        changedFiles: 'src/x.ts',
        verification: JSON.stringify([{ command: 'pnpm test', result: 'pass' }]),
        cwd: tempDir,
        format: 'json',
      });

      // First finish
      await taskFinishCommand({
        taskNumber: '999',
        agent: 'reviewer-agent',
        verdict: 'accepted',
        cwd: tempDir,
        format: 'json',
      });

      // Second finish should reuse
      const result = await taskFinishCommand({
        taskNumber: '999',
        agent: 'reviewer-agent',
        verdict: 'accepted',
        cwd: tempDir,
        format: 'json',
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.result as Record<string, unknown>;
      expect(data.review_action).toBe('reused');

      // Only one review file
      const reviewsDir = join(tempDir, '.ai', 'reviews');
      const reviewFiles = require('node:fs').readdirSync(reviewsDir).filter((f: string) => f.endsWith('.json'));
      expect(reviewFiles.length).toBe(1);
    });
  });

  describe('json output', () => {
    it('returns stable fields for automation', async () => {
      await taskClaimCommand({ taskNumber: '999', agent: 'impl-agent', cwd: tempDir, format: 'json' });

      const result = await taskFinishCommand({
        taskNumber: '999',
        agent: 'impl-agent',
        summary: 'Test',
        changedFiles: 'a.ts',
        verification: JSON.stringify([{ command: 't', result: 'ok' }]),
        cwd: tempDir,
        format: 'json',
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const data = result.result as Record<string, unknown>;
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('completion_mode');
      expect(data).toHaveProperty('task_id');
      expect(data).toHaveProperty('agent_id');
      expect(data).toHaveProperty('report_action');
      expect(data).toHaveProperty('evidence_verdict');
      expect(data).toHaveProperty('roster_transition');
    });
  });
});
