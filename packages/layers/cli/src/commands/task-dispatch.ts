/**
 * Task dispatch surface v0.
 *
 * Bounded local surface for assigned agents to observe and pick up work.
 *
 * Subcommands:
 *   queue   — show visible assigned work for an agent
 *   pickup  — pick up a specific task (create dispatch packet)
 *   status  — show dispatch status for a task
 */

import { resolve } from 'node:path';
import {
  findTaskFile,
  readTaskFile,
  loadRoster,
  checkDependencies,
  type TaskAssignmentRecord,
} from '../lib/task-governance.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import { resolvePrincipalStateDir } from '../lib/principal-bridge.js';
import type {
  TaskLifecycleStore,
  TaskStatus,
  DispatchPacketRow,
} from '../lib/task-lifecycle-store.js';
import { JsonPrincipalSessionBindingRegistry } from '@narada2/control-plane';

export interface TaskDispatchOptions {
  action: 'queue' | 'pickup' | 'status' | 'start';
  taskNumber?: string;
  agent?: string;
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
  store?: TaskLifecycleStore;
  exec?: boolean;
}

/** Lease constants from Decision 571 */
const DEFAULT_LEASE_MINUTES = 30;
const HEARTBEAT_EXTENSION_MINUTES = 15;
const MAX_LEASE_MINUTES = 240;

function nowIso(): string {
  return new Date().toISOString();
}

function leaseExpiryIso(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function makePacketId(taskId: string, assignmentId: string, sequence: number): string {
  return `disp_${taskId}_${assignmentId}_${sequence}`;
}

async function loadAssignmentRecord(
  cwd: string,
  taskId: string,
  store: TaskLifecycleStore,
): Promise<TaskAssignmentRecord | null> {
  const stored = store.getAssignmentRecord(taskId);
  if (stored) {
    return JSON.parse(stored.record_json) as TaskAssignmentRecord;
  }
  const { loadAssignment } = await import('../lib/task-governance.js');
  return loadAssignment(cwd, taskId);
}

/**
 * Determine if a task is visible in an agent's dispatch queue.
 */
async function isTaskVisible(
  cwd: string,
  taskId: string,
  taskNumber: number,
  agentId: string,
  store: TaskLifecycleStore,
): Promise<{ visible: boolean; reason?: string }> {
  // 1. Assignment exists and is unreleased for this agent
  const assignmentRecord = await loadAssignmentRecord(cwd, taskId, store);
  if (!assignmentRecord) {
    return { visible: false, reason: 'No assignment record' };
  }
  const activeAssignment = assignmentRecord.assignments.find((a) => a.released_at === null);
  if (!activeAssignment) {
    return { visible: false, reason: 'No active assignment' };
  }
  if (activeAssignment.agent_id !== agentId) {
    return { visible: false, reason: 'Assigned to a different agent' };
  }

  // 2. Task status is claimed or needs_continuation
  const lifecycle = store.getLifecycle(taskId);
  const status = lifecycle?.status ?? 'opened';
  if (status !== 'claimed' && status !== 'needs_continuation') {
    return { visible: false, reason: `Task status is ${status}` };
  }

  // 3. Dependencies satisfied
  const { frontMatter } = await readTaskFile(
    (await findTaskFile(cwd, String(taskNumber)))!.path,
  );
  const dependsOn = frontMatter.depends_on as number[] | undefined;
  const { blockedBy } = await checkDependencies(cwd, dependsOn, store);
  if (blockedBy.length > 0) {
    return { visible: false, reason: `Blocked by dependencies: ${blockedBy.join(', ')}` };
  }

  // 4. No active dispatch packet for this assignment
  const activePacket = store.getActiveDispatchPacketForAssignment(activeAssignment.claimed_at);
  // For v0, we use claimed_at as a proxy for assignment_id since assignments are still JSON
  // TODO: migrate assignments to SQLite (Task 564 follow-up)
  if (activePacket) {
    return { visible: false, reason: 'Already picked up' };
  }

  return { visible: true };
}

async function doQueue(
  options: TaskDispatchOptions,
  store: TaskLifecycleStore,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const agentId = options.agent;

  if (!agentId) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: '--agent is required' },
    };
  }

  // Verify agent exists in roster
  let roster;
  try {
    roster = await loadRoster(cwd);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Failed to load agent roster: ${msg}` },
    };
  }

  const agent = roster.agents.find((a) => a.agent_id === agentId);
  if (!agent) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: `Agent not found in roster: ${agentId}` },
    };
  }

  // Find all tasks assigned to this agent
  // For v0, scan filesystem for tasks with active assignments
  const { readdir } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const tasksDir = join(cwd, '.ai', 'do-not-open', 'tasks');
  let files: string[] = [];
  try {
    files = await readdir(tasksDir);
  } catch {
    // No tasks dir
  }

  const visibleTasks: Array<{
    task_number: number;
    task_id: string;
    title: string;
    status: TaskStatus | string;
    reason?: string;
  }> = [];

  for (const f of files.filter((f) => f.endsWith('.md'))) {
    const taskFile = await findTaskFile(cwd, f.replace(/\.md$/, ''));
    if (!taskFile) continue;

    const { frontMatter, body } = await readTaskFile(taskFile.path);
    const numMatch = f.match(/-(\d+)-/);
    const taskNumber = numMatch ? Number(numMatch[1]) : null;
    if (taskNumber === null) continue;

    const assignmentRecord = await loadAssignmentRecord(cwd, taskFile.taskId, store);
    const activeAssignment = assignmentRecord?.assignments.find((a) => a.released_at === null);
    if (!activeAssignment || activeAssignment.agent_id !== agentId) continue;

    const lifecycle = store.getLifecycle(taskFile.taskId);
    const status = lifecycle?.status ?? (frontMatter.status as string) ?? 'opened';

    const { visible, reason } = await isTaskVisible(cwd, taskFile.taskId, taskNumber, agentId, store);

    const titleMatch = body.match(/^# Task \d+:\s*(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : 'Untitled';

    visibleTasks.push({
      task_number: taskNumber,
      task_id: taskFile.taskId,
      title,
      status,
      reason: visible ? undefined : reason,
    });
  }

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        agent_id: agentId,
        tasks: visibleTasks,
      },
    };
  }

  fmt.message(`Dispatch Queue for ${agentId}`, 'info');
  fmt.message('');
  if (visibleTasks.length === 0) {
    fmt.message('No assigned tasks found.', 'info');
  } else {
    for (const t of visibleTasks) {
      const marker = t.reason ? `⚠ ${t.reason}` : '→ ready to pick up';
      fmt.message(`  ${t.task_number}  ${t.status.padEnd(20)} ${t.title}  (${marker})`);
    }
  }

  return {
    exitCode: ExitCode.SUCCESS,
    result: { agent_id: agentId, tasks: visibleTasks },
  };
}

async function doPickup(
  options: TaskDispatchOptions,
  store: TaskLifecycleStore,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const taskNumber = options.taskNumber;
  const agentId = options.agent;

  if (!taskNumber) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: 'Task number is required' },
    };
  }
  if (!agentId) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: '--agent is required' },
    };
  }

  const taskFile = await findTaskFile(cwd, taskNumber);
  if (!taskFile) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: `Task not found: ${taskNumber}` },
    };
  }

  // Load assignment record
  const assignmentRecord = await loadAssignmentRecord(cwd, taskFile.taskId, store);
  if (!assignmentRecord) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: 'No assignment record for this task' },
    };
  }

  const activeAssignment = assignmentRecord.assignments.find((a) => a.released_at === null);
  if (!activeAssignment) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: 'No active assignment for this task' },
    };
  }
  if (activeAssignment.agent_id !== agentId) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Task is assigned to ${activeAssignment.agent_id}, not ${agentId}`,
      },
    };
  }

  // Check for active dispatch packet
  // For v0, use claimed_at as assignment_id proxy
  const existingPacket = store.getActiveDispatchPacketForAssignment(activeAssignment.claimed_at);
  if (existingPacket) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Task already picked up at ${existingPacket.picked_up_at}. Lease expires at ${existingPacket.lease_expires_at}`,
      },
    };
  }

  // Check task status
  const lifecycle = store.getLifecycle(taskFile.taskId);
  const status = lifecycle?.status ?? 'opened';
  if (status !== 'claimed' && status !== 'needs_continuation') {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Task status is ${status}, not claimable` },
    };
  }

  // Check dependencies
  const { frontMatter } = await readTaskFile(taskFile.path);
  const dependsOn = frontMatter.depends_on as number[] | undefined;
  const { blockedBy, details } = await checkDependencies(cwd, dependsOn, store);
  if (blockedBy.length > 0) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Blocked by unmet dependencies: ${blockedBy.join(', ')}`,
        details,
      },
    };
  }

  // Resolve principal session binding for targeting
  let targetSessionId: string | null = null;
  let targetSessionTitle: string | null = null;
  try {
    const stateDir = resolvePrincipalStateDir({ cwd });
    const bindingRegistry = new JsonPrincipalSessionBindingRegistry({ rootDir: stateDir });
    await bindingRegistry.init();
    const binding = bindingRegistry.resolve(agentId);
    if (binding) {
      targetSessionId = binding.session_id;
      targetSessionTitle = binding.session_title;
    }
  } catch {
    // Binding registry is advisory; missing or unreadable bindings are OK.
    // Dispatch falls back to --continue or fresh session at execution time.
  }

  // Create dispatch packet
  const packet: DispatchPacketRow = {
    packet_id: makePacketId(taskFile.taskId, activeAssignment.claimed_at, 1),
    task_id: taskFile.taskId,
    assignment_id: activeAssignment.claimed_at,
    agent_id: agentId,
    picked_up_at: nowIso(),
    lease_expires_at: leaseExpiryIso(DEFAULT_LEASE_MINUTES),
    heartbeat_at: null,
    dispatch_status: 'picked_up',
    sequence: 1,
    created_by: 'agent_pickup',
    target_session_id: targetSessionId,
    target_session_title: targetSessionTitle,
  };

  store.insertDispatchPacket(packet);

  const targetingInfo = targetSessionId
    ? { target_session_id: targetSessionId, target_session_title: targetSessionTitle }
    : { target_session_id: null, target_session_title: null };

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        packet_id: packet.packet_id,
        task_id: taskFile.taskId,
        task_number: taskNumber,
        picked_up_at: packet.picked_up_at,
        lease_expires_at: packet.lease_expires_at,
        ...targetingInfo,
      },
    };
  }

  fmt.message(`Picked up task ${taskFile.taskId}`, 'success');
  fmt.kv('Packet ID', packet.packet_id);
  fmt.kv('Lease expires', packet.lease_expires_at);
  if (targetSessionId) {
    fmt.kv('Target session', targetSessionTitle ? `${targetSessionTitle} (${targetSessionId})` : targetSessionId);
  }

  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      packet_id: packet.packet_id,
      task_id: taskFile.taskId,
      task_number: taskNumber,
      picked_up_at: packet.picked_up_at,
      lease_expires_at: packet.lease_expires_at,
      ...targetingInfo,
    },
  };
}

async function doStatus(
  options: TaskDispatchOptions,
  store: TaskLifecycleStore,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const taskNumber = options.taskNumber;

  if (!taskNumber) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: 'Task number is required' },
    };
  }

  const taskFile = await findTaskFile(cwd, taskNumber);
  if (!taskFile) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: `Task not found: ${taskNumber}` },
    };
  }

  const packets = store.getDispatchPacketsForTask(taskFile.taskId);
  const lifecycle = store.getLifecycle(taskFile.taskId);

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        task_id: taskFile.taskId,
        task_status: lifecycle?.status ?? null,
        packets,
      },
    };
  }

  fmt.message(`Dispatch Status for ${taskFile.taskId}`, 'info');
  fmt.kv('Task status', lifecycle?.status ?? 'unknown');
  fmt.message('');

  if (packets.length === 0) {
    fmt.message('No dispatch packets.', 'info');
  } else {
    for (const p of packets) {
      const expired = new Date(p.lease_expires_at) < new Date() && p.dispatch_status === 'picked_up';
      const status = expired ? 'expired (lease lapsed)' : p.dispatch_status;
      fmt.message(`  ${p.packet_id}`);
      fmt.message(`    Agent: ${p.agent_id}  Status: ${status}`);
      fmt.message(`    Picked up: ${p.picked_up_at}`);
      fmt.message(`    Lease expires: ${p.lease_expires_at}`);
      if (p.heartbeat_at) {
        fmt.message(`    Last heartbeat: ${p.heartbeat_at}`);
      }
      if (p.target_session_id) {
        const sessionLabel = p.target_session_title
          ? `${p.target_session_title} (${p.target_session_id})`
          : p.target_session_id;
        fmt.message(`    Target session: ${sessionLabel}`);
      }
    }
  }

  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      task_id: taskFile.taskId,
      task_status: lifecycle?.status ?? null,
      packets,
    },
  };
}

async function doStart(
  options: TaskDispatchOptions,
  store: TaskLifecycleStore,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const agentId = options.agent;
  const shouldExec = options.exec ?? false;

  if (!agentId) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: '--agent is required' },
    };
  }

  // Find active packet for this agent
  const packets = store.getDispatchPacketsForAgent(agentId);
  const activePacket = packets.find(
    (p) => p.dispatch_status === 'picked_up' || p.dispatch_status === 'renewed',
  );

  if (!activePacket) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `No active pickup found for ${agentId}` },
    };
  }

  // Check lease expiry
  const leaseExpired = new Date(activePacket.lease_expires_at) < new Date();
  if (leaseExpired) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'error',
        error: `Pickup lease expired at ${activePacket.lease_expires_at}. Heartbeat or re-pickup required.`,
      },
    };
  }

  // Read task context
  const taskFile = await findTaskFile(cwd, activePacket.task_id);
  if (!taskFile) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Task file not found: ${activePacket.task_id}` },
    };
  }

  const { frontMatter, body } = await readTaskFile(taskFile.path);
  const titleMatch = body.match(/^# Task \d+:\s*(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : 'Untitled';
  const goalMatch = body.match(/## Goal\s*\n([^#]+)/);
  const goal = goalMatch ? goalMatch[1].trim() : '';

  // Transition packet to executing
  store.updateDispatchStatus(activePacket.packet_id, 'executing');

  const executionContext = {
    packet_id: activePacket.packet_id,
    task_id: activePacket.task_id,
    task_title: title,
    task_goal: goal,
    agent_id: agentId,
    target_session_id: activePacket.target_session_id,
    target_session_title: activePacket.target_session_title,
    work_dir: cwd,
    picked_up_at: activePacket.picked_up_at,
    lease_expires_at: activePacket.lease_expires_at,
  };

  // Build recommended kimi-cli command
  const kimiArgs: string[] = ['kimi'];
  if (activePacket.target_session_id) {
    kimiArgs.push('--session', activePacket.target_session_id);
  } else {
    kimiArgs.push('--continue');
  }
  kimiArgs.push('--work-dir', cwd);

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        action: shouldExec ? 'executed' : 'ready',
        ...executionContext,
        recommended_command: kimiArgs.join(' '),
      },
    };
  }

  fmt.message(`Execution start for ${agentId}`, 'info');
  fmt.kv('Task', `${title} (${activePacket.task_id})`);
  fmt.kv('Packet', activePacket.packet_id);
  if (activePacket.target_session_id) {
    const sessionLabel = activePacket.target_session_title
      ? `${activePacket.target_session_title} (${activePacket.target_session_id})`
      : activePacket.target_session_id;
    fmt.kv('Target session', sessionLabel);
  } else {
    fmt.kv('Target session', '--continue (no binding)');
  }
  fmt.message('');
  fmt.message('Recommended command:', 'info');
  fmt.message(`  ${kimiArgs.join(' ')}`);

  if (!shouldExec) {
    fmt.message('');
    fmt.message('Use --exec to actually spawn the session.', 'warning');
  }

  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      action: shouldExec ? 'executed' : 'ready',
      ...executionContext,
      recommended_command: kimiArgs.join(' '),
    },
  };
}

export async function taskDispatchCommand(
  options: TaskDispatchOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const store = options.store;
  if (!store) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: 'Dispatch requires a task lifecycle store' },
    };
  }

  switch (options.action) {
    case 'queue':
      return doQueue(options, store);
    case 'pickup':
      return doPickup(options, store);
    case 'status':
      return doStatus(options, store);
    case 'start':
      return doStart(options, store);
    default:
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: `Unknown dispatch action: ${options.action}` },
      };
  }
}
