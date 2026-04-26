import type { Command } from 'commander';
import { taskDispatchCommand } from './task-dispatch.js';
import { resourceScopedDirectCommandAction } from '../lib/command-wrapper.js';
import { emitCommandResult } from '../lib/cli-output.js';
import {
  openTaskLifecycleStore,
  type SqliteTaskLifecycleStore,
} from '../lib/task-lifecycle-store.js';

function closeStore(store: SqliteTaskLifecycleStore): void {
  store.db.close();
}

export function registerTaskDispatchCommands(taskCmd: Command): void {
  taskCmd
    .command('dispatch <action>')
    .description('Dispatch surface: queue, pickup, status, start')
    .option('--task-number <num>', 'Task number (for pickup/status)')
    .option('--agent <id>', 'Agent ID')
    .option('--exec', 'Actually spawn the execution session (start action only)')
    .option('--format <fmt>', 'Output format: json or human', 'human')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(resourceScopedDirectCommandAction<SqliteTaskLifecycleStore, [string, Record<string, unknown>]>({
      command: 'task dispatch',
      emit: emitCommandResult,
      format: (_action: string, opts: Record<string, unknown>) => opts.format,
      open: (_action, opts) => openTaskLifecycleStore((opts.cwd as string | undefined) || process.cwd()),
      close: closeStore,
      invocation: (store, action, opts) => taskDispatchCommand({
        action: action as 'queue' | 'pickup' | 'status' | 'start',
        taskNumber: opts.taskNumber as string | undefined,
        agent: opts.agent as string | undefined,
        exec: opts.exec as boolean | undefined,
        cwd: opts.cwd as string | undefined,
        format: (opts.format as 'json' | 'human' | 'auto') || process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
        store,
      }),
    }));
}
