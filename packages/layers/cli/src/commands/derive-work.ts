import { resolve } from 'node:path';
import { join } from 'node:path';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import { loadConfig, isMultiMailboxConfig, loadMultiMailboxConfig } from '@narada2/control-plane';
import type { AllowedAction, RuntimePolicy } from '@narada2/control-plane';

export interface DeriveWorkOptions {
  config?: string;
  verbose?: boolean;
  format?: 'json' | 'human' | 'auto';
  scope?: string;
  contextId?: string;
  since?: string;
  factIds?: string[];
}

export async function deriveWorkCommand(
  options: DeriveWorkOptions,
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

    return deriveForScope(
      targetMailbox.mailbox_id,
      resolve(targetMailbox.root_dir),
      options,
      fmt,
      logger,
      targetMailbox.policy,
    );
  }

  const config = await loadConfig({ path: configPath });
  const scope = config.scopes.find((s) => s.scope_id === options.scope) ?? config.scopes[0];
  if (!scope) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: 'No scopes configured' },
    };
  }

  return deriveForScope(scope.scope_id, resolve(scope.root_dir), options, fmt, logger, scope.policy);
}

async function deriveForScope(
  scopeId: string,
  rootDir: string,
  options: DeriveWorkOptions,
  fmt: ReturnType<typeof createFormatter>,
  logger: CommandContext['logger'],
  policy?: RuntimePolicy,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const dbDir = join(rootDir, '.narada');
  const coordinatorDbPath = join(dbDir, 'coordinator.db');
  const factsDbPath = join(dbDir, 'facts.db');

  // Lazy-load better-sqlite3 to avoid eager native-module load
  const { Database, SqliteCoordinatorStore, SqliteOutboundStore, SqliteIntentStore, SqliteFactStore, DefaultForemanFacade, MailboxContextStrategy } = await import(
    '@narada2/control-plane'
  );

  const db = new Database(coordinatorDbPath);
  const factDb = new Database(factsDbPath);

  try {
    const coordinatorStore = new SqliteCoordinatorStore({ db });
    const outboundStore = new SqliteOutboundStore({ db });
    const intentStore = new SqliteIntentStore({ db });
    const factStore = new SqliteFactStore({ db: factDb });

    const getRuntimePolicy = () => {
      // Use the scope's configured policy from the config file, matching
      // daemon behavior (service.ts: getRuntimePolicy = (_scopeId) => scope.policy).
      // This ensures replay-derived contexts bind to the correct charter.
      if (policy) {
        return policy;
      }
      // Fallback: look up an existing context record (for scopes with no
      // configured policy, e.g. legacy configs or manual db manipulation).
      const record = coordinatorStore.getContextRecord(options.contextId ?? '');
      if (record) {
        const secondary = JSON.parse(record.secondary_charters_json) as string[];
        return {
          primary_charter: record.primary_charter,
          secondary_charters: secondary.length > 0 ? secondary : undefined,
          allowed_actions: ['draft_reply', 'send_reply', 'move_message', 'flag_message', 'create_task', 'update_task'] as AllowedAction[],
        };
      }
      return {
        primary_charter: 'default',
        allowed_actions: ['draft_reply', 'send_reply', 'move_message', 'flag_message', 'create_task', 'update_task'] as AllowedAction[],
      };
    };

    const foreman = new DefaultForemanFacade({
      coordinatorStore,
      outboundStore,
      intentStore,
      db,
      foremanId: scopeId,
      getRuntimePolicy,
      contextFormationStrategy: new MailboxContextStrategy(),
    });

    const facts = factStore.getFactsByScope(scopeId, {
      contextIds: options.contextId ? [options.contextId] : undefined,
      since: options.since,
      factIds: options.factIds,
      limit: 1000,
    });

    logger.info('Deriving work from stored facts', {
      scope: scopeId,
      factCount: facts.length,
      contextId: options.contextId ?? 'all',
      since: options.since ?? 'all time',
    });

    if (facts.length === 0) {
      fmt.message('No stored facts matched the selection criteria.', 'warning');
      return {
        exitCode: ExitCode.SUCCESS,
        result: {
          status: 'success',
          scope: scopeId,
          facts_matched: 0,
          opened: [],
          superseded: [],
          nooped: [],
          message: 'No facts matched the selection criteria.',
        },
      };
    }

    const result = await foreman.deriveWorkFromStoredFacts(facts, scopeId);

    logger.info('Work derivation complete', {
      scope: scopeId,
      opened: result.opened.length,
      superseded: result.superseded.length,
      nooped: result.nooped.length,
    });

    if (fmt.getFormat() === 'json') {
      return {
        exitCode: ExitCode.SUCCESS,
        result: {
          status: 'success',
          scope: scopeId,
          facts_matched: facts.length,
          opened: result.opened,
          superseded: result.superseded,
          nooped: result.nooped,
        },
      };
    }

    fmt.message(
      `Work derivation complete — ${result.opened.length} opened, ${result.superseded.length} superseded, ${result.nooped.length} nooped`,
      'success',
    );
    fmt.section('Summary');
    fmt.kv('Scope', scopeId);
    fmt.kv('Facts matched', facts.length);
    fmt.kv('Opened', result.opened.length);
    fmt.kv('Superseded', result.superseded.length);
    fmt.kv('Nooped', result.nooped.length);

    if (result.opened.length > 0) {
      fmt.section('Opened work items');
      for (const item of result.opened) {
        fmt.kv(item.context_id, item.work_item_id);
      }
    }

    if (result.superseded.length > 0) {
      fmt.section('Superseded work items');
      for (const item of result.superseded) {
        fmt.kv(item.context_id, `${item.work_item_id} → ${item.new_work_item_id}`);
      }
    }

    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        scope: scopeId,
        facts_matched: facts.length,
        opened: result.opened,
        superseded: result.superseded,
        nooped: result.nooped,
      },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('Work derivation failed', { error: msg });
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: msg },
    };
  } finally {
    db.close();
    factDb.close();
  }
}
