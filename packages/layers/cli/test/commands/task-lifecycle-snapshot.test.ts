import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  taskLifecycleExportCommand,
  taskLifecycleImportCommand,
} from '../../src/commands/task-lifecycle-snapshot.js';
import { openTaskLifecycleStore } from '../../src/lib/task-lifecycle-store.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

describe('task lifecycle snapshot commands', () => {
  let sourceDir: string;
  let targetDir: string;

  beforeEach(() => {
    sourceDir = mkdtempSync(join(tmpdir(), 'narada-lifecycle-export-'));
    targetDir = mkdtempSync(join(tmpdir(), 'narada-lifecycle-import-'));
    mkdirSync(join(sourceDir, '.ai'), { recursive: true });
  });

  afterEach(() => {
    rmSync(sourceDir, { recursive: true, force: true });
    rmSync(targetDir, { recursive: true, force: true });
  });

  it('round-trips representative lifecycle authority tables', async () => {
    const source = openTaskLifecycleStore(sourceDir);
    source.upsertLifecycle({
      task_id: 'task-100',
      task_number: 100,
      status: 'closed',
      governed_by: 'task_close:architect',
      closed_at: '2026-04-27T00:00:00.000Z',
      closed_by: 'architect',
      closure_mode: 'operator_direct',
      reopened_at: null,
      reopened_by: null,
      continuation_packet_json: null,
      updated_at: '2026-04-27T00:00:00.000Z',
    });
    source.insertAssignment({
      assignment_id: 'assignment-100',
      task_id: 'task-100',
      agent_id: 'architect',
      claimed_at: '2026-04-27T00:00:00.000Z',
      released_at: null,
      release_reason: null,
      intent: 'primary',
    });
    source.insertReport({
      report_id: 'report-100',
      task_id: 'task-100',
      agent_id: 'architect',
      summary: 'done',
      changed_files_json: '[]',
      verification_json: '[]',
      submitted_at: '2026-04-27T00:01:00.000Z',
    });
    source.insertReview({
      review_id: 'review-100',
      task_id: 'task-100',
      reviewer_agent_id: 'architect',
      verdict: 'accepted',
      findings_json: '[]',
      reviewed_at: '2026-04-27T00:02:00.000Z',
    });
    source.upsertRosterEntry({
      agent_id: 'architect',
      role: 'architect',
      capabilities_json: '[]',
      first_seen_at: '2026-04-27T00:00:00.000Z',
      last_active_at: '2026-04-27T00:02:00.000Z',
      status: 'idle',
      task_number: null,
      last_done: 100,
      updated_at: '2026-04-27T00:02:00.000Z',
    });
    source.upsertTaskSpec({
      task_id: 'task-100',
      task_number: 100,
      title: 'Snapshot task',
      chapter_markdown: 'Snapshots',
      goal_markdown: 'Round trip',
      context_markdown: null,
      required_work_markdown: null,
      non_goals_markdown: null,
      acceptance_criteria_json: '[]',
      dependencies_json: '[]',
      updated_at: '2026-04-27T00:00:00.000Z',
    });
    source.upsertRepoPublication({
      publication_id: 'pub-100',
      repo_root: sourceDir,
      branch: 'main',
      remote: 'origin',
      commit_hash: 'abc',
      base_ref: 'origin/main',
      bundle_path: '/tmp/pub.bundle',
      patch_path: '/tmp/pub.patch',
      task_number: 100,
      requester_id: 'architect',
      requested_at: '2026-04-27T00:03:00.000Z',
      status: 'prepared',
      pushed_at: null,
      confirmed_by: null,
      confirmation_json: null,
      failure_reason: null,
      updated_at: '2026-04-27T00:03:00.000Z',
    });
    source.insertVerificationRun({
      run_id: 'verify-100',
      request_id: 'verify-request-100',
      task_id: 'task-100',
      target_command: 'pnpm verify',
      scope: 'focused',
      timeout_seconds: 120,
      requester_identity: 'architect',
      requested_at: '2026-04-27T00:04:00.000Z',
      status: 'passed',
      exit_code: 0,
      duration_ms: 1000,
      metrics_json: '{"pass":true}',
      stdout_digest: 'sha256:stdout',
      stderr_digest: null,
      stdout_excerpt: 'ok',
      stderr_excerpt: null,
      completed_at: '2026-04-27T00:04:01.000Z',
    });
    source.insertCommandRun({
      run_id: 'command-100',
      request_id: 'command-request-100',
      requester_id: 'architect',
      requester_kind: 'agent',
      command_argv: ['pnpm', 'verify'],
      command_argv_json: '["pnpm","verify"]',
      cwd: sourceDir,
      env_policy: { mode: 'inherit' },
      env_policy_json: '{"mode":"inherit"}',
      timeout_seconds: 120,
      stdin_policy: { mode: 'none' },
      stdin_policy_json: '{"mode":"none"}',
      task_id: 'task-100',
      task_number: 100,
      agent_id: 'architect',
      side_effect_class: 'read_only',
      approval_posture: 'not_required',
      output_admission_profile: 'bounded_excerpt',
      idempotency_key: 'command-100',
      requested_at: '2026-04-27T00:05:00.000Z',
      rationale: 'snapshot test',
      status: 'succeeded',
      exit_code: 0,
      signal: null,
      started_at: '2026-04-27T00:05:00.000Z',
      completed_at: '2026-04-27T00:05:01.000Z',
      duration_ms: 1000,
      stdout_digest: 'sha256:command-stdout',
      stderr_digest: null,
      stdout_admitted_excerpt: 'ok',
      stderr_admitted_excerpt: null,
      full_output_artifact_uri: null,
      error_class: null,
      approval_outcome: 'not_required',
      telemetry_json: '{}',
      updated_at: '2026-04-27T00:05:01.000Z',
    });
    source.db.close();

    const snapshotPath = join(sourceDir, '.ai', 'snapshot.json');
    const exported = await taskLifecycleExportCommand({
      cwd: sourceDir,
      output: snapshotPath,
      format: 'json',
    });
    expect(exported.exitCode).toBe(ExitCode.SUCCESS);
    expect((exported.result as { snapshot?: unknown }).snapshot).toBeUndefined();

    const imported = await taskLifecycleImportCommand({
      cwd: targetDir,
      input: snapshotPath,
      format: 'json',
    });
    expect(imported.exitCode).toBe(ExitCode.SUCCESS);

    const target = openTaskLifecycleStore(targetDir);
    expect(target.getLifecycleByNumber(100)?.status).toBe('closed');
    expect(target.getAssignments('task-100')).toHaveLength(1);
    expect(target.listReports('task-100')).toHaveLength(1);
    expect(target.listReviews('task-100')).toHaveLength(1);
    expect(target.getRosterEntry('architect')?.last_done).toBe(100);
    expect(target.getTaskSpecByNumber(100)?.title).toBe('Snapshot task');
    expect(target.getRepoPublication('pub-100')?.status).toBe('prepared');
    expect(target.getVerificationRun('verify-100')?.status).toBe('passed');
    expect(target.getCommandRun('command-100')?.status).toBe('succeeded');
    target.db.close();
  });
});
