import { resolve } from 'node:path';
import { join } from 'node:path';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import { loadConfig, isMultiMailboxConfig, loadMultiMailboxConfig } from '@narada2/control-plane';

export interface SelectOptions {
  config?: string;
  verbose?: boolean;
  format?: 'json' | 'human' | 'auto';
  scope?: string;
  contextId?: string;
  since?: string;
  until?: string;
  factIds?: string[];
  limit?: number;
  offset?: number;
}

export async function selectCommand(
  options: SelectOptions,
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

    return selectForScope(targetMailbox.mailbox_id, resolve(targetMailbox.root_dir), options, fmt, logger);
  }

  const config = await loadConfig({ path: configPath });
  const scope = config.scopes.find((s) => s.scope_id === options.scope) ?? config.scopes[0];
  if (!scope) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: 'No operations configured' },
    };
  }

  return selectForScope(scope.scope_id, resolve(scope.root_dir), options, fmt, logger);
}

async function selectForScope(
  scopeId: string,
  rootDir: string,
  options: SelectOptions,
  fmt: ReturnType<typeof createFormatter>,
  logger: CommandContext['logger'],
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const dbDir = join(rootDir, '.narada');
  const factsDbPath = join(dbDir, 'facts.db');

  const { Database, SqliteFactStore } = await import('@narada2/control-plane');

  const factDb = new Database(factsDbPath);

  try {
    const factStore = new SqliteFactStore({ db: factDb });

    const selector = {
      contextIds: options.contextId ? [options.contextId] : undefined,
      since: options.since,
      until: options.until,
      factIds: options.factIds,
      limit: options.limit ?? 100,
      offset: options.offset,
    };

    const facts = factStore.getFactsByScope(scopeId, selector);

    logger.info('Selected facts', {
      scope: scopeId,
      count: facts.length,
      selector,
    });

    if (fmt.getFormat() === 'json') {
      return {
        exitCode: ExitCode.SUCCESS,
        result: {
          status: 'success',
          scope: scopeId,
          selector,
          count: facts.length,
          facts: facts.map((f) => ({
            fact_id: f.fact_id,
            fact_type: f.fact_type,
            created_at: f.created_at,
            provenance: f.provenance,
          })),
        },
      };
    }

    fmt.message(`Selected ${facts.length} facts`, 'success');
    fmt.section('Selector');
    fmt.kv('Operation', scopeId);
    if (selector.contextIds) fmt.kv('Context IDs', selector.contextIds.join(', '));
    if (selector.since) fmt.kv('Since', selector.since);
    if (selector.until) fmt.kv('Until', selector.until);
    if (selector.factIds) fmt.kv('Fact IDs', selector.factIds.join(', '));

    if (selector.limit) fmt.kv('Limit', String(selector.limit));
    if (selector.offset) fmt.kv('Offset', String(selector.offset));

    if (facts.length > 0) {
      fmt.section('Facts');
      for (const fact of facts) {
        fmt.kv(fact.fact_id, `${fact.fact_type} @ ${fact.created_at}`);
      }
    }

    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        scope: scopeId,
        selector,
        count: facts.length,
        facts: facts.map((f) => ({
          fact_id: f.fact_id,
          fact_type: f.fact_type,
          created_at: f.created_at,
          provenance: f.provenance,
        })),
      },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('Selection failed', { error: msg });
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: msg },
    };
  } finally {
    factDb.close();
  }
}
