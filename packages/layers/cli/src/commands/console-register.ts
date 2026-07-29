import { Option, type Command } from 'commander';
import {
  consoleStatusCommand,
  consoleAttentionCommand,
  consoleControlCommand,
  consoleStopCommand,
  consoleOverlayCommand,
} from './console.js';
import { DEFAULT_OPERATOR_CONSOLE_PORT, createConsoleServer } from './console-server.js';
import {
  OPERATOR_CONSOLE_LAUNCH_PATH,
  OPERATOR_CONSOLE_ONBOARDING_PATH,
  OPERATOR_CONSOLE_REGISTRY_PATH,
} from '@narada2/operator-console-contract';
import {
  restartOperatorConsoleRuntime,
  serveOperatorConsoleRuntime,
} from '@narada2/operator-console-runtime';
import {silentCommandContext, wrapCommand, type CommanderOptionValues} from '../lib/command-wrapper.js';
import { openOperatorConsoleWorkspace } from '../lib/operator-console-browser.js';
import {
  emitFormatterBackedCommandResult,
  emitLongLivedCommandStartup,
  exitLongLivedCommandSuccessfully,
  resolveCommandFormat,
} from '../lib/cli-output.js';

export function registerConsoleCommands(program: Command): void {
  const consoleCmd = program
    .command('console')
    .description('Operator console for cross-Site health and control');

  consoleCmd
    .command('overlay')
    .description('Show a compact native window with a button to the Operator Workspace')
    .option('--url <url>', 'Operator Workspace URL; defaults to the local Operator Router')
    .option('--title <title>', 'Overlay title', 'Narada Operator Console')
    .option('--state-root <path>', 'Override the user-local overlay state root')
    .option('--visibility <policy>', 'Visibility policy: always or windows-terminal', 'windows-terminal')
    .option('--refresh-seconds <seconds>', 'Document refresh interval', '2')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(async (opts: CommanderOptionValues) => {
      const visibility = String(opts.visibility ?? 'windows-terminal');
      if (visibility !== 'always' && visibility !== 'windows-terminal') throw new Error('operator_console_overlay_visibility_invalid');
      const result = await consoleOverlayCommand({
        url: opts.url as string | undefined,
        title: opts.title as string | undefined,
        state_root: opts.stateRoot as string | undefined,
        visibility_policy: visibility as 'always' | 'windows-terminal',
        refresh_seconds: Number.parseInt(String(opts.refreshSeconds ?? '2'), 10),
        format: String(opts.format ?? 'auto'),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose }));
      emitFormatterBackedCommandResult(result, { format: opts.format });
    });

  consoleCmd
    .command('status')
    .description('Show cross-Site health summary')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(wrapCommand('console-status', (opts, ctx) =>
      consoleStatusCommand({ format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto', verbose: opts.verbose }, ctx)));

  consoleCmd
    .command('attention')
    .description('Show attention queue across all Sites')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(wrapCommand('console-attention', (opts, ctx) =>
      consoleAttentionCommand({ format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto', verbose: opts.verbose }, ctx)));

  consoleCmd
    .command('approve <site-id> <outbound-id>')
    .description('Approve an outbound command')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .action(async (siteId: string, outboundId: string, opts: CommanderOptionValues) => {
      const result = await consoleControlCommand('approve', siteId, outboundId, {
        format: resolveCommandFormat(),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose }));
      emitFormatterBackedCommandResult(result, { format: opts.format });
    });

  consoleCmd
    .command('restart')
    .description('Stop and start the local Operator Workspace projection')
    .option('--host <host>', 'Host to bind to', '127.0.0.1')
    .option('--port <port>', 'Stable Operator Router port', String(DEFAULT_OPERATOR_CONSOLE_PORT))
    .option('--open', 'Open the Operator Workspace in the default browser after startup', true)
    .option('--no-open', 'Do not open the Operator Workspace in the default browser', false)
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .action(async (opts: CommanderOptionValues) => {
      const host = (opts.host as string) ?? '127.0.0.1';
      const port = opts.port ? Number.parseInt(String(opts.port), 10) : 0;
      if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('operator_console_restart_requires_stable_port');
      const format = resolveCommandFormat();
      if (format !== 'json') emitLongLivedCommandStartup(['Operator Console restart: stopping the current projection...']);
      const restarted = await restartOperatorConsoleRuntime({
        host,
        port,
      });
      const workspaceUrl = restarted.started.url;
      const browserOutcome = await openOperatorConsoleWorkspace(workspaceUrl, { shouldOpen: opts.open !== false });
      const result = {
        schema: 'narada.operator_console.restart_result.v1',
        status: 'ready',
        stopped: restarted.stopped,
        started: restarted.started,
        workspace_url: workspaceUrl,
        browser: browserOutcome,
      };
      if (format === 'json') {
        emitFormatterBackedCommandResult({ exitCode: 0, result }, { format });
      } else {
        emitLongLivedCommandStartup([
          `Operator Router: ${restarted.started.router_url ?? workspaceUrl}`,
          `Operator Workspace: ${workspaceUrl}`,
          formatBrowserOutcome(browserOutcome, workspaceUrl),
          `Operator Console Site Registry: ${restarted.started.url}${OPERATOR_CONSOLE_REGISTRY_PATH}`,
          `Operator Console Site Runtime: ${restarted.started.url}${OPERATOR_CONSOLE_LAUNCH_PATH}`,
          `Operator Console First Use: ${restarted.started.url}${OPERATOR_CONSOLE_ONBOARDING_PATH}`,
          `Operator Console API base: ${restarted.started.url}/console`,
          'Operator Console projection: started in a detached runtime host',
        ]);
      }
    });

  consoleCmd
    .command('stop')
    .description('Stop the local Operator Workspace projection and remove its route')
    .option('--host <host>', 'Operator Router host', '127.0.0.1')
    .option('--port <port>', 'Stable Operator Router port', String(DEFAULT_OPERATOR_CONSOLE_PORT))
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(async (opts: CommanderOptionValues) => {
      const result = await consoleStopCommand({
        host: String(opts.host),
        port: Number.parseInt(String(opts.port), 10),
        format: String(opts.format ?? 'auto'),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose }));
      emitFormatterBackedCommandResult(result, { format: opts.format });
    });

  consoleCmd
    .command('reject <site-id> <outbound-id>')
    .description('Reject an outbound command')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .action(async (siteId: string, outboundId: string, opts: CommanderOptionValues) => {
      const result = await consoleControlCommand('reject', siteId, outboundId, {
        format: resolveCommandFormat(),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose }));
      emitFormatterBackedCommandResult(result, { format: opts.format });
    });

  consoleCmd
    .command('retry <site-id> <work-item-id>')
    .description('Retry a work item')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .action(async (siteId: string, workItemId: string, opts: CommanderOptionValues) => {
      const result = await consoleControlCommand('retry', siteId, workItemId, {
        format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose }));
      emitFormatterBackedCommandResult(result, { format: opts.format });
    });

  consoleCmd
    .command('serve')
    .description('Start the local Operator Workspace host for browser UI')
    .option('--host <host>', 'Host to bind to', '127.0.0.1')
    .option('--port <port>', `Stable Operator Router port (0 for diagnostic ephemeral mode)`, String(DEFAULT_OPERATOR_CONSOLE_PORT))
    .option('--open', 'Open the Operator Workspace in the default browser after startup', true)
    .option('--no-open', 'Do not open the Operator Workspace in the default browser', false)
    .addOption(new Option('--runtime-instance <nonce>', 'Internal Operator Console runtime identity nonce').hideHelp())
    .action(runConsoleServe);
}

async function runConsoleServe(opts: CommanderOptionValues): Promise<void> {
  // Long-lived process surface: keep direct lifecycle output and SIGINT handling.
  const host = (opts.host as string) ?? '127.0.0.1';
  const port = opts.port ? Number.parseInt(String(opts.port), 10) : 0;
  if (port === 0) {
    const server = await createConsoleServer({ host, port: 0, ingressMode: 'diagnostic' });
    const url = await server.start();
    const workspaceUrl = `${url}/`;
    const browserOutcome = await openOperatorConsoleWorkspace(workspaceUrl, { shouldOpen: opts.open !== false });
    emitLongLivedCommandStartup([
      `Operator Workspace diagnostic host: ${workspaceUrl}`,
      formatBrowserOutcome(browserOutcome, workspaceUrl),
      `Operator Console Site Registry: ${url}${OPERATOR_CONSOLE_REGISTRY_PATH}`,
      `Operator Console Site Runtime: ${url}${OPERATOR_CONSOLE_LAUNCH_PATH}`,
      `Operator Console First Use: ${url}${OPERATOR_CONSOLE_ONBOARDING_PATH}`,
      `Operator Console API base: ${url}/console`,
      'Operator Console ownership: diagnostic',
      'Press Ctrl+C to stop',
    ]);
    const stopDiagnostic = async (): Promise<void> => {
      await server.stop();
      exitLongLivedCommandSuccessfully();
    };
    process.once('SIGINT', stopDiagnostic);
    process.once('SIGTERM', stopDiagnostic);
    return;
  }

  const runtime = await serveOperatorConsoleRuntime({
    host,
    port,
    instance_nonce: opts.runtimeInstance as string | undefined,
    create_backend: async (routerUrl) => {
      const server = await createConsoleServer({ host, port: 0, ingressMode: 'router', operatorRouterUrl: routerUrl });
      const url = await server.start();
      return { url, stop: () => server.stop() };
    },
    open_workspace: (workspaceUrl) => openOperatorConsoleWorkspace(workspaceUrl, { shouldOpen: opts.open !== false }),
    on_startup: ({ url, router_url, ownership, process_pid, browser_result }) => {
      emitLongLivedCommandStartup([
        `Operator Router: ${router_url}/`,
        `Operator Workspace: ${url}`,
        formatBrowserOutcome(browser_result, url),
        `Operator Console Site Registry: ${router_url}${OPERATOR_CONSOLE_REGISTRY_PATH}`,
        `Operator Console Site Runtime: ${router_url}${OPERATOR_CONSOLE_LAUNCH_PATH}`,
        `Operator Console First Use: ${router_url}${OPERATOR_CONSOLE_ONBOARDING_PATH}`,
        `Operator Console API base: ${router_url}/console`,
        `Operator Router ownership: ${ownership}`,
        ownership === 'attached' ? 'Operator Console projection: attached' : 'Operator Console projection: started',
        `Operator Console runtime process: ${process_pid}`,
        'Press Ctrl+C to stop',
      ]);
    },
  });
  if (runtime.ownership === 'attached') return;
  const stopProjection = async (): Promise<void> => {
    await runtime.stop();
    exitLongLivedCommandSuccessfully();
  };
  process.once('SIGINT', stopProjection);
  process.once('SIGTERM', stopProjection);
}

function formatBrowserOutcome(
  outcome: unknown,
  workspaceUrl: string,
): string {
  if (!outcome || typeof outcome !== 'object') return `Operator Workspace browser: unavailable (no browser result); use ${workspaceUrl}`;
  const result = outcome as { status?: string; admission_reason?: string; error?: string };
  if (result.status === 'opened') return `Operator Workspace browser: opened ${workspaceUrl}`;
  if (result.status === 'suppressed') return `Operator Workspace browser: not opened (${result.admission_reason ?? 'suppressed'})`;
  return `Operator Workspace browser: unavailable (${result.error ?? result.admission_reason ?? 'unknown'}); use ${workspaceUrl}`;
}
