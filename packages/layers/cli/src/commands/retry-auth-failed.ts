import { resolve, join } from 'node:path';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import {
  loadConfig,
  isMultiMailboxConfig,
  loadMultiMailboxConfig,
} from '@narada2/control-plane';

export interface RetryAuthFailedOptions {
  config?: string;
  verbose?: boolean;
  format?: 'json' | 'human' | 'auto';
  outboundId?: string;
  limit?: number;
}

export async function retryAuthFailedCommand(
  options: RetryAuthFailedOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const { configPath, verbose } = context;
  const fmt = createFormatter({ format: options.format, verbose });

  let raw: string;
  try {
    raw = await (await import('node:fs/promises')).readFile(configPath, 'utf8');
  } catch (error) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: 'Failed to read config: ' + (error as Error).message },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: 'Failed to parse config: ' + (error as Error).message },
    };
  }

  const scopeIds: string[] = [];
  const rootDirs: string[] = [];

  if (isMultiMailboxConfig(parsed)) {
    const { config, valid } = await loadMultiMailboxConfig({ path: configPath });
    if (!valid) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: { status: 'error', error: 'Invalid multi-mailbox configuration' },
      };
    }
    for (const mailbox of config.mailboxes) {
      scopeIds.push(mailbox.mailbox_id);
      rootDirs.push(resolve(mailbox.root_dir));
    }
  } else {
    const config = await loadConfig({ path: configPath });
    for (const scope of config.scopes) {
      scopeIds.push(scope.scope_id);
      rootDirs.push(resolve(scope.root_dir));
    }
  }

  if (scopeIds.length === 0) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: 'No operations configured' },
    };
  }

  const { Database, SqliteCoordinatorStore, SqliteOutboundStore, SqliteIntentStore, executeOperatorAction } =
    await import('@narada2/control-plane');

  const retried: Array<{ scope_id: string; outbound_id: string; to_status: string }> = [];

  for (let i = 0; i < scopeIds.length; i++) {
    const dbPath = join(rootDirs[i]!, '.narada', 'coordinator.db');
    let db: import('better-sqlite3').Database | null = null;
    try {
      db = new Database(dbPath);
      const coordinatorStore = new SqliteCoordinatorStore({ db });
      const outboundStore = new SqliteOutboundStore({ db });
      const intentStore = new SqliteIntentStore({ db });

      // If a specific outboundId is given, try to find it in this scope
      if (options.outboundId) {
        const command = outboundStore.getCommand(options.outboundId);
        if (!command) continue;
      }

      const result = await executeOperatorAction(
        {
          scope_id: scopeIds[i]!,
          coordinatorStore,
          outboundStore,
          intentStore,
        },
        {
          action_type: 'retry_auth_failed',
          target_id: options.outboundId,
          payload_json: options.limit !== undefined ? JSON.stringify({ limit: options.limit }) : undefined,
        },
      );

      if (result.status === 'executed') {
        // Determine which commands were retried by re-querying
        const candidates = outboundStore.getCommandsByScope(scopeIds[i]!, options.limit ?? 50);
        const justRetried = candidates.filter(
          (c) =>
            (c.status === 'approved_for_send' || c.status === 'draft_ready') &&
            c.terminal_reason === null,
        );
        for (const cmd of justRetried) {
          retried.push({ scope_id: scopeIds[i]!, outbound_id: cmd.outbound_id, to_status: cmd.status });
        }
        if (options.outboundId) {
          fmt.message(`Retried auth-failed command ${options.outboundId}`, 'success');
          return {
            exitCode: ExitCode.SUCCESS,
            result: { status: 'success', outbound_id: options.outboundId, action: 'retry_auth_failed' },
          };
        }
      } else if (result.status === 'rejected') {
        // If target was specified and rejected, propagate error
        if (options.outboundId) {
          return {
            exitCode: ExitCode.GENERAL_ERROR,
            result: { status: 'error', error: result.reason },
          };
        }
        // Otherwise continue to next scope
      }
    } catch (error) {
      if (options.outboundId) {
        return {
          exitCode: ExitCode.GENERAL_ERROR,
          result: { status: 'error', error: (error as Error).message },
        };
      }
      // Scope-level errors are logged but not fatal when scanning all scopes
      fmt.message(`Scope ${scopeIds[i]} scan failed: ${(error as Error).message}`, 'warning');
    } finally {
      if (db) db.close();
    }
  }

  if (options.outboundId) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Outbound command ${options.outboundId} not found in any scope` },
    };
  }

  fmt.message(`Retried ${retried.length} auth-failed command(s)`, 'success');
  return {
    exitCode: ExitCode.SUCCESS,
    result: { status: 'success', retried, action: 'retry_auth_failed' },
  };
}
