import type { Command } from 'commander';
import { createWorkbenchServer, workbenchDiagnoseCommand } from './workbench-server.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';

export function registerWorkbenchCommands(program: Command): void {
  const workbenchCmd = program
    .command('workbench')
    .description('Self-build workbench HTTP server and controls');

  workbenchCmd
    .command('diagnose')
    .description('Show bounded Workbench diagnostics')
    .option('--format <format>', 'Output format: json, human, or auto', 'auto')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(async (opts: Record<string, unknown>) => {
      const result = await workbenchDiagnoseCommand({
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'human'),
      });
      emitCommandResult(result.result, opts.format);
      if (result.exitCode !== 0) process.exit(result.exitCode);
    });

  workbenchCmd
    .command('serve')
    .description('Start the Workbench HTTP API for browser UI')
    .option('--host <host>', 'Host to bind to', '127.0.0.1')
    .option('--port <port>', 'Port to bind to (0 for ephemeral)', '0')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(async (opts: Record<string, unknown>) => {
      // Long-lived process surface: keep direct lifecycle output and SIGINT handling.
      const host = (opts.host as string) ?? '127.0.0.1';
      const port = opts.port ? parseInt(String(opts.port), 10) : 0;
      const cwd = (opts.cwd as string) ?? '.';
      const server = await createWorkbenchServer({ host, port, cwd, verbose: !!opts.verbose });
      const url = await server.start();
      console.log(`Workbench HTTP API listening at ${url}`);
      console.log('Press Ctrl+C to stop');
      process.on('SIGINT', async () => {
        await server.stop();
        process.exit(0);
      });
    });
}
