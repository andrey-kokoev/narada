import type { Command } from 'commander';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { DEFAULT_OPERATOR_ROUTER_PORT, ensureOperatorRouter, inspectOperatorRouterRouteSet, readOperatorRouterRoutes, reconstructOperatorRouteSet } from '@narada2/operator-router';
import { createWorkbenchServer, workbenchDiagnoseCommand } from './workbench-server.js';
import {
  emitFiniteCommandResult,
  emitLongLivedCommandStartup,
  exitLongLivedCommandSuccessfully,
  resolveCommandFormat,
} from '../lib/cli-output.js';

export function registerWorkbenchCommands(program: Command): void {
  const workbenchCmd = program
    .command('workbench')
    .description('Site-scoped task and agent operations projection');

  workbenchCmd
    .command('diagnose')
    .description('Show bounded Site Operations diagnostics')
    .option('--format <format>', 'Output format: json, human, or auto', 'auto')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .action(async (opts: Record<string, unknown>) => {
      const result = await workbenchDiagnoseCommand({
        cwd: opts.cwd as string | undefined,
        format: resolveCommandFormat(opts.format, 'human'),
      });
      emitFiniteCommandResult(result, { format: opts.format });
    });

  workbenchCmd
    .command('serve')
    .description('Start Site Operations through the Operator Router (port 0 for diagnostics)')
    .option('--host <host>', 'Host to bind to', '127.0.0.1')
    .option('--port <port>', 'Stable Operator Router port (0 for direct diagnostic mode)', String(DEFAULT_OPERATOR_ROUTER_PORT))
    .option('--site-id <id>', 'Explicit registered Site id for stable Site Operations routing')
    .option('--cwd <path>', 'Working directory (defaults to cwd)', '.')
    .option('-v, --verbose', 'Enable verbose output', false)
    .action(async (opts: Record<string, unknown>) => {
      // Long-lived process surface: keep direct lifecycle output and SIGINT handling.
      const host = (opts.host as string) ?? '127.0.0.1';
      const port = opts.port ? parseInt(String(opts.port), 10) : 0;
      const cwd = (opts.cwd as string) ?? '.';
      if (port === 0) {
        const server = await createWorkbenchServer({ host, port, cwd, verbose: !!opts.verbose });
        const url = await server.start();
        emitLongLivedCommandStartup([
          `Site Operations diagnostic HTTP API listening at ${url}`,
          'Site Operations ownership: diagnostic',
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
      const siteId = String(opts.siteId ?? '').trim();
      if (!siteId) throw new Error('workbench_site_id_required_for_router');
      const siteRoot = resolve(cwd);
      const router = await ensureOperatorRouter({ host, port });
      const publicPath = `/sites/${encodeURIComponent(siteId)}/operations`;
      const routeKey = createHash('sha256').update(siteId, 'utf8').digest('hex').slice(0, 32);
      const routeId = `site-operations-${routeKey}`;
      const existingRoutes = await readOperatorRouterRoutes({ url: router.url });
      const routePosture = inspectOperatorRouterRouteSet(existingRoutes.routes, [routeId]);
      if (routePosture.posture === 'healthy') {
        emitLongLivedCommandStartup([
          `Site Operations: ${router.url}${publicPath}/`,
          `  Site    ${siteId}`,
          `  Router  ${router.url}`,
          `  Ownership: ${router.ownership === 'attached' ? 'existing operator-router projection' : 'operator-router projection'}`,
          '  Projection: attached',
          '  Lifecycle: owned by the existing projection process',
        ]);
        return;
      }
      if (routePosture.posture === 'incomplete_live') {
        throw new Error(`operator_router_projection_incomplete:${routePosture.healthy_route_ids.join(',')}`);
      }
      const server = await createWorkbenchServer({ host, port: 0, cwd, verbose: !!opts.verbose, publicBasePath: publicPath });
      const backendUrl = await server.start();
      const ownerId = `site-operations:${routeKey}:${process.pid}`;
      const instanceNonce = randomUUID().replace(/-/g, '');
      const admin = { url: router.url, registration_token: router.registration_token };
      let routeSet: Awaited<ReturnType<typeof reconstructOperatorRouteSet>>['route_set'] | null = null;
      try {
        const reconstructed = await reconstructOperatorRouteSet({
          admin,
          renew_interval_ms: 30_000,
          routes: [{
            route_id: routeId,
            route_class: 'site-operations',
            public_path: publicPath,
            route_mode: 'prefix',
            target_url: backendUrl,
            health_url: `${backendUrl.replace(/\/+$/, '')}/api/health`,
            owner_id: ownerId,
            site_id: siteId,
            session_id: null,
            process_evidence: { instance_nonce: instanceNonce, pid: process.pid, started_at: new Date().toISOString() },
            protocols: ['http'],
            methods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
            lease_ms: 60 * 60 * 1000,
            reconstruction: { kind: 'site-operation', site_root: siteRoot, site_id: siteId, session_id: null },
          }],
        });
        routeSet = reconstructed.route_set;
      } catch (error) {
        await server.stop();
        throw error;
      }
      const publicUrl = `${router.url}${publicPath}/`;
      emitLongLivedCommandStartup([
        `Site Operations: ${publicUrl}`,
        `  Site    ${siteId}`,
        `  Router  ${router.url}`,
        '  Ownership: operator-router projection',
        'Press Ctrl+C to stop',
      ]);
      const stopProjection = async (): Promise<void> => {
        await routeSet?.stop();
        await server.stop();
        exitLongLivedCommandSuccessfully();
      };
      process.once('SIGINT', stopProjection);
      process.once('SIGTERM', stopProjection);
    });
}
