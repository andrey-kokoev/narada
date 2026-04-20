import { resolve } from 'node:path';
import { join } from 'node:path';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import { loadConfig, isMultiMailboxConfig, loadMultiMailboxConfig } from '@narada2/control-plane';

export interface ConfirmReplayOptions {
  config?: string;
  verbose?: boolean;
  format?: 'json' | 'human' | 'auto';
  scope?: string;
  intentIds?: string[];
  outboundIds?: string[];
  limit?: number;
}

export async function confirmReplayCommand(
  options: ConfirmReplayOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const { configPath, verbose, logger } = context;
  const fmt = createFormatter({ format: options.format, verbose });

  logger.info('Loading config', { path: configPath });

  let parsed: unknown;
  try {
    const { readFile } = await import('node:fs/promises');
    const raw = await readFile(configPath, 'utf8');
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: {
        status: 'error',
        error: 'Failed to load config: ' + (error as Error).message,
      },
    };
  }

  if (isMultiMailboxConfig(parsed)) {
    const { config, valid } = await loadMultiMailboxConfig({ path: configPath });
    if (!valid) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: { status: 'error', error: 'Invalid multi-mailbox configuration' },
      };
    }

    const targetMailbox = options.scope
      ? config.mailboxes.find((m) => m.id === options.scope)
      : config.mailboxes[0];

    if (!targetMailbox) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: { status: 'error', error: options.scope ? `Mailbox not found: ${options.scope}` : 'No mailboxes configured' },
      };
    }

    return replayForScope(
      targetMailbox.mailbox_id,
      resolve(targetMailbox.root_dir),
      options,
      fmt,
      logger,
      targetMailbox.graph,
    );
  }

  const config = await loadConfig({ path: configPath });
  const scope = options.scope
    ? config.scopes.find((s) => s.scope_id === options.scope)
    : config.scopes[0];
  if (!scope) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: {
        status: 'error',
        error: options.scope ? `Scope not found: ${options.scope}` : 'No scopes configured',
      },
    };
  }

  const graphSource = scope.graph ?? scope.sources.find((s) => s.type === 'graph');
  return replayForScope(
    scope.scope_id,
    resolve(scope.root_dir),
    options,
    fmt,
    logger,
    graphSource && 'user_id' in graphSource ? graphSource as { user_id: string; base_url?: string } : undefined,
  );
}

type CpLogger = {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: Error, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  child(context: string): CpLogger;
  readonly context: string;
};

function adaptLogger(logger: CommandContext['logger']): CpLogger {
  return {
    info: (msg: string, meta?: Record<string, unknown>) => logger.info(msg, meta),
    warn: (msg: string, meta?: Record<string, unknown>) => logger.warn(msg, meta),
    error: (msg: string, err?: Error, meta?: Record<string, unknown>) => logger.error(msg, err ?? meta),
    debug: (msg: string, meta?: Record<string, unknown>) => logger.debug(msg, meta),
    child: () => adaptLogger(logger),
    context: 'confirm-replay',
  };
}

async function replayForScope(
  scopeId: string,
  rootDir: string,
  options: ConfirmReplayOptions,
  fmt: ReturnType<typeof createFormatter>,
  logger: CommandContext['logger'],
  graphSource?: { user_id: string; base_url?: string },
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const dbDir = join(rootDir, '.narada');
  const coordinatorDbPath = join(dbDir, 'coordinator.db');

  const {
    Database,
    SqliteCoordinatorStore,
    SqliteOutboundStore,
    SqliteIntentStore,
    SqliteProcessExecutionStore,
    ConfirmationReplay,
    GraphHttpClient,
    buildGraphTokenProvider,
  } = await import('@narada2/control-plane');

  const db = new Database(coordinatorDbPath);

  try {
    const coordinatorStore = new SqliteCoordinatorStore({ db });
    const outboundStore = new SqliteOutboundStore({ db });
    const intentStore = new SqliteIntentStore({ db });
    const processStore = new SqliteProcessExecutionStore({ db });

    let messageFinder;

    if (graphSource) {
      try {
        const tokenProvider = buildGraphTokenProvider({
          config: { graph: graphSource } as import('@narada2/control-plane').ExchangeFsSyncConfig,
        });
        const graphHttpClient = new GraphHttpClient({
          tokenProvider,
          baseUrl: graphSource.base_url,
          preferImmutableIds: true,
        });
        const userId = graphSource.user_id;

        messageFinder = {
          findByOutboundId: async (_mailboxId: string, outboundId: string) => {
            try {
              const result = await graphHttpClient.getJson<{ value: Array<{ id: string; isRead?: boolean; parentFolderId?: string; categories?: string[] }> }>(
                `/users/${encodeURIComponent(userId)}/messages?$filter=internetMessageHeaders/any(h:h/name%20eq%20'X-Outbound-Id'%20and%20h/value%20eq%20'${encodeURIComponent(outboundId)}')&$select=id,isRead,parentFolderId,categories`,
              );
              const msg = result.value?.[0];
              if (!msg) return undefined;
              return {
                messageId: msg.id,
                isRead: msg.isRead,
                folderRefs: msg.parentFolderId ? [msg.parentFolderId] : undefined,
                categoryRefs: msg.categories,
              };
            } catch {
              return undefined;
            }
          },
          findByMessageId: async (_mailboxId: string, messageId: string) => {
            try {
              const msg = await graphHttpClient.getJson<{ id: string; isRead?: boolean; parentFolderId?: string; categories?: string[] }>(
                `/users/${encodeURIComponent(userId)}/messages/${encodeURIComponent(messageId)}?$select=id,isRead,parentFolderId,categories`,
              );
              return {
                messageId: msg.id,
                isRead: msg.isRead,
                folderRefs: msg.parentFolderId ? [msg.parentFolderId] : undefined,
                categoryRefs: msg.categories,
              };
            } catch {
              return undefined;
            }
          },
        };
      } catch (err) {
        logger.warn('Failed to build Graph message finder; mail confirmation replay will be skipped', {
          error: (err as Error).message,
        });
      }
    }

    const cpLogger = adaptLogger(logger);
    const replay = new ConfirmationReplay({
      processStore,
      outboundStore,
      intentStore,
      messageFinder,
      logger: cpLogger,
      confirmWindowMs: 300_000, // 5 minutes
    });

    const result = await replay.replay({
      scopeId,
      intentIds: options.intentIds,
      outboundIds: options.outboundIds,
      limit: options.limit ?? 50,
    });

    logger.info('Confirmation replay completed', {
      scope: scopeId,
      processed: result.processed,
      confirmed: result.confirmed,
      confirmation_failed: result.confirmation_failed,
      still_unconfirmed: result.still_unconfirmed,
    });

    if (fmt.getFormat() === 'json') {
      return {
        exitCode: ExitCode.SUCCESS,
        result: {
          status: 'success',
          scope: scopeId,
          ...result,
        },
      };
    }

    fmt.message(`Confirmation replay complete for ${scopeId}`, 'info');
    fmt.message(`  Processed: ${result.processed}`, 'info');
    fmt.message(`  Confirmed: ${result.confirmed}`, 'info');
    fmt.message(`  Confirmation failed: ${result.confirmation_failed}`, 'info');
    fmt.message(`  Still unconfirmed: ${result.still_unconfirmed}`, 'info');

    if (result.details.length > 0 && options.verbose) {
      fmt.message('Details:', 'info');
      for (const d of result.details) {
        const id = d.intent_id ?? d.outbound_id ?? d.execution_id ?? 'unknown';
        fmt.message(`  ${id}: ${d.previous_status} → ${d.new_status}${d.evidence ? ` (${d.evidence})` : ''}`, 'info');
      }
    }

    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        scope: scopeId,
        ...result,
      },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('Confirmation replay failed', { error: msg });
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: msg },
    };
  } finally {
    db.close();
  }
}
