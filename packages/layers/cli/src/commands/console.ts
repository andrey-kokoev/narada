/**
 * `narada console`
 *
 * Operator console for cross-Site health, attention queue, and control requests.
 */

import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import {
  openRegistry,
  createObservationFactory,
  createControlClientFactory,
} from '../lib/console-core.js';

export interface ConsoleOptions {
  format?: string;
  verbose?: boolean;
}

export async function consoleStatusCommand(
  options: ConsoleOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format as 'json' | 'human' | 'auto', verbose: options.verbose });
  const registry = await openRegistry();
  try {
    const { aggregateHealth } = await import('@narada2/windows-site');
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

export async function consoleAttentionCommand(
  options: ConsoleOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format as 'json' | 'human' | 'auto', verbose: options.verbose });
  const registry = await openRegistry();
  try {
    const { deriveAttentionQueue } = await import('@narada2/windows-site');
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
    const { ControlRequestRouter } = await import('@narada2/windows-site');

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
