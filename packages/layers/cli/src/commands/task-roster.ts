/**
 * Task roster operator.
 *
 * Observation/tracking: shows and updates agent operational roster state.
 * Does NOT mutate task lifecycle (claim/release/review) or assignment records.
 */

import { resolve } from 'node:path';
import {
  loadRoster,
  updateAgentRosterEntry,
  formatRoster,
  type AgentRoster,
} from '../lib/task-governance.js';
import { ExitCode } from '../lib/exit-codes.js';

export interface TaskRosterOptions {
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
}

export interface TaskRosterAssignOptions extends TaskRosterOptions {
  taskNumber: string;
  agent: string;
}

export interface TaskRosterAgentOptions extends TaskRosterOptions {
  agent: string;
}

export async function taskRosterShowCommand(
  options: TaskRosterOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const format = options.format === 'json' ? 'json' : 'human';

  let roster: AgentRoster;
  try {
    roster = await loadRoster(cwd);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Failed to load roster: ${msg}` },
    };
  }

  const output = formatRoster(roster, format);
  return {
    exitCode: ExitCode.SUCCESS,
    result: format === 'json' ? roster : output,
  };
}

export async function taskRosterAssignCommand(
  options: TaskRosterAssignOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const taskNumber = Number(options.taskNumber);
  if (!Number.isFinite(taskNumber)) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: 'Invalid task number' },
    };
  }

  try {
    const roster = await updateAgentRosterEntry(cwd, options.agent, {
      status: 'working',
      task: taskNumber,
    });
    return {
      exitCode: ExitCode.SUCCESS,
      result: { status: 'ok', agent: options.agent, agent_status: 'working', task: taskNumber, roster },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: msg },
    };
  }
}

export async function taskRosterReviewCommand(
  options: TaskRosterAssignOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const taskNumber = Number(options.taskNumber);
  if (!Number.isFinite(taskNumber)) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: 'Invalid task number' },
    };
  }

  try {
    const roster = await updateAgentRosterEntry(cwd, options.agent, {
      status: 'reviewing',
      task: taskNumber,
    });
    return {
      exitCode: ExitCode.SUCCESS,
      result: { status: 'ok', agent: options.agent, agent_status: 'reviewing', task: taskNumber, roster },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: msg },
    };
  }
}

export async function taskRosterDoneCommand(
  options: TaskRosterAssignOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const taskNumber = Number(options.taskNumber);
  if (!Number.isFinite(taskNumber)) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: 'Invalid task number' },
    };
  }

  try {
    const roster = await updateAgentRosterEntry(cwd, options.agent, {
      status: 'done',
      task: null,
      last_done: taskNumber,
    });
    return {
      exitCode: ExitCode.SUCCESS,
      result: { status: 'ok', agent: options.agent, agent_status: 'done', last_done: taskNumber, roster },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: msg },
    };
  }
}

export async function taskRosterIdleCommand(
  options: TaskRosterAgentOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();

  try {
    const roster = await updateAgentRosterEntry(cwd, options.agent, {
      status: 'idle',
      task: null,
    });
    return {
      exitCode: ExitCode.SUCCESS,
      result: { status: 'ok', agent: options.agent, agent_status: 'idle', roster },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: msg },
    };
  }
}
