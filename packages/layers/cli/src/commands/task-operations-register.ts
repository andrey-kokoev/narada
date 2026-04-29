import type { Command } from 'commander';
import { taskRecommendCommand } from './task-recommend.js';
import { taskDeriveFromFindingCommand } from './task-derive-from-finding.js';
import { taskLintCommand } from './task-lint.js';
import { taskListCommand } from './task-list.js';
import { taskGraphCommand } from './task-graph.js';
import { taskHandoffCommand } from './task-handoff.js';
import { taskSearchCommand } from './task-search.js';
import { taskReadCommand } from './task-read.js';
import {
  taskPeekNextCommand,
  taskPullNextCommand,
  taskWorkNextCommand,
} from './task-next.js';
import { taskWorkboardCommand } from './task-workboard.js';
import { directCommandAction, runDirectCommand } from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';

function outputFormat(format?: unknown): 'json' | 'human' | 'auto' {
  return (format as 'json' | 'human' | 'auto') || process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto';
}

export function registerTaskOperationsCommands(taskCmd: Command): void {
  taskCmd
    .command('recommend')
    .description('Recommend task/agent assignments (advisory, read-only)')
    .option('--agent <id>', 'Restrict to a specific agent')
    .option('--task <number>', 'Recommend for a specific task only')
    .option('--limit <n>', 'Maximum recommendations to show', '10')
    .option('--ignore-posture', 'Disable CCC posture score adjustments', false)
    .option('--abstained-limit <n>', 'Maximum abstained diagnostics to return by default')
    .option('--full', 'Return full abstention diagnostics', false)
    .option('--format <fmt>', 'Output format: json or human')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('-v, --verbose', 'Show accepted-learning guidance and expanded rationale', false)
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'task recommend',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => taskRecommendCommand({
        taskNumber: opts.task as string | undefined,
        agent: opts.agent as string | undefined,
        limit: opts.limit ? Number(opts.limit) : undefined,
        ignorePosture: opts.ignorePosture as boolean | undefined,
        full: opts.full as boolean | undefined,
        abstainedLimit: opts.abstainedLimit ? Number(opts.abstainedLimit) : undefined,
        cwd: opts.cwd as string | undefined,
        format: outputFormat(opts.format),
        verbose: opts.verbose as boolean | undefined,
      }),
    }));

  taskCmd
    .command('derive-from-finding <finding-id>')
    .description('Derive a corrective task from a review finding')
    .requiredOption('--review <review-id>', 'Review ID containing the finding')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(async (findingId: string, opts: Record<string, unknown>) => {
      await runDirectCommand({
        command: 'task derive-from-finding',
        emit: emitCommandResult,
        invocation: () => taskDeriveFromFindingCommand({
          findingId,
          review: opts.review as string,
          cwd: opts.cwd as string | undefined,
          format: resolveCommandFormat(),
        }),
      });
    });

  taskCmd
    .command('lint')
    .description('Lint task files for structural issues (pure tool)')
    .option('--chapter <range>', 'Lint only tasks in a chapter range (e.g. 100-110)')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(async (opts: Record<string, unknown>) => {
      await runDirectCommand({
        command: 'task lint',
        emit: emitCommandResult,
        invocation: () => taskLintCommand({
          cwd: opts.cwd as string | undefined,
          format: resolveCommandFormat(),
          chapter: opts.chapter as string | undefined,
        }),
      });
    });

  taskCmd
    .command('list')
    .description('List runnable tasks sorted by continuation affinity (bounded by default)')
    .option('--range <start-end>', 'Filter tasks to a number range (e.g. 501-999)')
    .option('--limit <n>', 'Maximum tasks to return (default: 20)', (value) => Number.parseInt(value, 10))
    .option('--all', 'Explicitly admit full task-list output')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(async (opts: Record<string, unknown>) => {
      await runDirectCommand({
        command: 'task list',
        emit: emitCommandResult,
        invocation: () => taskListCommand({
          cwd: opts.cwd as string | undefined,
          format: resolveCommandFormat(),
          range: opts.range as string | undefined,
          limit: opts.limit as number | undefined,
          all: opts.all as boolean | undefined,
        }),
      });
    });

  taskCmd
    .command('search <query>')
    .description('Search task files by content (front matter + body)')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(async (query: string, opts: Record<string, unknown>) => {
      await runDirectCommand({
        command: 'task search',
        emit: emitCommandResult,
        format: opts.format,
        invocation: () => taskSearchCommand({
          query,
          cwd: opts.cwd as string | undefined,
          format: resolveCommandFormat(opts.format, 'human'),
        }),
      });
    });

  taskCmd
    .command('read <task-number>')
    .description('Read a single task - canonical observation operator')
    .option('--format <fmt>', 'Output format: json or human', 'human')
    .option('--verbose', 'Show full sections (human mode only)', false)
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(async (taskNumber: string, opts: Record<string, unknown>) => {
      await runDirectCommand({
        command: 'task read',
        emit: emitCommandResult,
        format: opts.format,
        invocation: () => taskReadCommand({
          taskNumber,
          format: resolveCommandFormat(opts.format, 'human'),
          verbose: opts.verbose as boolean | undefined,
          cwd: opts.cwd as string | undefined,
        }),
      });
    });

  taskCmd
    .command('graph')
    .description('Render the task graph as Mermaid (read-only inspection)')
    .option('--format <format>', 'Output format: mermaid, json, or auto', 'auto')
    .option('--range <start-end>', 'Filter tasks to a number range (e.g. 429-454)')
    .option('--status <csv>', 'Filter by status (comma-separated)')
    .option('--include-closed', 'Include closed/confirmed tasks', false)
    .option('--full', 'Print full graph output instead of bounded artifact pointer', false)
    .option('--view', 'Create HTML render artifacts and open browser', false)
    .option('--open', 'Open browser after creating artifacts (default true with --view)', true)
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(async (opts: Record<string, unknown>) => {
      await runDirectCommand({
        command: 'task graph',
        emit: emitCommandResult,
        format: opts.format,
        invocation: () => taskGraphCommand({
          cwd: opts.cwd as string | undefined,
          format: opts.format as 'mermaid' | 'json' | 'auto' | undefined,
          range: opts.range as string | undefined,
          status: opts.status as string | undefined,
          includeClosed: opts.includeClosed as boolean | undefined,
          full: opts.full as boolean | undefined,
          bounded: true,
          view: opts.view as boolean | undefined,
          open: opts.open as boolean | undefined,
        }),
      });
    });

  taskCmd
    .command('handoff <task-number>')
    .description('Emit a bounded Builder handoff packet for a task')
    .option('--format <fmt>', 'Output format: json or human', 'human')
    .option('--artifact', 'Write durable handoff artifact under .ai/handoffs', false)
    .option('--artifact-path <path>', 'Write durable handoff artifact to a specific path')
    .option('--route-inbox', 'Route handoff packet into Canonical Inbox as an observation', false)
    .option('--by <principal>', 'Principal generating the handoff packet')
    .option('--target-locus <locus>', 'Message routing authority target locus for --route-inbox; defaults to local_site')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(async (taskNumber: string, opts: Record<string, unknown>) => {
      await runDirectCommand({
        command: 'task handoff',
        emit: emitCommandResult,
        format: opts.format,
        invocation: () => taskHandoffCommand({
          taskNumber,
          cwd: opts.cwd as string | undefined,
          format: outputFormat(opts.format),
          artifact: opts.artifact as boolean | undefined,
          artifactPath: opts.artifactPath as string | undefined,
          routeInbox: opts.routeInbox as boolean | undefined,
          by: opts.by as string | undefined,
          targetLocus: opts.targetLocus as string | undefined,
        }),
      });
    });

  taskCmd
    .command('peek-next')
    .description('Non-mutating next-task inspection for an agent')
    .requiredOption('--agent <id>', 'Agent ID')
    .option('--format <fmt>', 'Output format: json or human', 'human')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'task peek-next',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => taskPeekNextCommand({
        agent: opts.agent as string,
        format: outputFormat(opts.format),
        cwd: opts.cwd as string | undefined,
      }),
    }));

  taskCmd
    .command('pull-next')
    .description('Mutating next-task pull: claim the best admissible task')
    .requiredOption('--agent <id>', 'Agent ID')
    .option('--format <fmt>', 'Output format: json or human', 'human')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'task pull-next',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => taskPullNextCommand({
        agent: opts.agent as string,
        format: outputFormat(opts.format),
        cwd: opts.cwd as string | undefined,
      }),
    }));

  taskCmd
    .command('workboard')
    .description('Show bounded current work, review handoff, inbox, and concurrency posture')
    .option('--limit <n>', 'Maximum rows per section', '20')
    .option('--format <fmt>', 'Output format: json or human', 'human')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'task workboard',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => taskWorkboardCommand({
        cwd: opts.cwd as string | undefined,
        limit: opts.limit ? Number(opts.limit) : undefined,
        format: outputFormat(opts.format),
      }),
    }));

  taskCmd
    .command('work-next')
    .description('Execution packet for current task, or pull-next then packet')
    .requiredOption('--agent <id>', 'Agent ID')
    .option('--format <fmt>', 'Output format: json or human', 'human')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'task work-next',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => taskWorkNextCommand({
        agent: opts.agent as string,
        format: outputFormat(opts.format),
        cwd: opts.cwd as string | undefined,
      }),
    }));
}
