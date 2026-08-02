import type { Command } from 'commander';
import { directCommandAction, type CommanderOptionValues } from '../lib/command-wrapper.js';
import { emitCommandResult, emitLongLivedCommandStartup, exitLongLivedCommandSuccessfully } from '../lib/cli-output.js';
import {
  hostFleetInstallCommand,
  hostFleetPlanCommand,
  hostFleetPublishOnceCommand,
  hostFleetReloadCommand,
  hostFleetStatusCommand,
  hostFleetUninstallCommand,
  runHostFleetService,
} from './host-fleet.js';

function addServiceOptions(command: Command): Command {
  return command
    .option('--config <path>', 'Host Fleet runtime configuration source')
    .option('--windows-service-wrapper <path>', 'Path to the WinSW executable; defaults to NARADA_WINSW_PATH')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto');
}

export function registerHostFleetCommands(program: Command): void {
  const fleet = program.command('host-fleet').description('Manage the machine-level, host-only Fleet runtime');

  addServiceOptions(fleet.command('plan').description('Validate configuration and show the service installation plan'))
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'host-fleet plan',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => hostFleetPlanCommand({
        config: opts.config as string | undefined,
        windows_service_wrapper: opts.windowsServiceWrapper as string | undefined,
      }),
    }));

  addServiceOptions(fleet.command('install').description('Install or update the Host Fleet OS service'))
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'host-fleet install', emit: emitCommandResult, format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => hostFleetInstallCommand({
        config: opts.config as string | undefined,
        windows_service_wrapper: opts.windowsServiceWrapper as string | undefined,
      }),
    }));

  addServiceOptions(fleet.command('reload').description('Validate, atomically replace, and activate Host Fleet configuration'))
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'host-fleet reload', emit: emitCommandResult, format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => hostFleetReloadCommand({
        config: opts.config as string | undefined,
        windows_service_wrapper: opts.windowsServiceWrapper as string | undefined,
      }),
    }));

  addServiceOptions(fleet.command('status').description('Show service and authority readiness'))
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'host-fleet status', emit: emitCommandResult, format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => hostFleetStatusCommand({
        config: opts.config as string | undefined,
        windows_service_wrapper: opts.windowsServiceWrapper as string | undefined,
      }),
    }));

  addServiceOptions(fleet.command('uninstall').description('Remove the service while retaining Fleet configuration and state'))
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'host-fleet uninstall', emit: emitCommandResult, format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => hostFleetUninstallCommand({
        config: opts.config as string | undefined,
        windows_service_wrapper: opts.windowsServiceWrapper as string | undefined,
      }),
    }));

  fleet.command('publish-once')
    .description('Publish one signed member heartbeat')
    .option('--config <path>', 'Host Fleet publisher configuration')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'host-fleet publish-once', emit: emitCommandResult, format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => hostFleetPublishOnceCommand({ config: opts.config as string | undefined }),
    }));

  fleet.command('run', { hidden: true })
    .option('--config <path>', 'Host Fleet runtime configuration')
    .option('--state <path>', 'Host Fleet SQLite state path')
    .action(async (opts: CommanderOptionValues) => {
      const started = await runHostFleetService({ config: opts.config as string | undefined, state: opts.state as string | undefined });
      emitLongLivedCommandStartup([
        `Host Fleet runtime: ${started.config.mode}`,
        `Host identity: ${started.config.host_id}`,
        `Authority identity: ${started.config.authority_host_id}`,
        ...(started.runtime.url ? [`Runtime endpoint: ${started.runtime.url}`] : []),
        'Press Ctrl+C to stop',
      ]);
      let stopping = false;
      const stop = async (): Promise<void> => {
        if (stopping) return;
        stopping = true;
        await started.runtime.stop();
        exitLongLivedCommandSuccessfully();
      };
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
    });
}
