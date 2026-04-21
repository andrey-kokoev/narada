import { resolve, join } from 'node:path';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import {
  loadConfig,
  isMultiMailboxConfig,
  loadMultiMailboxConfig,
} from '@narada2/control-plane';

export interface ApproveDraftForSendOptions {
  config?: string;
  verbose?: boolean;
  format?: 'json' | 'human' | 'auto';
  outboundId: string;
}

export async function approveDraftForSendCommand(
  options: ApproveDraftForSendOptions,
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

  for (let i = 0; i < scopeIds.length; i++) {
    const dbPath = join(rootDirs[i]!, '.narada', 'coordinator.db');
    let db: import('better-sqlite3').Database | null = null;
    try {
      db = new Database(dbPath);
      const coordinatorStore = new SqliteCoordinatorStore({ db });
      const outboundStore = new SqliteOutboundStore({ db });
      const intentStore = new SqliteIntentStore({ db });

      const command = outboundStore.getCommand(options.outboundId);
      if (!command) continue;

      const result = await executeOperatorAction(
        {
          scope_id: scopeIds[i]!,
          coordinatorStore,
          outboundStore,
          intentStore,
        },
        {
          action_type: 'approve_draft_for_send',
          target_id: options.outboundId,
        },
      );

      if (result.status === 'executed') {
        fmt.message(`Approved draft ${options.outboundId} for send`, 'success');
        return {
          exitCode: ExitCode.SUCCESS,
          result: { status: 'success', outbound_id: options.outboundId, action: 'approve_draft_for_send' },
        };
      }

      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: result.reason },
      };
    } catch (error) {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: (error as Error).message },
      };
    } finally {
      if (db) db.close();
    }
  }

  return {
    exitCode: ExitCode.GENERAL_ERROR,
    result: { status: 'error', error: `Outbound command ${options.outboundId} not found in any scope` },
  };
}
