import type { Command } from 'commander';
import {
  consoleStatusCommand,
  consoleAttentionCommand,
  consoleControlCommand,
} from './console.js';
import { createConsoleServer } from './console-server.js';
import { wrapCommand, type CommandContext } from '../lib/command-wrapper.js';
import { resolveCommandFormat } from '../lib/cli-output.js';

function silentContext(verbose: boolean): CommandContext {
  return {
    configPath: './config.json',
    verbose,
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      trace: () => {},
    } as unknown as CommandContext['logger'],
  };
}

async function emitFormatterBackedResult(
  result: { exitCode: number; result: unknown },
  opts: Record<string, unknown>,
): Promise<void> {
  if (result.exitCode !== 0) {
    console.error((result.result as { error?: string }).error ?? 'Command failed');
    process.exit(result.exitCode);
  }
  if ((opts.format as string) === 'json' || process.env.OUTPUT_FORMAT === 'json') {
    console.log(JSON.stringify(result.result, null, 2));
  }
}

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
      }, silentContext(!!opts.verbose));
      await emitFormatterBackedResult(result, opts);
    });

  consoleCmd
    .command('reject <site-id> <outbound-id>')
    .description('Reject an outbound command')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .action(async (siteId: string, outboundId: string, opts: Record<string, unknown>) => {
      const result = await consoleControlCommand('reject', siteId, outboundId, {
        format: resolveCommandFormat(),
        verbose: opts.verbose as boolean | undefined,
      }, silentContext(!!opts.verbose));
      await emitFormatterBackedResult(result, opts);
    });

  consoleCmd
    .command('retry <site-id> <work-item-id>')
    .description('Retry a work item')
    .option('-f, --format <format>', 'Output format: json, human, or auto', 'auto')
    .action(async (siteId: string, workItemId: string, opts: Record<string, unknown>) => {
      const result = await consoleControlCommand('retry', siteId, workItemId, {
        format: process.env.OUTPUT_FORMAT as 'json' | 'human' | 'auto',
        verbose: opts.verbose as boolean | undefined,
      }, silentContext(!!opts.verbose));
      await emitFormatterBackedResult(result, opts);
    });

  consoleCmd
    .command('serve')
    .description('Start the Operator Console HTTP API for browser UI')
    .option('--host <host>', 'Host to bind to', '127.0.0.1')
    .option('--port <port>', 'Port to bind to (0 for ephemeral)', '0')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(async (opts: Record<string, unknown>) => {
      const host = (opts.host as string) ?? '127.0.0.1';
      const port = opts.port ? parseInt(String(opts.port), 10) : 0;
      const server = await createConsoleServer({ host, port, verbose: !!opts.verbose });
      const url = await server.start();
      console.log(`Operator Console HTTP API listening at ${url}`);
      console.log('Press Ctrl+C to stop');
      process.on('SIGINT', async () => {
        await server.stop();
        process.exit(0);
      });
    });
}
