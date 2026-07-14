import type { Command } from 'commander';
import { historyCaptureCommand, historyConfigureCommand, historyDiffCommand, historyEnableCommand, historyForgetCommand, historyListCommand, historyPinCommand, historyRestoreCommand, historyShowCommand, historyStartCommand, historyStatusCommand, historyStopCommand } from './history.js';
import {directCommandAction, type CommanderOptionValues} from '../lib/command-wrapper.js';
import { emitCommandResult } from '../lib/cli-output.js';

function collect(value: string, values: string[]): string[] {
  values.push(value);
  return values;
}

function normalizeOptions(options: CommanderOptionValues): CommanderOptionValues {
  return {
    ...options,
    watchRoots: options.watchRoots ?? options.watchRoot,
    exclusions: options.exclusions ?? options.exclude,
    pinned: options.unpin ? false : true,
  };
}

export function registerHistoryCommands(program: Command): void {
  const history = program.command('history').description('Site-owned local work history');
  addTargetOptions(history);

  historySubcommand(history, 'status').description('Show policy, watcher, store, and retention status').option('--user-projection-root <path>', 'Write a metadata-only projection to a User Site').option('--format <fmt>', 'Output format: json|human|auto', 'auto').action(action('history status', historyStatusCommand));
  const enable = historySubcommand(history, 'enable').description('Opt a Site or explicitly unregistered User root into local history');
  addPolicyOptions(enable).action(action('history enable', historyEnableCommand));
  const configure = historySubcommand(history, 'configure').description('Update Site-owned local-history policy without changing enabled state');
  addPolicyOptions(configure).action(action('history configure', historyConfigureCommand));
  historySubcommand(history, 'start').description('Run the separately supervised local-history process').option('--background', 'Detach the process and return its PID', false).option('--once', 'Scan once and exit', false).option('--poll-interval-ms <ms>', 'Polling interval', parseNumber).option('--format <fmt>', 'Output format: json|human|auto', 'auto').action(action('history start', historyStartCommand));
  historySubcommand(history, 'stop').description('Request graceful stop of the Site history process').option('--format <fmt>', 'Output format: json|human|auto', 'auto').action(action('history stop', historyStopCommand));
  historySubcommand(history, 'capture <path>').description('Capture one admitted file').option('--format <fmt>', 'Output format: json|human|auto', 'auto').action(actionWithPath('history capture', historyCaptureCommand));
  historySubcommand(history, 'list').description('List files and their immutable snapshots').option('--path <path>', 'Restrict to a path prefix').option('--user-projection-root <path>', 'Write a metadata-only projection to a User Site').option('--format <fmt>', 'Output format: json|human|auto', 'auto').action(action('history list', historyListCommand));
  historySubcommand(history, 'show <snapshot>').description('Show snapshot metadata').option('--format <fmt>', 'Output format: json|human|auto', 'auto').action(actionWithSnapshot('history show', historyShowCommand));
  historySubcommand(history, 'diff').description('Compare two immutable snapshots').requiredOption('--from <snapshot>', 'Earlier snapshot id').requiredOption('--to <snapshot>', 'Later snapshot id').option('--format <fmt>', 'Output format: json|human|auto', 'auto').action(action('history diff', historyDiffCommand));
  historySubcommand(history, 'pin <snapshot>').description('Pin or unpin a snapshot against retention').option('--unpin', 'Remove the pin', false).option('--format <fmt>', 'Output format: json|human|auto', 'auto').action(actionWithSnapshot('history pin', historyPinCommand));
  historySubcommand(history, 'forget <snapshot>').description('Forget an unpinned snapshot and eligible blob').option('--format <fmt>', 'Output format: json|human|auto', 'auto').action(actionWithSnapshot('history forget', historyForgetCommand));
  historySubcommand(history, 'restore <snapshot>').description('Restore through the owning Site boundary').option('--confirm', 'Confirm the restore operation', false).option('--force', 'Allow overwrite when the target is stale', false).option('--format <fmt>', 'Output format: json|human|auto', 'auto').action(actionWithSnapshot('history restore', historyRestoreCommand));
}

function addTargetOptions(command: Command): void {
  command.option('--site-root <path>', 'Owning Site workspace or .narada root').option('--site-id <id>', 'Owning Site id').option('--user-site-root <path>', 'User Site root for an explicitly unregistered workspace').option('--root <path>', 'Explicitly unregistered workspace root');
}

function addPolicyOptions(command: Command): Command {
  return command
    .option('--watch-root <path>', 'Admitted workspace-relative root (repeatable)', collect, [])
    .option('--exclude <pattern>', 'Exclusion pattern (repeatable)', collect, [])
    .option('--replace-exclusions', 'Replace configured additional exclusions; posture baseline remains', false)
    .option('--max-file-size <bytes>', 'Maximum captured file size', parseNumber)
    .option('--retention-days <days>', 'Snapshot retention period', parseNumber)
    .option('--quota-bytes <bytes>', 'Snapshot quota', parseNumber)
    .option('--debounce-ms <ms>', 'Stable-save debounce interval', parseNumber)
    .option('--stable-read-attempts <count>', 'Stable-read attempts per capture', parseNumber)
    .option('--stable-read-delay-ms <ms>', 'Delay between stable-read attempts', parseNumber)
    .option('--privacy-posture <posture>', 'default_exclusions or custom_exclusions')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto');
}

function historySubcommand(parent: Command, definition: string): Command {
  const command = parent.command(definition);
  addTargetOptions(command);
  return command;
}

function action(command: string, handler: (options: CommanderOptionValues, context: never) => Promise<{ exitCode: number; result: unknown }>) {
  return directCommandAction<[CommanderOptionValues]>({
    command,
    emit: emitCommandResult,
    format: (options: CommanderOptionValues) => options.format,
    invocation: (options) => handler(normalizeOptions(options), undefined as never),
  });
}

function actionWithPath(command: string, handler: (options: CommanderOptionValues, context: never) => Promise<{ exitCode: number; result: unknown }>) {
  return directCommandAction<[string, CommanderOptionValues]>({
    command,
    emit: emitCommandResult,
    format: (options: CommanderOptionValues) => options.format,
    invocation: (path, options) => handler({ ...normalizeOptions(options), path }, undefined as never),
  });
}

function actionWithSnapshot(command: string, handler: (options: CommanderOptionValues, context: never) => Promise<{ exitCode: number; result: unknown }>) {
  return directCommandAction<[string, CommanderOptionValues]>({
    command,
    emit: emitCommandResult,
    format: (options: CommanderOptionValues) => options.format,
    invocation: (snapshot, options) => handler({ ...normalizeOptions(options), snapshot }, undefined as never),
  });
}

function parseNumber(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`invalid_integer: ${value}`);
  return parsed;
}
