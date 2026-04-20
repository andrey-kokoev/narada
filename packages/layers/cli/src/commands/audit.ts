import { resolve } from 'node:path';
import { join } from 'node:path';
import { stat } from 'node:fs/promises';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import { loadConfig, isMultiMailboxConfig, loadMultiMailboxConfig } from '@narada2/control-plane';

export interface AuditOptions {
  config?: string;
  verbose?: boolean;
  format?: 'json' | 'human' | 'auto';
  scope?: string;
  contextId?: string;
  limit?: number;
  since?: string;
}

export async function auditCommand(
  options: AuditOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const { configPath, verbose, logger } = context;
  const fmt = createFormatter({ format: options.format, verbose });

  logger.info('Loading config', { path: configPath });

  let raw: string;
  try {
    const { readFile } = await import('node:fs/promises');
    raw = await readFile(configPath, 'utf8');
  } catch (error) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: {
        status: 'error',
        error: 'Failed to read config: ' + (error as Error).message,
      },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: {
        status: 'error',
        error: 'Failed to parse config: ' + (error as Error).message,
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
        result: {
          status: 'error',
          error: options.scope ? `Mailbox not found: ${options.scope}` : 'No mailboxes configured',
        },
      };
    }

    return auditForScope(targetMailbox.mailbox_id, resolve(targetMailbox.root_dir), options, fmt, logger);
  }

  const config = await loadConfig({ path: configPath });

  let scope: typeof config.scopes[0] | undefined;
  if (options.scope) {
    scope = config.scopes.find((s) => s.scope_id === options.scope);
    if (!scope) {
      return {
        exitCode: ExitCode.INVALID_CONFIG,
        result: { status: 'error', error: `Operation not found: ${options.scope}` },
      };
    }
  } else {
    scope = config.scopes[0];
  }

  if (!scope) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: 'No operations configured' },
    };
  }

  return auditForScope(scope.scope_id, resolve(scope.root_dir), options, fmt, logger);
}

async function auditForScope(
  scopeId: string,
  rootDir: string,
  options: AuditOptions,
  fmt: ReturnType<typeof createFormatter>,
  logger: CommandContext['logger'],
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const dbPath = join(rootDir, '.narada', 'coordinator.db');

  try {
    const dbStat = await stat(dbPath);
    if (!dbStat.isFile()) {
      return {
        exitCode: ExitCode.GENERAL_ERROR,
        result: { status: 'error', error: `Coordinator database not found at ${dbPath}` },
      };
    }
  } catch {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Coordinator database not found at ${dbPath}` },
    };
  }

  const {
    Database,
    getOperatorActionsForScope,
    getOperatorActionsForContext,
  } = await import('@narada2/control-plane');

  const db = new Database(dbPath);
  try {
    const limit = options.limit ?? 50;
    const since = options.since;

    let actions;
    if (options.contextId) {
      actions = getOperatorActionsForContext({ db }, options.contextId, limit, since);
    } else {
      actions = getOperatorActionsForScope({ db }, scopeId, limit, since);
    }

    logger.info('Loaded operator actions', { scope: scopeId, count: actions.length });

    if (fmt.getFormat() === 'json') {
      return {
        exitCode: ExitCode.SUCCESS,
        result: {
          status: 'success',
          scope: scopeId,
          context_id: options.contextId ?? null,
          count: actions.length,
          actions,
        },
      };
    }

    fmt.message(`Found ${actions.length} operator actions`, 'success');
    fmt.section('Audit log');
    if (options.contextId) fmt.kv('Context ID', options.contextId);
    if (since) fmt.kv('Since', since);

    if (actions.length > 0) {
      fmt.table(
        [
          { key: 'created_at', label: 'Timestamp', width: 22 },
          { key: 'action_type', label: 'Action', width: 24 },
          { key: 'actor', label: 'Actor', width: 10 },
          { key: 'context_id', label: 'Context', width: 28 },
          { key: 'work_item_id', label: 'Work item', width: 28 },
          { key: 'payload_summary', label: 'Summary', width: 30 },
        ] as Array<{ key: keyof typeof actions[0]; label: string; width?: number }>,
        actions.map((a) => ({
          ...a,
          created_at: a.created_at ? new Date(a.created_at).toLocaleString() : '—',
          context_id: a.context_id ?? '—',
          work_item_id: a.work_item_id ?? '—',
          payload_summary: a.payload_summary ?? '—',
        })),
      );
    }

    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        scope: scopeId,
        context_id: options.contextId ?? null,
        count: actions.length,
        actions,
      },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('Audit query failed', { error: msg });
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: msg },
    };
  } finally {
    db.close();
  }
}
