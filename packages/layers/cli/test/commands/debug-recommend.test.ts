import { vi } from 'vitest';
vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { taskRecommendCommand } from '../../src/commands/task-recommend.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'tasks', 'assignments'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'tasks', 'reports'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'reviews'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'tasks'), { recursive: true });

  writeFileSync(
    join(tempDir, '.ai', 'agents', 'roster.json'),
    JSON.stringify({
      version: 1,
      updated_at: '2026-01-01T00:00:00Z',
      agents: [
        { agent_id: 'agent-alpha', role: 'implementer', capabilities: ['typescript'], first_seen_at: '2026-01-01T00:00:00Z', last_active_at: '2026-01-01T00:00:00Z' },
      ],
    }, null, 2),
  );

  writeFileSync(
    join(tempDir, '.ai', 'tasks', '20260420-998-task.md'),
    '---\ntask_id: 998\nstatus: claimed\n---\n\n# Task 998\n',
  );
  writeFileSync(
    join(tempDir, '.ai', 'tasks', '20260420-999-task.md'),
    '---\ntask_id: 999\nstatus: claimed\n---\n\n# Task 999\n',
  );
}

describe('debug', () => {
  let tempDir: string;
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-debug-test-'));
    setupRepo(tempDir);
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('debug no primary', async () => {
    const result = await taskRecommendCommand({ cwd: tempDir, format: 'json' });
    console.log('RESULT:', JSON.stringify(result, null, 2));
    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
  });
});
