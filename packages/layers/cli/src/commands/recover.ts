import { resolve } from 'node:path';
import { join } from 'node:path';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import { loadConfig, isMultiMailboxConfig, loadMultiMailboxConfig } from '@narada2/control-plane';
import type { AllowedAction, RuntimePolicy } from '@narada2/control-plane';

export interface RecoverOptions {
  config?: string;
  verbose?: boolean;
  format?: 'json' | 'human' | 'auto';
  scope?: string;
  contextId?: string;
  since?: string;
  factIds?: string[];
  dryRun?: boolean;
}

export async function recoverCommand(
  options: RecoverOptions,
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

    return recoverForScope(
      targetMailbox.mailbox_id,
      resolve(targetMailbox.root_dir),
      options,
      fmt,
      logger,
      targetMailbox.policy,
      'mail',
    );
  }

  const config = await loadConfig({ path: configPath });
  const scope = config.scopes.find((s) => s.scope_id === options.scope) ?? config.scopes[0];
  if (!scope) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: 'No operations configured' },
    };
  }

  return recoverForScope(
    scope.scope_id,
    resolve(scope.root_dir),
    options,
    fmt,
    logger,
    scope.policy,
    scope.context_strategy,
    scope.campaign_request_senders
      ? {
          campaign_request_senders: scope.campaign_request_senders,
          campaign_request_lookback_days: scope.campaign_request_lookback_days,
        }
      : undefined,
  );
}

async function recoverForScope(
  scopeId: string,
  rootDir: string,
  options: RecoverOptions,
  fmt: ReturnType<typeof createFormatter>,
  logger: CommandContext['logger'],
  policy?: RuntimePolicy,
  contextStrategy = 'mail',
  contextStrategyConfig?: unknown,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const dbDir = join(rootDir, '.narada');
  const coordinatorDbPath = join(dbDir, 'coordinator.db');
  const factsDbPath = join(dbDir, 'facts.db');

  // Lazy-load better-sqlite3 to avoid eager native-module load
  const {
    Database,
    SqliteCoordinatorStore,
    SqliteOutboundStore,
    SqliteIntentStore,
    SqliteFactStore,
    DefaultForemanFacade,
    resolveContextStrategy,
  } = await import('@narada2/control-plane');

  const db = new Database(coordinatorDbPath);
  const factDb = new Database(factsDbPath);

  try {
    const coordinatorStore = new SqliteCoordinatorStore({ db });
    const outboundStore = new SqliteOutboundStore({ db });
    const intentStore = new SqliteIntentStore({ db });
    const factStore = new SqliteFactStore({ db: factDb });

    const getRuntimePolicy = () => {
      if (policy) {
        return policy;
      }
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

    let strategy: ReturnType<typeof resolveContextStrategy>;
    try {
      strategy = resolveContextStrategy(contextStrategy, contextStrategyConfig);
    } catch (err) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: {
          status: 'error',
          error: `Unsupported context strategy "${contextStrategy}" for scope ${scopeId}`,
        },
      };
    }

    const foreman = new DefaultForemanFacade({
      coordinatorStore,
      outboundStore,
      intentStore,
      db,
      foremanId: scopeId,
      getRuntimePolicy,
      contextFormationStrategy: strategy,
    });

    const facts = factStore.getFactsByScope(scopeId, {
      contextIds: options.contextId ? [options.contextId] : undefined,
      since: options.since,
      factIds: options.factIds,
      limit: 1000,
    });

    logger.info('Recovering control plane from stored facts', {
      scope: scopeId,
      factCount: facts.length,
      contextId: options.contextId ?? 'all',
      since: options.since ?? 'all time',
      dryRun: options.dryRun ?? false,
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

    if (options.dryRun) {
      const contexts = strategy.formContexts(facts, scopeId, {
        getLatestRevisionOrdinal: (id) => coordinatorStore.getLatestRevisionOrdinal(id),
      });

      const result = {
        status: 'success',
        mode: 'dry_run',
        scope: scopeId,
        facts_matched: facts.length,
        contexts_would_be_admitted: contexts.map((c: import('@narada2/control-plane').PolicyContext) => ({
          context_id: c.context_id,
          revision_id: c.revision_id,
          change_kinds: c.change_kinds,
          fact_count: c.facts.length,
        })),
        recoverable: [
          'context_records (upserted from policy and facts)',
          'context_revisions (ordinal advancement)',
          'work_items (opened or superseded)',
          'agent_sessions (opened for new work)',
        ],
        not_recoverable: [
          'Active leases — must be re-acquired by scheduler',
          'In-flight execution attempts — must be restarted by runner',
          'Submitted outbound effects — confirmation requires inbound reconciliation',
          'Operator action request history',
          'Agent traces (non-authoritative, rebuildable)',
        ],
      };

      if (fmt.getFormat() === 'json') {
        return { exitCode: ExitCode.SUCCESS, result };
      }

      fmt.message(`Dry-run recovery complete — ${contexts.length} contexts would be admitted`, 'success');
      fmt.section('Summary');
      fmt.kv('Operation', scopeId);
      fmt.kv('Facts matched', facts.length);
      fmt.kv('Contexts', contexts.length);

      fmt.section('Recoverable');
      for (const item of result.recoverable) {
        fmt.list([item]);
      }

      fmt.section('Not recoverable from facts alone');
      for (const item of result.not_recoverable) {
        fmt.list([item]);
      }

      return { exitCode: ExitCode.SUCCESS, result };
    }

    const result = await foreman.recoverFromStoredFacts(facts, scopeId);

    logger.info('Control-plane recovery complete', {
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
          mode: 'recovery',
          scope: scopeId,
          facts_matched: facts.length,
          opened: result.opened,
          superseded: result.superseded,
          nooped: result.nooped,
          not_recoverable: [
            'Active leases — must be re-acquired by scheduler',
            'In-flight execution attempts — must be restarted by runner',
            'Submitted outbound effects — confirmation requires inbound reconciliation',
            'Operator action request history',
            'Agent traces (non-authoritative, rebuildable)',
          ],
        },
      };
    }

    fmt.message(
      `Recovery complete — ${result.opened.length} opened, ${result.superseded.length} superseded, ${result.nooped.length} nooped`,
      'success',
    );
    fmt.section('Summary');
    fmt.kv('Operation', scopeId);
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

    fmt.section('Not recoverable from facts alone');
    fmt.message('The following state requires live system or external confirmation:', 'warning');
    fmt.list([
      'Active leases — must be re-acquired by scheduler',
      'In-flight execution attempts — must be restarted by runner',
      'Submitted outbound effects — confirmation requires inbound reconciliation',
      'Operator action request history',
      'Agent traces (non-authoritative, rebuildable)',
    ]);

    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        mode: 'recovery',
        scope: scopeId,
        facts_matched: facts.length,
        opened: result.opened,
        superseded: result.superseded,
        nooped: result.nooped,
      },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('Control-plane recovery failed', { error: msg });
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: msg },
    };
  } finally {
    db.close();
    factDb.close();
  }
}
