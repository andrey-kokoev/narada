import type { Command } from 'commander';
import {
  taskEvidenceAdmitCommand,
  taskEvidenceCommand,
  taskEvidenceProveCriteriaCommand,
} from './task-evidence.js';
import {
  taskEvidenceAssertCompleteCommand,
  taskEvidenceListCommand,
} from './task-evidence-list.js';
import { directCommandAction } from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';

export function registerTaskEvidenceCommands(taskCmd: Command): void {
  const evidenceCmd = taskCmd
    .command('evidence')
    .description('Task evidence operators (inspect, admit, prove-criteria, list)');

  evidenceCmd
    .command('inspect <task-number>')
    .description('Inspect task completion evidence (task-authority read-only; may admit observation output)')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'task evidence inspect',
      emit: emitCommandResult,
      invocation: (taskNumber, opts) => taskEvidenceCommand({
        taskNumber,
        cwd: opts.cwd as string | undefined,
        format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
      }),
    }));

  evidenceCmd
    .command('list')
    .description('List tasks by completion evidence (task-authority read-only; writes bounded observation artifact)')
    .option('--verdict <csv>', 'Filter by verdict (comma-separated: complete,attempt_complete,needs_review,needs_closure,incomplete,unknown)')
    .option('--status <csv>', 'Filter by front-matter status (comma-separated)')
    .option('--range <start-end>', 'Filter tasks to a number range (e.g. 480-490)')
    .option('--limit <n>', 'Maximum tasks to return/show without --full', '25')
    .option('--full', 'Return the complete list (explicitly opt into unbounded output)', false)
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'task evidence list',
      emit: emitCommandResult,
      invocation: (opts) => taskEvidenceListCommand({
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(),
        verdict: opts.verdict as string | undefined,
        status: opts.status as string | undefined,
        range: opts.range as string | undefined,
        limit: opts.limit as string | undefined,
        full: opts.full === true,
      }),
    }));

  evidenceCmd
    .command('assert-complete <range>')
    .description('Fail unless every task in a numeric range is evidence-complete')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'task evidence assert-complete',
      emit: emitCommandResult,
      format: () => resolveCommandFormat(undefined, 'human'),
      invocation: (range, opts) => {
        const format = resolveCommandFormat(undefined, 'human');
        return taskEvidenceAssertCompleteCommand({
          range,
          cwd: opts.cwd as string | undefined,
          format,
        });
      },
    }));

  evidenceCmd
    .command('prove-criteria <task-number>')
    .description('Prove acceptance criteria completion through Evidence Admission')
    .requiredOption('--by <id>', 'Operator or agent ID proving criteria')
    .option('--verification-run <id>', 'Verification run ID supporting this criteria proof')
    .option('--no-run-rationale <text>', 'Explicit rationale when criteria proof has no verification run binding')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'task evidence prove-criteria',
      emit: emitCommandResult,
      format: (_taskNumber: string, opts: Record<string, unknown>) => opts.format,
      invocation: (taskNumber, opts) => taskEvidenceProveCriteriaCommand({
        taskNumber,
        by: opts.by as string,
        verificationRunId: opts.verificationRun as string | undefined,
        noRunRationale: opts.noRunRationale as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  evidenceCmd
    .command('admit <task-number>')
    .description('Admit task evidence for lifecycle transition consumption')
    .requiredOption('--by <id>', 'Operator or agent ID admitting evidence')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'task evidence admit',
      emit: emitCommandResult,
      format: (_taskNumber: string, opts: Record<string, unknown>) => opts.format,
      invocation: (taskNumber, opts) => taskEvidenceAdmitCommand({
        taskNumber,
        by: opts.by as string,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  evidenceCmd
    .argument('[task-number]', 'Task number to inspect (backward compatibility; prefer `inspect`)')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[string | undefined, Record<string, unknown>]>({
      command: 'task evidence',
      emit: emitCommandResult,
      invocation: (taskNumber, opts) => {
        if (!taskNumber) {
          evidenceCmd.help();
        }
        return taskEvidenceCommand({
          taskNumber: taskNumber as string,
          cwd: opts.cwd as string | undefined,
          format: resolveCommandFormat(),
        });
      },
    }));
}
