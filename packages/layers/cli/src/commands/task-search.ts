/**
 * Task search operator.
 *
 * Inspection adapter for full-text task search.
 */

import { resolve } from 'node:path';
import { searchTasksService } from '@narada2/task-governance/task-search-service';
import { ExitCode } from '../lib/exit-codes.js';
import { attachFormattedOutput } from '../lib/cli-output.js';

export interface TaskSearchOptions {
  query: string;
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
}

export async function taskSearchCommand(
  options: TaskSearchOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const format = options.format || 'auto';
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const service = await searchTasksService({ query: options.query, cwd });

  if (format === 'json') {
    return {
      exitCode: service.exitCode as unknown as ExitCode,
      result: service.result,
    };
  }

  if (service.result.status === 'error') {
    return {
      exitCode: service.exitCode as unknown as ExitCode,
      result: attachFormattedOutput(
        service.result,
        service.result.error ?? 'Task search failed',
        'human',
      ),
    };
  }

  const query = service.result.query ?? options.query.trim();
  const results = service.result.results ?? [];
  if (results.length === 0) {
    return {
      exitCode: service.exitCode as unknown as ExitCode,
      result: attachFormattedOutput(service.result, `No tasks match "${query}"`, 'human'),
    };
  }

  const lines = [
    `Task Search Results for "${query}" (${results.length})`,
    '─'.repeat(`Task Search Results for "${query}" (${results.length})`.length),
  ];
  for (const r of results) {
    const numStr = r.task_number !== null ? `#${r.task_number}` : r.task_id;
    const statusStr = r.status ? `[${r.status}]` : '';
    lines.push('', `${numStr} ${statusStr} ${r.title ?? ''}`);
    for (const snippet of r.matches) {
      lines.push(`  ${snippet}`);
    }
  }

  return {
    exitCode: service.exitCode as unknown as ExitCode,
    result: attachFormattedOutput(service.result, lines.join('\n'), 'human'),
  };
}
