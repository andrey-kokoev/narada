import { resolve } from 'node:path';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import { scanTasksByRange } from '../lib/task-governance.js';
import { taskClaimCommand } from './task-claim.js';
import { taskFinishCommand } from './task-finish.js';

export interface ChapterFinishRangeOptions {
  range: string;
  agent: string;
  summaryPrefix?: string;
  cwd?: string;
  format?: 'json' | 'human' | 'auto';
  force?: boolean;
  details?: boolean;
}

function parseRange(range: string): { start: number; end: number } {
  const match = range.match(/^(\d+)-(\d+)$/);
  if (!match) throw new Error('range must use start-end format');
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) {
    throw new Error('range must be ascending positive integers');
  }
  return { start, end };
}

export async function chapterFinishRangeCommand(
  options: ChapterFinishRangeOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  if (!options.agent) {
    return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: '--agent is required' } };
  }

  let range: { start: number; end: number };
  try {
    range = parseRange(options.range);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: msg } };
  }

  const tasks = await scanTasksByRange(cwd, range.start, range.end);
  const results: Array<Record<string, unknown>> = [];
  for (const task of tasks) {
    if (task.taskNumber === null) continue;
    if (task.status === 'closed' || task.status === 'confirmed') {
      results.push({ task_number: task.taskNumber, action: 'skipped', reason: `already ${task.status}` });
      continue;
    }

    if (task.status === 'opened') {
      const claim = await taskClaimCommand({
        taskNumber: String(task.taskNumber),
        agent: options.agent,
        cwd,
        format: 'json',
      });
      if (claim.exitCode !== ExitCode.SUCCESS) {
        results.push({ task_number: task.taskNumber, action: 'claim_failed', result: claim.result });
        if (!options.force) break;
        continue;
      }
    }

    const finish = await taskFinishCommand({
      taskNumber: String(task.taskNumber),
      agent: options.agent,
      summary: `${options.summaryPrefix ?? 'Completed chapter task'} ${task.taskNumber}.`,
      proveCriteria: true,
      close: true,
      cwd,
      format: 'json',
    });
    results.push({
      task_number: task.taskNumber,
      action: finish.exitCode === ExitCode.SUCCESS ? 'finished' : 'finish_failed',
      result: finish.result,
    });
    if (finish.exitCode !== ExitCode.SUCCESS && !options.force) break;
  }

  const failures = results.filter((result) => String(result.action).endsWith('_failed'));
  const compactTasks = results.map((result) => {
    const finish = result.result as Record<string, unknown> | undefined;
    return {
      task_number: result.task_number,
      action: result.action,
      close_action: finish?.close_action,
      evidence_verdict: finish?.evidence_verdict,
      failure: String(result.action).endsWith('_failed') ? finish : undefined,
    };
  });
  const output = {
    status: failures.length === 0 ? 'success' : 'error',
    range,
    agent: options.agent,
    count: results.length,
    failures: failures.length,
    tasks: compactTasks,
    ...(options.details ? { results } : {}),
  };

  if (fmt.getFormat() !== 'json') {
    fmt.message(`Chapter finish-range ${options.range}: ${output.status}`, failures.length === 0 ? 'success' : 'error');
    fmt.kv('Tasks processed', String(results.length));
    fmt.kv('Failures', String(failures.length));
  }

  return {
    exitCode: failures.length === 0 ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
    result: output,
  };
}
