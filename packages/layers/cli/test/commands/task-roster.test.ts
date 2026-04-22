import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  taskRosterShowCommand,
  taskRosterAssignCommand,
  taskRosterReviewCommand,
  taskRosterDoneCommand,
  taskRosterIdleCommand,
} from '../../src/commands/task-roster.js';
import {
  loadRoster,
  updateAgentRosterEntry,
  formatRoster,
} from '../../src/lib/task-governance.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupRepo(tempDir: string, roster?: unknown) {
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });

  writeFileSync(
    join(tempDir, '.ai', 'agents', 'roster.json'),
    JSON.stringify(roster ?? {
      version: 2,
      updated_at: '2026-01-01T00:00:00Z',
      agents: [
        {
          agent_id: 'test-agent',
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
    });

    it('returns roster in json format', async () => {
      const result = await taskRosterShowCommand({ cwd: tempDir, format: 'json' });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(typeof result.result).toBe('object');
      const parsed = result.result as { agents: unknown[] };
      expect(parsed.agents).toHaveLength(2);
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

      const roster = await loadRoster(tempDir);
      const entry = roster.agents.find((a) => a.agent_id === 'test-agent');
      expect(entry?.status).toBe('working');
      expect(entry?.task).toBe(385);
      expect(entry?.updated_at).toBeDefined();
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
  });

  describe('review', () => {
    it('records status reviewing and task number', async () => {
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
      });

      const roster = await loadRoster(tempDir);
      const entry = roster.agents.find((a) => a.agent_id === 'reviewer-agent');
      expect(entry?.status).toBe('reviewing');
      expect(entry?.task).toBe(370);
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
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.result).toMatchObject({
        status: 'ok',
        agent: 'test-agent',
        agent_status: 'done',
        last_done: 385,
      });

      const roster = await loadRoster(tempDir);
      const entry = roster.agents.find((a) => a.agent_id === 'test-agent');
      expect(entry?.status).toBe('done');
      expect(entry?.task).toBeNull();
      expect(entry?.last_done).toBe(385);
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
});
