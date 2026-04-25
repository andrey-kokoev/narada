/**
 * Task search operator.
 *
 * Inspection adapter for full-text task search.
 */

import { resolve } from 'node:path';
import { searchTasksService, type TaskSearchResult } from '@narada2/task-governance/task-search-service';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';

export interface TaskSearchOptions {
  query: string;
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
}

export async function taskSearchCommand(
  options: TaskSearchOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const service = await searchTasksService({ query: options.query, cwd });

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: service.exitCode as unknown as ExitCode,
      result: service.result,
    };
  }

  if (service.result.status === 'error') {
    fmt.message(service.result.error ?? 'Task search failed', 'error');
    return {
      exitCode: service.exitCode as unknown as ExitCode,
      result: service.result,
    };
  }

  const query = service.result.query ?? options.query.trim();
  const results = service.result.results ?? [];
  if (results.length === 0) {
    fmt.message(`No tasks match "${query}"`, 'info');
    return service;
  }

  fmt.section(`Task Search Results for "${query}" (${results.length})`);

  for (const r of results) {
    const numStr = r.task_number !== null ? `#${r.task_number}` : r.task_id;
    const statusStr = r.status ? `[${r.status}]` : '';
    console.log(`\n${numStr} ${statusStr} ${r.title ?? ''}`);
    for (const snippet of r.matches) {
      console.log(`  ${snippet}`);
    }
  }

  return {
    exitCode: service.exitCode as unknown as ExitCode,
    result: service.result,
  };
}
