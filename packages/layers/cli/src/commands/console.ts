/**
 * `narada console`
 *
 * Operator console for cross-Site health, attention queue, and control requests.
 */

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import {
  openRegistry,
  createObservationFactory,
  createControlClientFactory,
} from '../lib/console-core.js';
import { stopOperatorConsoleProjection } from './console-projection-lifecycle.js';
import { startOperatorConsoleOverlay } from '@narada-core/operator-console-overlay';
import { createOperatorConsoleRemoteGateway, type OperatorConsoleRemoteGateway } from '@narada-core/operator-console-remote-gateway';

export interface ConsoleOptions {
  format?: string;
  verbose?: boolean;
}

export interface ConsoleProjectionOptions extends ConsoleOptions {
  host?: string;
  port?: number;
  state_root?: string;
}

export interface ConsoleOverlayOptions extends ConsoleOptions {
  url?: string;
  title?: string;
  state_root?: string;
  visibility_policy?: 'always' | 'windows-terminal';
  refresh_seconds?: number;
}

export interface ConsoleGatewayOptions extends ConsoleOptions {
  host?: string;
  port?: number;
  router_url?: string;
  router_state_root?: string;
  router_token?: string;
  bridge_token?: string;
}

export interface ConsoleGatewayStartResult {
  gateway: OperatorConsoleRemoteGateway;
  url: string;
  router_url: string;
}

export async function consoleGatewayCommand(
  options: ConsoleGatewayOptions,
  _context: CommandContext,
): Promise<ConsoleGatewayStartResult> {
  const routerUrl = options.router_url?.trim()
    || process.env.NARADA_OPERATOR_ROUTER_URL?.trim()
    || 'http://127.0.0.1:61729';
  const routerToken = options.router_token?.trim()
    || process.env.NARADA_OPERATOR_ROUTER_TOKEN?.trim()
    || await readRouterToken(options.router_state_root);
  const bridgeToken = options.bridge_token?.trim()
    || process.env.NARADA_OPERATOR_CONSOLE_BRIDGE_TOKEN?.trim();
  if (!bridgeToken) throw new Error('operator_console_gateway_bridge_token_required');
  const gateway = createOperatorConsoleRemoteGateway({
    router_url: routerUrl,
    router_token: routerToken,
    bridge_token: bridgeToken,
    host: options.host,
    port: options.port,
  });
  return { gateway, url: await gateway.start(), router_url: routerUrl };
}

async function readRouterToken(stateRoot?: string): Promise<string> {
  const root = stateRoot?.trim()
    || process.env.NARADA_OPERATOR_ROUTER_STATE_ROOT?.trim()
    || join(process.env.LOCALAPPDATA?.trim() || join(process.env.USERPROFILE?.trim() || process.env.HOME?.trim() || homedir(), 'AppData', 'Local'), 'Narada', 'operator-router');
  try {
    const token = (await readFile(join(root, 'registration-token'), 'utf8')).trim();
    if (token) return token;
  } catch {
    // Normalize the missing-secret path into one actionable command error.
  }
  throw new Error(`operator_console_gateway_router_token_unavailable:${root}`);
}

export async function consoleOverlayCommand(
  options: ConsoleOverlayOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const status = await startOperatorConsoleOverlay({
    url: options.url,
    title: options.title,
    stateRoot: options.state_root,
    visibilityPolicy: options.visibility_policy,
    refreshSeconds: options.refresh_seconds,
  });
  const fmt = createFormatter({ format: options.format as 'json' | 'human' | 'auto', verbose: options.verbose });
  if (fmt.getFormat() === 'human') fmt.message('Operator Console overlay started.', 'success');
  return { exitCode: ExitCode.SUCCESS, result: status };
}

export async function consoleStatusCommand(
  options: ConsoleOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format as 'json' | 'human' | 'auto', verbose: options.verbose });
  const registry = await openRegistry();
  try {
    const { aggregateHealth } = await import('@narada-core/windows-site');
    const summary = await aggregateHealth(registry, createObservationFactory());

    if (fmt.getFormat() === 'human') {
      fmt.section('Cross-Site Health Summary');
      fmt.kv('Total Sites', String(summary.total_sites));
      fmt.kv('Healthy', String(summary.healthy));
      fmt.kv('Degraded', String(summary.degraded));
      fmt.kv('Critical', String(summary.critical));
      fmt.kv('Auth Failed', String(summary.auth_failed));
      fmt.kv('Stale', String(summary.stale));
      fmt.kv('Error', String(summary.error));
      fmt.kv('Stopped', String(summary.stopped));

      if (summary.sites.length > 0) {
        fmt.section('Per-Site Health');
        fmt.table(
          [
            { key: 'site_id', label: 'Site ID', width: 20 },
            { key: 'variant', label: 'Variant', width: 10 },
            { key: 'status', label: 'Status', width: 12 },
            { key: 'last_cycle', label: 'Last Cycle', width: 24 },
            { key: 'failures', label: 'Failures', width: 10 },
            { key: 'message', label: 'Message', width: 30 },
          ],
          summary.sites.map((s) => ({
            site_id: s.site_id,
            variant: s.variant,
            status: s.status,
            last_cycle: s.last_cycle_at ?? 'never',
            failures: String(s.consecutive_failures),
            message: s.message.slice(0, 28),
          })),
        );
      }
    }

    return { exitCode: ExitCode.SUCCESS, result: { status: 'success', summary } };
  } finally {
    registry.close();
  }
}

export async function consoleStopCommand(
  options: ConsoleProjectionOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format as 'json' | 'human' | 'auto', verbose: options.verbose });
  const stopped = await stopOperatorConsoleProjection({
    host: options.host,
    port: options.port,
    state_root: options.state_root,
  });
  if (fmt.getFormat() === 'human') fmt.message(stopped.detail, stopped.status === 'not_running' ? 'info' : 'success');
  return { exitCode: ExitCode.SUCCESS, result: { outcome: 'success', ...stopped } };
}

export async function consoleAttentionCommand(
  options: ConsoleOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format as 'json' | 'human' | 'auto', verbose: options.verbose });
  const registry = await openRegistry();
  try {
    const { deriveAttentionQueue } = await import('@narada-core/windows-site');
    const items = await deriveAttentionQueue(registry, createObservationFactory());

    if (fmt.getFormat() === 'human') {
      fmt.section('Attention Queue');
      if (items.length === 0) {
        fmt.message('No items need attention.', 'success');
      } else {
        fmt.table(
          [
            { key: 'site_id', label: 'Site', width: 16 },
            { key: 'item_type', label: 'Type', width: 22 },
            { key: 'item_id', label: 'ID', width: 20 },
            { key: 'severity', label: 'Severity', width: 10 },
            { key: 'summary', label: 'Summary', width: 36 },
          ],
          items.map((item) => ({
            site_id: item.site_id,
            item_type: item.item_type,
            item_id: item.item_id.slice(0, 18),
            severity: item.severity,
            summary: item.summary.slice(0, 34),
          })),
        );
      }
    }

    return { exitCode: ExitCode.SUCCESS, result: { status: 'success', items } };
  } finally {
    registry.close();
  }
}

export async function consoleControlCommand(
  actionType: 'approve' | 'reject' | 'retry',
  siteId: string,
  targetId: string,
  options: ConsoleOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format as 'json' | 'human' | 'auto', verbose: options.verbose });
  const registry = await openRegistry();
  try {
    const { ControlRequestRouter } = await import('@narada-core/windows-site');

    const router = new ControlRequestRouter({
      registry,
      clientFactory: createControlClientFactory(registry),
    });

    const request = {
      requestId: `console-${Date.now()}`,
      siteId,
      actionType,
      targetId,
      targetKind: actionType === 'retry' ? ('work_item' as const) : ('outbound_command' as const),
      requestedAt: new Date().toISOString(),
      requestedBy: 'operator',
    };

    const routeResult = await router.route(request);

    if (fmt.getFormat() === 'human') {
      if (routeResult.success) {
        fmt.message(`${actionType} ${targetId} on ${siteId}: ${routeResult.status}`, 'success');
      } else {
        fmt.message(`${actionType} ${targetId} on ${siteId}: ${routeResult.status} — ${routeResult.detail ?? 'No detail'}`, 'error');
      }
    }

    return {
      exitCode: routeResult.success ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
      result: { outcome: routeResult.success ? 'success' : 'error', ...routeResult },
    };
  } finally {
    registry.close();
  }
}
