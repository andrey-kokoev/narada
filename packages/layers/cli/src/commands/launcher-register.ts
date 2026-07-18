import type { Command } from 'commander';
import { directCommandAction, silentCommandContext } from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';
import { explainMcpCommand } from './launcher-mcp-authority.js';
import { launcherArtifactCheckCommand, launcherArtifactEnsureCommand } from './launcher-artifact.js';
import { workspaceLaunchCommand, workspaceLaunchPlanCommand } from './workspace-launch-application.js';
import type { ExplainMcpOptions } from './launcher-mcp-authority.js';
import type { LauncherArtifactOptions } from './launcher-artifact.js';
import type { WorkspaceLaunchPlanOptions } from './workspace-launch-types.js';

type LauncherCommandOptions = Omit<WorkspaceLaunchPlanOptions, 'format'> & {
  format?: string;
};

type LauncherExplainMcpOptions = Omit<ExplainMcpOptions, 'format'> & { format?: string };

export function registerLauncherCommands(program: Command): void {
  const launcher = program
    .command('launcher')
    .description('Narada launcher planning and workspace orchestration commands');

  const artifact = launcher
    .command('artifact')
    .description('Inspect and materialize verified launch artifacts');

  artifact
    .command('check <target>')
    .description('Check a package-owned launch artifact without building')
    .option('--site-root <path>', 'Narada workspace root; defaults to the current Narada proper root')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[string, LauncherArtifactOptions]>({
      command: 'launcher artifact check',
      emit: emitCommandResult,
      format: (_target: string, opts: LauncherArtifactOptions) => opts.format,
      invocation: (target, opts) => launcherArtifactCheckCommand(target, {
        siteRoot: opts.siteRoot,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  artifact
    .command('ensure <target>')
    .description('Build and verify a stale launch artifact before it is consumed')
    .option('--site-root <path>', 'Narada workspace root; defaults to the current Narada proper root')
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[string, LauncherArtifactOptions]>({
      command: 'launcher artifact ensure',
      emit: emitCommandResult,
      format: (_target: string, opts: LauncherArtifactOptions) => opts.format,
      invocation: (target, opts) => launcherArtifactEnsureCommand(target, {
        siteRoot: opts.siteRoot,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  launcher
    .command('workspace-plan')
    .description('Plan a workspace launch from the User Site launch registry without opening terminals')
    .option('--agent <id...>', 'Agent identity to launch')
    .option('--all', 'Select all registry agents', false)
    .option('--role <role...>', 'Role filter')
    .option('--site <site...>', 'Site filter')
    .option('--config-path <path...>', 'One or more launch registry files')
    .option('--registry-path <path>', 'Launch registry path')
    .option('--operator-surface <surface>', 'Override operator/client surface')
    .option('--runtime <runtime>', 'Override runtime implementation')
    .option('--authority <mode>', 'Runtime mutation authority posture: auto|read|write', 'auto')
    .option('--intelligence-provider <provider>', 'NARS operator-surface intelligence provider')
    .option('--mcp-scope <scope>', 'Override MCP injection scope: all|host|user-site|local-site|none; otherwise use each registry entry')
    .option('--cloudflare-api-base-url <url>', 'Default Cloudflare NARS projection Worker URL for agent-web-ui publish controls')
    .option('--result-path <path>', 'Write the workspace plan JSON to a file')
    .option('--suppress-result-output', 'Do not print the final result envelope after writing --result-path', false)
    .option('--enable-native-shell', 'Break-glass: permit native shell posture where supported', false)
    .option('--no-wait-for-enter-before-exec', 'Do not add the wait gate before exec handoff')
    .option('--visible-runtime-terminal', 'Request a visible terminal for NARS runtime hosts', false)
    .option('--smoke', 'Return smoke dry-run commands instead of opening terminals', false)
    .option('--dry-run', 'Return Windows Terminal argv plan without opening terminals', false)
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[LauncherCommandOptions]>({
      command: 'launcher workspace-plan',
      emit: (result: unknown, format?: unknown) => {
        if (
          result
          && typeof result === 'object'
          && (result as { suppress_result_output?: unknown }).suppress_result_output === true
        ) return;
        emitCommandResult(result, format);
      },
      format: (opts: LauncherCommandOptions) => opts.format,
      invocation: (opts) => workspaceLaunchPlanCommand({
        agent: opts.agent,
        all: opts.all,
        role: opts.role,
        site: opts.site,
        configPath: opts.configPath,
        registryPath: opts.registryPath,
        operatorSurface: opts.operatorSurface,
        runtime: opts.runtime,
        authority: opts.authority,
        intelligenceProvider: opts.intelligenceProvider,
        mcpScope: opts.mcpScope,
        cloudflareApiBaseUrl: opts.cloudflareApiBaseUrl,
        resultPath: opts.resultPath,
        suppressResultOutput: opts.suppressResultOutput,
        enableNativeShell: opts.enableNativeShell,
        noWaitForEnterBeforeExec: opts.noWaitForEnterBeforeExec,
        visibleRuntimeTerminal: opts.visibleRuntimeTerminal,
        smoke: opts.smoke,
        dryRun: opts.dryRun,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));

  launcher
    .command('workspace-launch')
    .description('Plan and launch agents from the User Site launch registry (single agent or non-interactive sets)')
    .option('--agent <id...>', 'Agent identity to launch')
    .option('--all', 'Select all registry agents', false)
    .option('--role <role...>', 'Role filter')
    .option('--site <site...>', 'Site filter')
    .option('--config-path <path...>', 'One or more launch registry files')
    .option('--registry-path <path>', 'Launch registry path')
    .option('--operator-surface <surface>', 'Override operator/client surface')
    .option('--runtime <runtime>', 'Override runtime implementation')
    .option('--authority <mode>', 'Runtime mutation authority posture: auto|read|write', 'auto')
    .option('--intelligence-provider <provider>', 'NARS operator-surface intelligence provider')
    .option('--mcp-scope <scope>', 'Override MCP injection scope: all|host|user-site|local-site|none; otherwise use each registry entry')
    .option('--cloudflare-api-base-url <url>', 'Default Cloudflare NARS projection Worker URL for agent-web-ui publish controls')
    .option('--result-path <path>', 'Write the workspace plan JSON to a file')
    .option('--suppress-result-output', 'Do not print the final result envelope after writing --result-path', false)
    .option('--enable-native-shell', 'Break-glass: permit native shell posture where supported', false)
    .option('--no-wait-for-enter-before-exec', 'Do not add the wait gate before exec handoff')
    .option('--visible-runtime-terminal', 'Request a visible terminal for NARS runtime hosts', false)
    .option('--smoke', 'Return smoke dry-run commands instead of opening terminals', false)
    .option('--dry-run', 'Return Windows Terminal argv plan without opening terminals', false)
    .option('--format <fmt>', 'Output format: json|human|auto', 'auto')
    .action(directCommandAction<[LauncherCommandOptions]>({
      command: 'launcher workspace-launch',
      emit: (result: unknown, format?: unknown) => {
        if (
          result
          && typeof result === 'object'
          && (result as { suppress_result_output?: unknown }).suppress_result_output === true
        ) return;
        emitCommandResult(result, format);
      },
      format: (opts: LauncherCommandOptions) => opts.format,
      invocation: (opts) => workspaceLaunchCommand({
        agent: opts.agent,
        all: opts.all,
        role: opts.role,
        site: opts.site,
        configPath: opts.configPath,
        registryPath: opts.registryPath,
        operatorSurface: opts.operatorSurface,
        runtime: opts.runtime,
        authority: opts.authority,
        intelligenceProvider: opts.intelligenceProvider,
        mcpScope: opts.mcpScope,
        cloudflareApiBaseUrl: opts.cloudflareApiBaseUrl,
        resultPath: opts.resultPath,
        suppressResultOutput: opts.suppressResultOutput,
        enableNativeShell: opts.enableNativeShell,
        noWaitForEnterBeforeExec: opts.noWaitForEnterBeforeExec,
        visibleRuntimeTerminal: opts.visibleRuntimeTerminal,
        smoke: opts.smoke,
        dryRun: opts.dryRun,
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
    .action(directCommandAction<[LauncherExplainMcpOptions]>({
      command: 'launcher explain-mcp',
      emit: emitCommandResult,
      format: (opts: LauncherExplainMcpOptions) => opts.format,
      invocation: (opts) => explainMcpCommand({
        siteRoot: opts.siteRoot,
        site: opts.site,
        registryPath: opts.registryPath,
        configPath: opts.configPath,
        server: opts.server,
        format: resolveCommandFormat(opts.format, 'auto'),
      }, silentCommandContext()),
    }));
}
