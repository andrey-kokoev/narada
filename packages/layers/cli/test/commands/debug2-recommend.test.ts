import { vi } from 'vitest';
vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { taskRecommendCommand } from '../../src/commands/task-recommend.js';
import { taskClaimCommand } from '../../src/commands/task-claim.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks', 'tasks', 'assignments'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks', 'tasks', 'reports'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'reviews'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });

  writeFileSync(
    join(tempDir, '.ai', 'agents', 'roster.json'),
    JSON.stringify({
      version: 1,
      updated_at: '2026-01-01T00:00:00Z',
      agents: [
        { agent_id: 'agent-alpha', role: 'implementer', capabilities: ['typescript', 'testing', 'cli'], first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z' },
        { agent_id: 'agent-beta', role: 'implementer', capabilities: ['database', 'architecture'], first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z' },
        { agent_id: 'agent-gamma', role: 'reviewer', capabilities: ['typescript', 'testing'], first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z' },
      ],
    }, null, 2),
  );

  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-998-typescript-task.md'),
    '---\ntask_id: 998\nstatus: opened\n---\n\n# Task 998: TypeScript CLI Feature\n',
  );
  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-database-task.md'),
    '---\ntask_id: 999\nstatus: opened\n---\n\n# Task 999: Database Schema Update\n',
  );
  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-997-blocked-task.md'),
    '---\ntask_id: 997\nstatus: opened\ndepends_on: [998]\n---\n\n# Task 997: Blocked Task\n',
  );
}

describe('debug2', () => {
  let tempDir: string;
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-debug2-test-'));
    setupRepo(tempDir);
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('blocked', async () => {
    const result = await taskRecommendCommand({ cwd: tempDir, format: 'json' });
    console.log('BLOCKED RESULT:', JSON.stringify(result, null, 2));
    const rec = result.result as { abstained: Array<{ task_id: string }> };
    const blocked = rec.abstained.find((a) => a.task_id === '20260420-997-blocked-task');
    console.log('BLOCKED:', blocked);
    expect(blocked).toBeDefined();
  });

  it('all claimed', async () => {
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-998-typescript-task.md'),
      '---\ntask_id: 998\nstatus: claimed\n---\n\n# Task 998\n',
    );
    writeFileSync(
      join(tempDir, '.ai', 'do-not-open', 'tasks', '20260420-999-database-task.md'),
      '---\ntask_id: 999\nstatus: claimed\n---\n\n# Task 999\n',
    );
    const result = await taskRecommendCommand({ cwd: tempDir, format: 'json' });
    console.log('ALL CLAIMED RESULT:', JSON.stringify(result, null, 2));
    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
  });
});
