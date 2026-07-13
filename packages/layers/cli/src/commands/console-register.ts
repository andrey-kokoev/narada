import type { Command } from 'commander';
import {
  consoleStatusCommand,
  consoleAttentionCommand,
  consoleControlCommand,
} from './console.js';
import { createConsoleServer } from './console-server.js';
import { silentCommandContext, wrapCommand } from '../lib/command-wrapper.js';
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
    .action(async (siteId: string, outboundId: string, opts: Record<string, unknown>) => {
      const result = await consoleControlCommand('approve', siteId, outboundId, {
        format: resolveCommandFormat(),
        verbose: opts.verbose as boolean | undefined,
      }, silentCommandContext({ verbose: !!opts.verbose }));
      emitFormatterBackedCommandResult(result, { format: opts.format });
    });

  consoleCmd
    .command('reject <site-id> <outbound-id>')
    .description('Reject an outbound command')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .action(async (siteId: string, outboundId: string, opts: Record<string, unknown>) => {
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
    .action(async (siteId: string, workItemId: string, opts: Record<string, unknown>) => {
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
    .option('--port <port>', 'Port to bind to (0 for ephemeral)', '0')
    .action(async (opts: Record<string, unknown>) => {
      // Long-lived process surface: keep direct lifecycle output and SIGINT handling.
      const host = (opts.host as string) ?? '127.0.0.1';
      const port = opts.port ? parseInt(String(opts.port), 10) : 0;
      const server = await createConsoleServer({ host, port, ingressMode: 'diagnostic' });
      const url = await server.start();
      emitLongLivedCommandStartup([
        `Operator Workspace: ${url}/`,
        `Operator Console Site Registry: ${url}/console/registry`,
        `Operator Console Agent Launcher: ${url}/console/launch`,
        `Operator Console API base: ${url}/console`,
        'Press Ctrl+C to stop',
      ]);
      process.on('SIGINT', async () => {
        await server.stop();
        exitLongLivedCommandSuccessfully();
      });
    });
}
