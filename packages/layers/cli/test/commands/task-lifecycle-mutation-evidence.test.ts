import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateMutationEvidenceRecord, type MutationEvidenceRecord } from '@narada2/task-governance/mutation-evidence';
import { taskClaimCommand } from '../../src/commands/task-claim.js';
import { taskReportCommand } from '../../src/commands/task-report.js';
import { taskFinishCommand } from '../../src/commands/task-finish.js';
import { taskCloseCommand } from '../../src/commands/task-close.js';
import { taskEvidenceAdmitCommand } from '../../src/commands/task-evidence.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

function setupRepo(tempDir: string): void {
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'learning', 'accepted'), { recursive: true });
  mkdirSync(join(tempDir, 'docs', 'concepts'), { recursive: true });

  writeFileSync(
    join(tempDir, '.ai', 'agents', 'roster.json'),
    JSON.stringify({
      version: 1,
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
          agent_id: 'operator-1',
          role: 'operator',
          capabilities: ['resolve'],
          first_seen_at: '2026-01-01T00:00:00Z',
          last_active_at: '2026-01-01T00:00:00Z',
        },
      ],
    }, null, 2),
  );

  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-test-task.md'),
    '---\ntask_id: 999\nstatus: opened\n---\n\n# Task 999: Test Task\n\n## Acceptance Criteria\n\n- [x] Criterion A\n',
  );
  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-100-close-task.md'),
    '---\ntask_id: 100\nstatus: in_review\n---\n\n# Task 100: Close Task\n\n## Acceptance Criteria\n\n- [x] Criterion A\n\n## Execution Notes\nDone.\n\n## Verification\nOK.\n',
  );
  writeFileSync(
    join(tempDir, 'docs', 'concepts', 'authority-inversion-inventory.json'),
    JSON.stringify({ findings: [] }),
  );
}

function readEvidence(tempDir: string): MutationEvidenceRecord[] {
  const dir = join(tempDir, '.ai', 'mutation-evidence', 'task_lifecycle');
  return readdirSync(dir)
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => {
      const parsed = JSON.parse(readFileSync(join(dir, entry), 'utf8')) as MutationEvidenceRecord;
      expect(validateMutationEvidenceRecord(parsed)).toEqual([]);
      return parsed;
    });
}

function findEvidence(tempDir: string, command: string, taskNumber: number): MutationEvidenceRecord {
  const record = readEvidence(tempDir).find((item) => item.command === command && item.subject.number === taskNumber);
  if (!record) throw new Error(`missing mutation evidence for ${command} ${taskNumber}`);
  return record;
}

describe('task lifecycle mutation evidence', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-task-lifecycle-mutation-evidence-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('emits claim mutation evidence with read-back state', async () => {
    const result = await taskClaimCommand({
      taskNumber: '999',
      agent: 'impl-agent',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const evidence = findEvidence(tempDir, 'task claim', 999);
    expect(evidence.family).toBe('task_lifecycle');
    expect(evidence.authority_class).toBe('claim');
    expect(evidence.principal).toBe('impl-agent');
    expect(evidence.before?.status).toBe('opened');
    expect(evidence.after?.status).toBe('claimed');
    expect(evidence.confirmation).toMatchObject({ kind: 'read_back', status: 'confirmed' });
  });

  it('emits report mutation evidence with report id in replay payload', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'impl-agent', cwd: tempDir, format: 'json' });

    const result = await taskReportCommand({
      taskNumber: '999',
      agent: 'impl-agent',
      summary: 'Implemented feature X',
      verification: JSON.stringify([{ command: 'pnpm test', result: 'passed' }]),
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const evidence = findEvidence(tempDir, 'task report', 999);
    expect(evidence.authority_class).toBe('resolve');
    expect(evidence.before?.status).toBe('claimed');
    expect(evidence.after?.status).toBe('in_review');
    expect((evidence.replay_payload.command_result as { report_id?: string }).report_id).toBeTruthy();
  });

  it('emits finish mutation evidence for agent completion', async () => {
    await taskClaimCommand({ taskNumber: '999', agent: 'impl-agent', cwd: tempDir, format: 'json' });

    const result = await taskFinishCommand({
      taskNumber: '999',
      agent: 'impl-agent',
      summary: 'Implemented feature X',
      verification: JSON.stringify([{ command: 'pnpm test', result: 'passed' }]),
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const evidence = findEvidence(tempDir, 'task finish', 999);
    expect(evidence.authority_class).toBe('resolve');
    expect(evidence.before?.status).toBe('claimed');
    expect(evidence.after?.status).toBe('in_review');
    expect((evidence.replay_payload.command_result as { evidence_verdict?: string }).evidence_verdict).toBe('needs_review');
  });

  it('emits close mutation evidence with closure confirmation', async () => {
    const admission = await taskEvidenceAdmitCommand({
      taskNumber: '100',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
    });
    expect(admission.exitCode).toBe(ExitCode.SUCCESS);

    const result = await taskCloseCommand({
      taskNumber: '100',
      by: 'operator-1',
      cwd: tempDir,
      format: 'json',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const evidence = findEvidence(tempDir, 'task close', 100);
    expect(evidence.authority_class).toBe('confirm');
    expect(evidence.before?.status).toBe('in_review');
    expect(evidence.after?.status).toBe('closed');
    expect(evidence.after?.closed_by).toBe('operator-1');
  });
});
