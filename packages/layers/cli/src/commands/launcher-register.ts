import type { Command } from 'commander';
import { directCommandAction, silentCommandContext } from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';
import { explainMcpCommand, workspaceLaunchPlanCommand } from './launcher.js';

export function registerLauncherCommands(program: Command): void {
  const launcher = program
    .command('launcher')
    .description('Narada launcher planning and workspace orchestration commands');

  launcher
    .command('workspace-plan')
    .description('Plan a workspace launch from the User Site launch registry without opening terminals')
    .option('--agent <id...>', 'Agent identity to launch')
    .option('--all', 'Select all registry agents', false)
    .option('--role <role...>', 'Role filter')
    .option('--site <site...>', 'Site filter')
    .option('--config-path <path...>', 'One or more launch registry files')
    .option('--registry-path <path>', 'Launch registry path')
    .option('--runtime <runtime>', 'Override runtime substrate')
    .option('--intelligence-provider <provider>', 'agent-cli intelligence provider')
    .option('--enable-native-shell', 'Break-glass: permit native shell carrier posture where supported', false)
    .option('--no-wait-for-enter-before-exec', 'Do not add the wait gate before exec handoff')
    .option('--smoke', 'Return smoke dry-run commands instead of opening terminals', false)
    .option('--dry-run', 'Return Windows Terminal argv plan without opening terminals', false)
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'launcher workspace-plan',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => workspaceLaunchPlanCommand({
        agent: opts.agent as string[] | undefined,
        all: opts.all as boolean | undefined,
        role: opts.role as string[] | undefined,
        site: opts.site as string[] | undefined,
        configPath: opts.configPath as string[] | undefined,
        registryPath: opts.registryPath as string | undefined,
        runtime: opts.runtime as string | undefined,
        intelligenceProvider: opts.intelligenceProvider as string | undefined,
        enableNativeShell: opts.enableNativeShell as boolean | undefined,
        noWaitForEnterBeforeExec: opts.waitForEnterBeforeExec === false,
        smoke: opts.smoke as boolean | undefined,
        dryRun: opts.dryRun as boolean | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  launcher
    .command('explain-mcp')
    .description('Explain the runtime-authoritative Site MCP fabric and compare non-authoritative projections')
    .option('--site-root <path>', 'Target Site root whose runtime .ai/mcp fabric should be inspected')
    .option('--site <site>', 'Site alias resolved through the launch registry when --site-root is omitted')
    .option('--registry-path <path>', 'Launch registry path for --site lookup')
    .option('--config-path <path...>', 'One or more launch registry files for --site lookup')
    .option('--server <name>', 'Only report one MCP server')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'launcher explain-mcp',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => explainMcpCommand({
        siteRoot: opts.siteRoot as string | undefined,
        site: opts.site as string | undefined,
        registryPath: opts.registryPath as string | undefined,
        configPath: opts.configPath as string[] | undefined,
        server: opts.server as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));
}
