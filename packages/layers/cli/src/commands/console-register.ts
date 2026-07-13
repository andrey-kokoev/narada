import type { Command } from 'commander';
import { randomUUID } from 'node:crypto';
import {
  consoleStatusCommand,
  consoleAttentionCommand,
  consoleControlCommand,
} from './console.js';
import { DEFAULT_OPERATOR_CONSOLE_PORT, createConsoleServer } from './console-server.js';
import {
  ensureOperatorRouter,
  registerOperatorRoute,
  renewOperatorRoute,
  unregisterOperatorRoute,
} from '@narada2/operator-router';
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
    .option('--port <port>', `Stable Operator Router port (0 for diagnostic ephemeral mode)`, String(DEFAULT_OPERATOR_CONSOLE_PORT))
    .action(async (opts: Record<string, unknown>) => {
      // Long-lived process surface: keep direct lifecycle output and SIGINT handling.
      const host = (opts.host as string) ?? '127.0.0.1';
      const port = opts.port ? parseInt(String(opts.port), 10) : 0;
      if (port === 0) {
        const server = await createConsoleServer({ host, port: 0, ingressMode: 'diagnostic' });
        const url = await server.start();
        emitLongLivedCommandStartup([
          `Operator Workspace diagnostic host: ${url}/`,
          `Operator Console Site Registry: ${url}/console/registry`,
          `Operator Console Agent Launcher: ${url}/console/launch`,
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

      const router = await ensureOperatorRouter({ host, port });
      const routerRoutes = await fetch(`${router.url}/routes`).then((response) => response.json() as Promise<{ routes?: Array<{ route_id?: string; state?: string }> }>);
      const existingProjection = routerRoutes.routes?.find((route) => route.route_id === 'operator-console');
      if (existingProjection) {
        if (existingProjection.state !== 'healthy') throw new Error(`operator_console_projection_${existingProjection.state}`);
        emitLongLivedCommandStartup([
          `Operator Router: ${router.url}/`,
          `Operator Workspace: ${router.url}/`,
          `Operator Console Site Registry: ${router.url}/console/registry`,
          `Operator Console Agent Launcher: ${router.url}/console/launch`,
          `Operator Console API base: ${router.url}/console`,
          `Operator Router ownership: ${router.ownership}`,
          'Operator Console projection: attached',
          'Press Ctrl+C to stop',
        ]);
        return;
      }

      const server = await createConsoleServer({ host, port: 0, ingressMode: 'diagnostic' });
      const backendUrl = await server.start();
      const ownerId = `operator-console:${process.pid}`;
      const instanceNonce = randomUUID().replace(/-/g, '');
      try {
        await registerOperatorRoute({ url: router.url, registration_token: router.registration_token }, {
          route_id: 'operator-console',
          route_class: 'operator-console',
          public_path: '/',
          route_mode: 'prefix',
          target_url: backendUrl,
          health_url: `${backendUrl}/health`,
          owner_id: ownerId,
          process_evidence: { instance_nonce: instanceNonce, pid: process.pid, started_at: new Date().toISOString() },
          protocols: ['http'],
          methods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
          lease_ms: 60 * 60 * 1000,
          reconstruction: { kind: 'explicit', site_root: null, site_id: null, session_id: null },
        });
      } catch (error) {
        await server.stop();
        throw error;
      }
      const renewTimer = setInterval(() => {
        renewOperatorRoute({ url: router.url, registration_token: router.registration_token }, 'operator-console', {
          owner_id: ownerId,
          instance_nonce: instanceNonce,
          lease_ms: 60 * 60 * 1000,
        }).catch(() => undefined);
      }, 30_000);
      renewTimer.unref();
      emitLongLivedCommandStartup([
        `Operator Router: ${router.url}/`,
        `Operator Workspace: ${router.url}/`,
        `Operator Console Site Registry: ${router.url}/console/registry`,
        `Operator Console Agent Launcher: ${router.url}/console/launch`,
        `Operator Console API base: ${router.url}/console`,
        `Operator Router ownership: ${router.ownership}`,
        'Operator Console projection: started',
        'Press Ctrl+C to stop',
      ]);
      const stopProjection = async (): Promise<void> => {
        clearInterval(renewTimer);
        await unregisterOperatorRoute({ url: router.url, registration_token: router.registration_token }, 'operator-console', {
          owner_id: ownerId,
          instance_nonce: instanceNonce,
        }).catch(() => undefined);
        await server.stop();
        exitLongLivedCommandSuccessfully();
      };
      process.once('SIGINT', stopProjection);
      process.once('SIGTERM', stopProjection);
    });
}
