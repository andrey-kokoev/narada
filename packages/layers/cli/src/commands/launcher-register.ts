import type { Command } from 'commander';
import { directCommandAction, silentCommandContext } from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';
import { explainMcpCommand, workspaceLaunchCommand, workspaceLaunchPlanCommand } from './launcher.js';

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
    .option('--carrier <carrier>', 'Override operator carrier')
    .option('--operator-surface <surface>', 'Override operator/client surface; preferred replacement for --carrier')
    .option('--runtime <runtime>', 'Override runtime implementation')
    .option('--intelligence-provider <provider>', 'agent-cli intelligence provider')
    .option('--interactive-selection', 'Interactively select Site, Role, Carrier, Runtime, and applicable Intelligence Provider before planning', false)
    .option('--result-path <path>', 'Write the workspace plan JSON to a file')
    .option('--suppress-result-output', 'Do not print the final result envelope after writing --result-path', false)
    .option('--enable-native-shell', 'Break-glass: permit native shell carrier posture where supported', false)
    .option('--no-wait-for-enter-before-exec', 'Do not add the wait gate before exec handoff')
    .option('--smoke', 'Return smoke dry-run commands instead of opening terminals', false)
    .option('--dry-run', 'Return Windows Terminal argv plan without opening terminals', false)
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'launcher workspace-plan',
      emit: (result: unknown, format?: unknown) => {
        if (
          result
          && typeof result === 'object'
          && (result as { suppress_result_output?: unknown }).suppress_result_output === true
        ) return;
        emitCommandResult(result, format);
      },
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => workspaceLaunchPlanCommand({
        agent: opts.agent as string[] | undefined,
        all: opts.all as boolean | undefined,
        role: opts.role as string[] | undefined,
        site: opts.site as string[] | undefined,
        configPath: opts.configPath as string[] | undefined,
        registryPath: opts.registryPath as string | undefined,
        carrier: opts.carrier as string | undefined,
        operatorSurface: opts.operatorSurface as string | undefined,
        runtime: opts.runtime as string | undefined,
        intelligenceProvider: opts.intelligenceProvider as string | undefined,
        interactiveSelection: opts.interactiveSelection as boolean | undefined,
        resultPath: opts.resultPath as string | undefined,
        suppressResultOutput: opts.suppressResultOutput as boolean | undefined,
        enableNativeShell: opts.enableNativeShell as boolean | undefined,
        noWaitForEnterBeforeExec: opts.waitForEnterBeforeExec === false,
        smoke: opts.smoke as boolean | undefined,
        dryRun: opts.dryRun as boolean | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  launcher
    .command('workspace-launch')
    .description('Plan and launch a workspace from the User Site launch registry')
    .option('--agent <id...>', 'Agent identity to launch')
    .option('--all', 'Select all registry agents', false)
    .option('--role <role...>', 'Role filter')
    .option('--site <site...>', 'Site filter')
    .option('--config-path <path...>', 'One or more launch registry files')
    .option('--registry-path <path>', 'Launch registry path')
    .option('--carrier <carrier>', 'Override operator carrier')
    .option('--operator-surface <surface>', 'Override operator/client surface; preferred replacement for --carrier')
    .option('--runtime <runtime>', 'Override runtime implementation')
    .option('--intelligence-provider <provider>', 'agent-cli intelligence provider')
    .option('--interactive-selection', 'Interactively select Site, Role, Carrier, Runtime, and applicable Intelligence Provider before launching', false)
    .option('--result-path <path>', 'Write the workspace plan JSON to a file')
    .option('--suppress-result-output', 'Do not print the final result envelope after writing --result-path', false)
    .option('--enable-native-shell', 'Break-glass: permit native shell carrier posture where supported', false)
    .option('--no-wait-for-enter-before-exec', 'Do not add the wait gate before exec handoff')
    .option('--smoke', 'Return smoke dry-run commands instead of opening terminals', false)
    .option('--dry-run', 'Return Windows Terminal argv plan without opening terminals', false)
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'launcher workspace-launch',
      emit: (result: unknown, format?: unknown) => {
        if (
          result
          && typeof result === 'object'
          && (result as { suppress_result_output?: unknown }).suppress_result_output === true
        ) return;
        emitCommandResult(result, format);
      },
      format: (opts: Record<string, unknown>) => opts.format,
      invocation: (opts) => workspaceLaunchCommand({
        agent: opts.agent as string[] | undefined,
        all: opts.all as boolean | undefined,
        role: opts.role as string[] | undefined,
        site: opts.site as string[] | undefined,
        configPath: opts.configPath as string[] | undefined,
        registryPath: opts.registryPath as string | undefined,
        carrier: opts.carrier as string | undefined,
        operatorSurface: opts.operatorSurface as string | undefined,
        runtime: opts.runtime as string | undefined,
        intelligenceProvider: opts.intelligenceProvider as string | undefined,
        interactiveSelection: opts.interactiveSelection as boolean | undefined,
        resultPath: opts.resultPath as string | undefined,
        suppressResultOutput: opts.suppressResultOutput as boolean | undefined,
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
