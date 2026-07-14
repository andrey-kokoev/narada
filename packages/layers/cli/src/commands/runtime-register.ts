import type { Command } from 'commander';
import {directCommandAction, silentCommandContext, type CommanderOptionValues} from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';
import {
  runtimeInstallWindowsStartupCommand,
  runtimeWindowsStartupStatusCommand,
} from './runtime-windows-startup.js';

export function registerRuntimeCommands(program: Command): void {
  const runtime = program
    .command('runtime')
    .description('Runtime installation and status operators');

  const windowsStartup = runtime
    .command('windows-startup')
    .description('Windows startup runtime planning and status');

  windowsStartup
    .command('install')
    .requiredOption('--site <site-root>', 'Target Site root')
    .requiredOption('--operation <operation-id>', 'Operation ID to run')
    .option('--mode <mode>', 'Runtime mode: separate-client-runtime or shared-user-site-runtime', 'separate-client-runtime')
    .option('--credential-ref <ref>', 'Credential reference used by the runtime; raw secrets are forbidden')
    .option('--defer', 'Record desired runtime posture as deferred Site-local evidence', false)
    .option('--execute', 'Attempt substrate mutation from the owning Windows runtime locus', false)
    .option('--by <principal>', 'Principal requesting or recording the runtime posture')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .description('Plan or defer Windows Task Scheduler startup for a Site operation')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'runtime windows-startup install',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => runtimeInstallWindowsStartupCommand({
        site: opts.site as string | undefined,
        operation: opts.operation as string | undefined,
        mode: opts.mode as 'separate-client-runtime' | 'shared-user-site-runtime' | undefined,
        credentialRef: opts.credentialRef as string | undefined,
        defer: opts.defer as boolean | undefined,
        execute: opts.execute as boolean | undefined,
        by: opts.by as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  windowsStartup
    .command('status')
    .requiredOption('--site <site-root>', 'Target Site root')
    .requiredOption('--operation <operation-id>', 'Operation ID to inspect')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .description('Reconcile expected Windows startup posture with deferred record and health files')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'runtime windows-startup status',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => runtimeWindowsStartupStatusCommand({
        site: opts.site as string | undefined,
        operation: opts.operation as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));
}
