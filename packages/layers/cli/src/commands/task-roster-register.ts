import type { Command } from 'commander';
import {
  taskRosterAddCommand,
  taskRosterAssignCommand,
  taskRosterDoneCommand,
  taskRosterIdleCommand,
  taskRosterReviewCommand,
  taskRosterShowCommand,
} from './task-roster.js';
import { directCommandAction } from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';

export function registerTaskRosterCommands(taskCmd: Command): void {
  const rosterCmd = taskCmd
    .command('roster')
    .description('Roster projection operators for agent operational state');

  rosterCmd
    .command('show')
    .description('Observe current agent roster projection')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('-v, --verbose', 'Show accepted-learning guidance and expanded rationale', false)
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'task roster show',
      emit: emitCommandResult,
      invocation: (opts) => taskRosterShowCommand({
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(),
        verbose: opts.verbose as boolean | undefined,
      }),
    }));

  rosterCmd
    .command('add <agent-id>')
    .description('Add an agent to the roster projection')
    .option('--role <role>', 'Agent role', 'implementer')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'task roster add',
      emit: emitCommandResult,
      invocation: (agentId, opts) => taskRosterAddCommand({
        agent: agentId,
        role: opts.role as string | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(),
      }),
    }));

  rosterCmd
    .command('assign <task-number>')
    .description('Roster + assignment admission: mark agent working and claim by default')
    .requiredOption('--agent <id>', 'Agent ID from roster')
    .option('--no-claim', 'Skip claiming the task (exceptional: only for planning)')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('-v, --verbose', 'Show accepted-learning guidance and expanded rationale', false)
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'task roster assign',
      emit: emitCommandResult,
      invocation: (taskNumber, opts) => taskRosterAssignCommand({
        taskNumber,
        agent: opts.agent as string,
        noClaim: opts.noClaim as boolean | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(),
        verbose: opts.verbose as boolean | undefined,
      }),
    }));

  rosterCmd
    .command('review <task-number>')
    .description('Roster projection: mark agent as reviewing a task')
    .requiredOption('--agent <id>', 'Agent ID from roster')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('-v, --verbose', 'Show accepted-learning guidance and expanded rationale', false)
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'task roster review',
      emit: emitCommandResult,
      invocation: (taskNumber, opts) => taskRosterReviewCommand({
        taskNumber,
        agent: opts.agent as string,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(),
        verbose: opts.verbose as boolean | undefined,
      }),
    }));

  rosterCmd
    .command('done <task-number>')
    .description('Mark agent done with a task')
    .requiredOption('--agent <id>', 'Agent ID from roster')
    .option('--strict', 'Fail if required evidence is missing (default behavior)', false)
    .option('--allow-incomplete', 'Record roster availability even when task evidence is missing', false)
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('-v, --verbose', 'Show accepted-learning guidance and expanded rationale', false)
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'task roster done',
      emit: emitCommandResult,
      invocation: (taskNumber, opts) => taskRosterDoneCommand({
        taskNumber,
        agent: opts.agent as string,
        strict: opts.strict as boolean | undefined,
        allowIncomplete: opts.allowIncomplete as boolean | undefined,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(),
        verbose: opts.verbose as boolean | undefined,
      }),
    }));

  rosterCmd
    .command('idle')
    .description('Mark agent as idle')
    .requiredOption('--agent <id>', 'Agent ID from roster')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('-v, --verbose', 'Show accepted-learning guidance and expanded rationale', false)
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'task roster idle',
      emit: emitCommandResult,
      invocation: (opts) => taskRosterIdleCommand({
        agent: opts.agent as string,
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(),
        verbose: opts.verbose as boolean | undefined,
      }),
    }));
}
