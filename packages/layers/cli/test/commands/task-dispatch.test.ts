import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { taskDispatchCommand } from '../../src/commands/task-dispatch.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database, JsonPrincipalSessionBindingRegistry } from '@narada2/control-plane';
import { SqliteTaskLifecycleStore } from '../../src/lib/task-lifecycle-store.js';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'tasks', 'assignments'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });

  writeFileSync(
    join(tempDir, '.ai', 'agents', 'roster.json'),
    JSON.stringify(
      {
        version: 2,
        updated_at: '2026-01-01T00:00:00Z',
        agents: [
          {
            agent_id: 'alpha',
            role: 'implementer',
            capabilities: ['claim'],
            first_seen_at: '2026-01-01T00:00:00Z',
            last_active_at: '2026-01-01T00:00:00Z',
            status: 'idle',
            task: null,
            last_done: null,
            updated_at: '2026-01-01T00:00:00Z',
          },
        ],
      },
      null,
      2,
    ),
  );
}

function writeTask(tempDir: string, num: number, status: string, extra = '') {
  writeFileSync(
    join(tempDir, '.ai', 'tasks', `20260420-${num}-test.md`),
    `---\ntask_id: ${num}\nstatus: ${status}\n---\n\n# Task ${num}: Test\n\n## Acceptance Criteria\n- [x] Criterion A\n- [x] Criterion B\n\n${extra}`,
  );
}

function writeAssignment(tempDir: string, fileTaskId: string, agentId: string) {
  writeFileSync(
    join(tempDir, '.ai', 'tasks', 'assignments', `${fileTaskId}.json`),
    JSON.stringify(
      {
        task_id: fileTaskId,
        assignments: [
          {
            agent_id: agentId,
            claimed_at: '2026-04-24T10:00:00.000Z',
            claim_context: null,
            released_at: null,
            release_reason: null,
            intent: 'primary',
          },
        ],
      },
      null,
      2,
    ),
  );
}

function createStore(tempDir: string): SqliteTaskLifecycleStore {
  const db = new Database(':memory:');
  const store = new SqliteTaskLifecycleStore({ db });
  store.initSchema();
  return store;
}

describe('task dispatch surface', () => {
  let tempDir: string;
  let store: SqliteTaskLifecycleStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-dispatch-test-'));
    setupRepo(tempDir);
    store = createStore(tempDir);
  });

  afterEach(() => {
    store.db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('queue', () => {
    it('returns empty queue when no tasks are assigned', async () => {
      const result = await taskDispatchCommand({
        action: 'queue',
        agent: 'alpha',
        cwd: tempDir,
        format: 'json',
        store,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const r = result.result as { tasks: unknown[] };
      expect(r.tasks).toEqual([]);
    });

    it('shows assigned task as visible when ready to pick up', async () => {
      writeTask(tempDir, 100, 'claimed');
      writeAssignment(tempDir, '20260420-100-test', 'alpha');
      store.upsertLifecycle({
        task_id: '20260420-100-test',
        task_number: 100,
        status: 'claimed',
        governed_by: null,
        closed_at: null,
        closed_by: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-04-24T10:00:00.000Z',
      });

      const result = await taskDispatchCommand({
        action: 'queue',
        agent: 'alpha',
        cwd: tempDir,
        format: 'json',
        store,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const r = result.result as { tasks: Array<{ task_number: number; reason?: string }> };
      expect(r.tasks.length).toBe(1);
      expect(r.tasks[0]!.task_number).toBe(100);
      expect(r.tasks[0]!.reason).toBeUndefined();
    });

    it('shows assigned task as blocked when already picked up', async () => {
      writeTask(tempDir, 100, 'claimed');
      writeAssignment(tempDir, '20260420-100-test', 'alpha');
      store.upsertLifecycle({
        task_id: '20260420-100-test',
        task_number: 100,
        status: 'claimed',
        governed_by: null,
        closed_at: null,
        closed_by: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-04-24T10:00:00.000Z',
      });
      store.insertDispatchPacket({
        packet_id: 'disp_100_2026-04-24T10:00:00.000Z_1',
        task_id: '20260420-100-test',
        assignment_id: '2026-04-24T10:00:00.000Z',
        agent_id: 'alpha',
        picked_up_at: '2026-04-24T10:00:00.000Z',
        lease_expires_at: '2026-04-24T10:30:00.000Z',
        heartbeat_at: null,
        dispatch_status: 'picked_up',
        sequence: 1,
        created_by: 'agent_pickup',
      });

      const result = await taskDispatchCommand({
        action: 'queue',
        agent: 'alpha',
        cwd: tempDir,
        format: 'json',
        store,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const r = result.result as { tasks: Array<{ task_number: number; reason?: string }> };
      expect(r.tasks.length).toBe(1);
      expect(r.tasks[0]!.reason).toBe('Already picked up');
    });
  });

  describe('pickup', () => {
    it('picks up an assigned task', async () => {
      writeTask(tempDir, 100, 'claimed');
      writeAssignment(tempDir, '20260420-100-test', 'alpha');
      store.upsertLifecycle({
        task_id: '20260420-100-test',
        task_number: 100,
        status: 'claimed',
        governed_by: null,
        closed_at: null,
        closed_by: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-04-24T10:00:00.000Z',
      });

      const result = await taskDispatchCommand({
        action: 'pickup',
        taskNumber: '100',
        agent: 'alpha',
        cwd: tempDir,
        format: 'json',
        store,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const r = result.result as { status: string; packet_id: string };
      expect(r.status).toBe('success');
      expect(r.packet_id).toMatch(/^disp_20260420-100-test_/);
    });

    it('rejects pickup when task is not assigned', async () => {
      writeTask(tempDir, 100, 'opened');

      const result = await taskDispatchCommand({
        action: 'pickup',
        taskNumber: '100',
        agent: 'alpha',
        cwd: tempDir,
        format: 'json',
        store,
      });

      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
      const r = result.result as { error: string };
      expect(r.error).toContain('No assignment record');
    });

    it('rejects pickup by wrong agent', async () => {
      writeTask(tempDir, 100, 'claimed');
      writeAssignment(tempDir, '20260420-100-test', 'beta');
      store.upsertLifecycle({
        task_id: '20260420-100-test',
        task_number: 100,
        status: 'claimed',
        governed_by: null,
        closed_at: null,
        closed_by: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-04-24T10:00:00.000Z',
      });

      const result = await taskDispatchCommand({
        action: 'pickup',
        taskNumber: '100',
        agent: 'alpha',
        cwd: tempDir,
        format: 'json',
        store,
      });

      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
      const r = result.result as { error: string };
      expect(r.error).toContain('assigned to beta');
    });

    it('rejects double pickup', async () => {
      writeTask(tempDir, 100, 'claimed');
      writeAssignment(tempDir, '20260420-100-test', 'alpha');
      store.upsertLifecycle({
        task_id: '20260420-100-test',
        task_number: 100,
        status: 'claimed',
        governed_by: null,
        closed_at: null,
        closed_by: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-04-24T10:00:00.000Z',
      });
      store.insertDispatchPacket({
        packet_id: 'disp_100_2026-04-24T10:00:00.000Z_1',
        task_id: '20260420-100-test',
        assignment_id: '2026-04-24T10:00:00.000Z',
        agent_id: 'alpha',
        picked_up_at: '2026-04-24T10:00:00.000Z',
        lease_expires_at: '2026-04-24T10:30:00.000Z',
        heartbeat_at: null,
        dispatch_status: 'picked_up',
        sequence: 1,
        created_by: 'agent_pickup',
      });

      const result = await taskDispatchCommand({
        action: 'pickup',
        taskNumber: '100',
        agent: 'alpha',
        cwd: tempDir,
        format: 'json',
        store,
      });

      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
      const r = result.result as { error: string };
      expect(r.error).toContain('already picked up');
    });
  });

  describe('status', () => {
    it('shows no packets for untouched task', async () => {
      writeTask(tempDir, 100, 'claimed');
      store.upsertLifecycle({
        task_id: '20260420-100-test',
        task_number: 100,
        status: 'claimed',
        governed_by: null,
        closed_at: null,
        closed_by: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-04-24T10:00:00.000Z',
      });

      const result = await taskDispatchCommand({
        action: 'status',
        taskNumber: '100',
        cwd: tempDir,
        format: 'json',
        store,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const r = result.result as { packets: unknown[] };
      expect(r.packets).toEqual([]);
    });

    it('shows packet after pickup', async () => {
      writeTask(tempDir, 100, 'claimed');
      store.upsertLifecycle({
        task_id: '20260420-100-test',
        task_number: 100,
        status: 'claimed',
        governed_by: null,
        closed_at: null,
        closed_by: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-04-24T10:00:00.000Z',
      });
      store.insertDispatchPacket({
        packet_id: 'disp_100_assign-1_1',
        task_id: '20260420-100-test',
        assignment_id: 'assign-1',
        agent_id: 'alpha',
        picked_up_at: '2026-04-24T10:00:00.000Z',
        lease_expires_at: '2026-04-24T10:30:00.000Z',
        heartbeat_at: null,
        dispatch_status: 'picked_up',
        sequence: 1,
        created_by: 'agent_pickup',
      });

      const result = await taskDispatchCommand({
        action: 'status',
        taskNumber: '100',
        cwd: tempDir,
        format: 'json',
        store,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const r = result.result as { packets: Array<{ packet_id: string }> };
      expect(r.packets.length).toBe(1);
      expect(r.packets[0]!.packet_id).toBe('disp_100_assign-1_1');
    });
  });

  describe('heartbeat', () => {
    it('extends lease on heartbeat', () => {
      store.upsertLifecycle({
        task_id: '20260420-100-test',
        task_number: 100,
        status: 'claimed',
        governed_by: null,
        closed_at: null,
        closed_by: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-04-24T10:00:00.000Z',
      });
      store.insertDispatchPacket({
        packet_id: 'disp_100_assign-1_1',
        task_id: '20260420-100-test',
        assignment_id: 'assign-1',
        agent_id: 'alpha',
        picked_up_at: '2026-04-24T10:00:00.000Z',
        lease_expires_at: '2026-04-24T10:30:00.000Z',
        heartbeat_at: null,
        dispatch_status: 'picked_up',
        sequence: 1,
        created_by: 'agent_pickup',
      });

      store.heartbeatDispatchPacket('disp_100_assign-1_1', 15, 240);

      const packet = store.getActiveDispatchPacketForAssignment('assign-1');
      expect(packet).toBeDefined();
      expect(packet!.heartbeat_at).not.toBeNull();
      // Lease should be extended from 10:30 to 10:45
      expect(packet!.lease_expires_at).toBe('2026-04-24T10:45:00.000Z');
    });

    it('caps lease at maxLeaseMinutes from pickup', () => {
      store.upsertLifecycle({
        task_id: '20260420-100-test',
        task_number: 100,
        status: 'claimed',
        governed_by: null,
        closed_at: null,
        closed_by: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-04-24T10:00:00.000Z',
      });
      store.insertDispatchPacket({
        packet_id: 'disp_100_assign-1_1',
        task_id: '20260420-100-test',
        assignment_id: 'assign-1',
        agent_id: 'alpha',
        picked_up_at: '2026-04-24T10:00:00.000Z',
        lease_expires_at: '2026-04-24T13:50:00.000Z', // already near 3h 50m
        heartbeat_at: null,
        dispatch_status: 'picked_up',
        sequence: 1,
        created_by: 'agent_pickup',
      });

      store.heartbeatDispatchPacket('disp_100_assign-1_1', 15, 240);

      const packet = store.getActiveDispatchPacketForAssignment('assign-1');
      expect(packet).toBeDefined();
      // Should be capped at 4 hours from 10:00 = 14:00
      expect(packet!.lease_expires_at).toBe('2026-04-24T14:00:00.000Z');
    });

    it('throws for nonexistent packet', () => {
      expect(() => store.heartbeatDispatchPacket('nonexistent', 15, 240)).toThrow(
        'not found',
      );
    });
  });

  describe('updateDispatchStatus', () => {
    it('updates status', () => {
      store.upsertLifecycle({
        task_id: '20260420-100-test',
        task_number: 100,
        status: 'claimed',
        governed_by: null,
        closed_at: null,
        closed_by: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-04-24T10:00:00.000Z',
      });
      store.insertDispatchPacket({
        packet_id: 'disp_100_assign-1_1',
        task_id: '20260420-100-test',
        assignment_id: 'assign-1',
        agent_id: 'alpha',
        picked_up_at: '2026-04-24T10:00:00.000Z',
        lease_expires_at: '2026-04-24T10:30:00.000Z',
        heartbeat_at: null,
        dispatch_status: 'picked_up',
        sequence: 1,
        created_by: 'agent_pickup',
      });

      store.updateDispatchStatus('disp_100_assign-1_1', 'released');

      const packet = store.getActiveDispatchPacketForAssignment('assign-1');
      expect(packet).toBeUndefined(); // released is not active

      const all = store.getDispatchPacketsForTask('20260420-100-test');
      expect(all[0]!.dispatch_status).toBe('released');
    });

    it('throws for nonexistent packet', () => {
      expect(() => store.updateDispatchStatus('nonexistent', 'expired')).toThrow(
        'not found',
      );
    });
  });

  describe('session targeting (Task 576)', () => {
    it('includes resolved session targeting in pickup result when binding exists', async () => {
      writeTask(tempDir, 100, 'claimed');
      writeAssignment(tempDir, '20260420-100-test', 'alpha');
      store.upsertLifecycle({
        task_id: '20260420-100-test',
        task_number: 100,
        status: 'claimed',
        governed_by: null,
        closed_at: null,
        closed_by: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-04-24T10:00:00.000Z',
      });

      // Seed a principal session binding for alpha
      const bindingRegistry = new JsonPrincipalSessionBindingRegistry({ rootDir: tempDir });
      bindingRegistry.setBinding({
        principal_id: 'alpha',
        session_id: 'sess_alpha_123',
        session_title: 'alpha-session',
        bound_at: '2026-04-24T10:00:00Z',
        last_verified_at: '2026-04-24T10:00:00Z',
        bound_by: 'operator',
      });
      await bindingRegistry.flush();

      const result = await taskDispatchCommand({
        action: 'pickup',
        taskNumber: '100',
        agent: 'alpha',
        cwd: tempDir,
        format: 'json',
        store,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const r = result.result as {
        status: string;
        target_session_id: string | null;
        target_session_title: string | null;
      };
      expect(r.target_session_id).toBe('sess_alpha_123');
      expect(r.target_session_title).toBe('alpha-session');

      // Verify packet in store also has targeting
      const packets = store.getDispatchPacketsForTask('20260420-100-test');
      expect(packets).toHaveLength(1);
      expect(packets[0]!.target_session_id).toBe('sess_alpha_123');
      expect(packets[0]!.target_session_title).toBe('alpha-session');
    });

    it('handles missing binding gracefully (null targeting)', async () => {
      writeTask(tempDir, 100, 'claimed');
      writeAssignment(tempDir, '20260420-100-test', 'alpha');
      store.upsertLifecycle({
        task_id: '20260420-100-test',
        task_number: 100,
        status: 'claimed',
        governed_by: null,
        closed_at: null,
        closed_by: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-04-24T10:00:00.000Z',
      });

      // No binding seeded — registry will be empty

      const result = await taskDispatchCommand({
        action: 'pickup',
        taskNumber: '100',
        agent: 'alpha',
        cwd: tempDir,
        format: 'json',
        store,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const r = result.result as {
        status: string;
        target_session_id: string | null;
        target_session_title: string | null;
      };
      expect(r.target_session_id).toBeNull();
      expect(r.target_session_title).toBeNull();

      const packets = store.getDispatchPacketsForTask('20260420-100-test');
      expect(packets[0]!.target_session_id).toBeNull();
    });

    it('shows session targeting in status output', async () => {
      writeTask(tempDir, 100, 'claimed');
      writeAssignment(tempDir, '20260420-100-test', 'alpha');
      store.upsertLifecycle({
        task_id: '20260420-100-test',
        task_number: 100,
        status: 'claimed',
        governed_by: null,
        closed_at: null,
        closed_by: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-04-24T10:00:00.000Z',
      });
      store.insertDispatchPacket({
        packet_id: 'disp_100_assign-1_1',
        task_id: '20260420-100-test',
        assignment_id: 'assign-1',
        agent_id: 'alpha',
        picked_up_at: '2026-04-24T10:00:00.000Z',
        lease_expires_at: '2026-04-24T10:30:00.000Z',
        heartbeat_at: null,
        dispatch_status: 'picked_up',
        sequence: 1,
        created_by: 'agent_pickup',
        target_session_id: 'sess_abc',
        target_session_title: 'Alpha Session',
      });

      const result = await taskDispatchCommand({
        action: 'status',
        taskNumber: '100',
        cwd: tempDir,
        format: 'json',
        store,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const r = result.result as { packets: Array<{ target_session_id: string | null; target_session_title: string | null }> };
      expect(r.packets[0]!.target_session_id).toBe('sess_abc');
      expect(r.packets[0]!.target_session_title).toBe('Alpha Session');
    });
  });

  describe('start (Task 577)', () => {
    it('transitions packet to executing and returns execution context', async () => {
      writeTask(tempDir, 100, 'claimed');
      writeAssignment(tempDir, '20260420-100-test', 'alpha');
      store.upsertLifecycle({
        task_id: '20260420-100-test',
        task_number: 100,
        status: 'claimed',
        governed_by: null,
        closed_at: null,
        closed_by: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-04-24T10:00:00.000Z',
      });
      store.insertDispatchPacket({
        packet_id: 'disp_100_assign-1_1',
        task_id: '20260420-100-test',
        assignment_id: 'assign-1',
        agent_id: 'alpha',
        picked_up_at: '2026-04-24T10:00:00.000Z',
        lease_expires_at: '2099-01-01T00:00:00.000Z', // not expired
        heartbeat_at: null,
        dispatch_status: 'picked_up',
        sequence: 1,
        created_by: 'agent_pickup',
      });

      const result = await taskDispatchCommand({
        action: 'start',
        agent: 'alpha',
        cwd: tempDir,
        format: 'json',
        store,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const r = result.result as {
        status: string;
        action: string;
        packet_id: string;
        task_id: string;
        recommended_command: string;
      };
      expect(r.status).toBe('success');
      expect(r.action).toBe('ready');
      expect(r.packet_id).toBe('disp_100_assign-1_1');
      expect(r.task_id).toBe('20260420-100-test');
      expect(r.recommended_command).toContain('kimi');

      // Packet status should be updated to executing
      const packets = store.getDispatchPacketsForTask('20260420-100-test');
      expect(packets[0]!.dispatch_status).toBe('executing');
    });

    it('uses --session when binding exists, --continue otherwise', async () => {
      writeTask(tempDir, 100, 'claimed');
      writeAssignment(tempDir, '20260420-100-test', 'alpha');
      store.upsertLifecycle({
        task_id: '20260420-100-test',
        task_number: 100,
        status: 'claimed',
        governed_by: null,
        closed_at: null,
        closed_by: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-04-24T10:00:00.000Z',
      });
      store.insertDispatchPacket({
        packet_id: 'disp_100_assign-1_1',
        task_id: '20260420-100-test',
        assignment_id: 'assign-1',
        agent_id: 'alpha',
        picked_up_at: '2026-04-24T10:00:00.000Z',
        lease_expires_at: '2099-01-01T00:00:00.000Z',
        heartbeat_at: null,
        dispatch_status: 'picked_up',
        sequence: 1,
        created_by: 'agent_pickup',
        target_session_id: 'sess_alpha_123',
        target_session_title: 'alpha-session',
      });

      const result = await taskDispatchCommand({
        action: 'start',
        agent: 'alpha',
        cwd: tempDir,
        format: 'json',
        store,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const r = result.result as { recommended_command: string };
      expect(r.recommended_command).toContain('--session sess_alpha_123');
      expect(r.recommended_command).not.toContain('--continue');
    });

    it('rejects start when no active pickup exists', async () => {
      const result = await taskDispatchCommand({
        action: 'start',
        agent: 'alpha',
        cwd: tempDir,
        format: 'json',
        store,
      });

      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
      const r = result.result as { error: string };
      expect(r.error).toContain('No active pickup');
    });

    it('rejects start when lease is expired', async () => {
      writeTask(tempDir, 100, 'claimed');
      writeAssignment(tempDir, '20260420-100-test', 'alpha');
      store.upsertLifecycle({
        task_id: '20260420-100-test',
        task_number: 100,
        status: 'claimed',
        governed_by: null,
        closed_at: null,
        closed_by: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-04-24T10:00:00.000Z',
      });
      store.insertDispatchPacket({
        packet_id: 'disp_100_assign-1_1',
        task_id: '20260420-100-test',
        assignment_id: 'assign-1',
        agent_id: 'alpha',
        picked_up_at: '2026-04-24T10:00:00.000Z',
        lease_expires_at: '2026-04-24T10:01:00.000Z', // expired
        heartbeat_at: null,
        dispatch_status: 'picked_up',
        sequence: 1,
        created_by: 'agent_pickup',
      });

      const result = await taskDispatchCommand({
        action: 'start',
        agent: 'alpha',
        cwd: tempDir,
        format: 'json',
        store,
      });

      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
      const r = result.result as { error: string };
      expect(r.error).toContain('lease expired');
    });

    it('returns action executed when --exec is set', async () => {
      writeTask(tempDir, 100, 'claimed');
      writeAssignment(tempDir, '20260420-100-test', 'alpha');
      store.upsertLifecycle({
        task_id: '20260420-100-test',
        task_number: 100,
        status: 'claimed',
        governed_by: null,
        closed_at: null,
        closed_by: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: '2026-04-24T10:00:00.000Z',
      });
      store.insertDispatchPacket({
        packet_id: 'disp_100_assign-1_1',
        task_id: '20260420-100-test',
        assignment_id: 'assign-1',
        agent_id: 'alpha',
        picked_up_at: '2026-04-24T10:00:00.000Z',
        lease_expires_at: '2099-01-01T00:00:00.000Z',
        heartbeat_at: null,
        dispatch_status: 'picked_up',
        sequence: 1,
        created_by: 'agent_pickup',
      });

      const result = await taskDispatchCommand({
        action: 'start',
        agent: 'alpha',
        exec: true,
        cwd: tempDir,
        format: 'json',
        store,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const r = result.result as { action: string };
      expect(r.action).toBe('executed');
    });
  });
});
