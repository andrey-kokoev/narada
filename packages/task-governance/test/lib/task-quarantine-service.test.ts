import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { quarantineWrongLocusTaskService } from '../../src/task-quarantine-service.js';
import { openTaskLifecycleStore } from '../../src/task-lifecycle-store.js';
import { findNextTaskForAgent } from '../../src/task-governance.js';
import { ExitCode } from '../../src/exit-codes.js';

describe('wrong-locus task quarantine service', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-task-quarantine-'));
    mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
    mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
    mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks', 'tasks', 'assignments'), { recursive: true });
    writeFileSync(
      join(tempDir, '.ai', 'agents', 'roster.json'),
      JSON.stringify({
        version: 1,
        updated_at: '2026-05-20T00:00:00Z',
        agents: [
          { agent_id: 'builder', role: 'builder', capabilities: ['tasks'], first_seen_at: '2026-05-20T00:00:00Z', last_active_at: '2026-05-20T00:00:00Z', status: 'idle' },
          { agent_id: 'codex-foreign', role: 'builder', capabilities: ['tasks'], first_seen_at: '2026-05-20T00:00:00Z', last_active_at: '2026-05-20T00:00:00Z', status: 'working', task: 902 },
        ],
      }, null, 2),
    );
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function writeTask(num: number, status: 'opened' | 'claimed') {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', `20260520-${num}-foreign-task.md`),
      `---\nstatus: ${status}\n---\n\n# Task ${num}: Foreign Task\n\n## Acceptance Criteria\n\n- [ ] Foreign criterion not completed\n`,
    );
  }

  it('quarantines an opened wrong-locus task without accepting its criteria', async () => {
    writeTask(901, 'opened');

    const result = await quarantineWrongLocusTaskService({
      taskNumber: '901',
      by: 'builder',
      rationale: 'foreign product task admitted to Staccato workboard',
      evidenceRef: 'task://146/wrong-locus-audit',
      cwd: tempDir,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result.status).toBe('success');
    expect(result.result.new_status).toBe('quarantined');

    const content = readFileSync(join(tempDir, '.ai', 'do-not-open', 'tasks', '20260520-901-foreign-task.md'), 'utf8');
    expect(content).toContain('status: quarantined');
    expect(content).toContain('governed_by: wrong_locus:builder');
    expect(content).toContain('- [ ] Foreign criterion not completed');
    expect(content).toContain('## Wrong-Locus Quarantine');

    const store = openTaskLifecycleStore(tempDir);
    try {
      const lifecycle = store.getLifecycleByNumber(901);
      expect(lifecycle?.status).toBe('quarantined');
      expect(lifecycle?.governed_by).toBe('wrong_locus:builder');
      expect(lifecycle?.continuation_packet_json).toContain('wrong_locus');
      const next = await findNextTaskForAgent(tempDir, 'builder', store);
      expect(next?.taskNumber).not.toBe(901);
    } finally {
      store.db.close();
    }
  });

  it('quarantines a claimed generic codex wrong-locus task and releases assignment', async () => {
    writeTask(902, 'claimed');
    const store = openTaskLifecycleStore(tempDir);
    try {
      store.upsertLifecycle({
        task_id: '20260520-902-foreign-task',
        task_number: 902,
        status: 'claimed',
        governed_by: null,
        closed_at: null,
        closed_by: null,
        closure_mode: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-05-20T00:00:00Z',
      });
      store.insertAssignment({
        assignment_id: 'assign-902',
        task_id: '20260520-902-foreign-task',
        agent_id: 'codex-foreign',
        claimed_at: '2026-05-20T00:00:00Z',
        released_at: null,
        release_reason: null,
        intent: 'primary',
      });
    } finally {
      store.db.close();
    }

    const result = await quarantineWrongLocusTaskService({
      taskNumber: '902',
      by: 'builder',
      rationale: 'generic codex-claimed foreign task',
      cwd: tempDir,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result.status).toBe('success');
    expect(result.result.assignment_released).toBe(true);
    expect(result.result.reconciled_agent_id).toBe('codex-foreign');

    const storeAfter = openTaskLifecycleStore(tempDir);
    try {
      expect(storeAfter.getLifecycleByNumber(902)?.status).toBe('quarantined');
      const assignments = storeAfter.getAssignments('20260520-902-foreign-task');
      expect(assignments[0]?.release_reason).toBe('wrong_locus');
      expect(storeAfter.getActiveAssignment('20260520-902-foreign-task')).toBeUndefined();
      const next = await findNextTaskForAgent(tempDir, 'builder', storeAfter);
      expect(next?.taskNumber).not.toBe(902);
    } finally {
      storeAfter.db.close();
    }
  });
});
