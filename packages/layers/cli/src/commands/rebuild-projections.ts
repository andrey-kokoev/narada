import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import {
  loadConfig,
  loadMultiMailboxConfig,
  isMultiMailboxConfig,
  FileViewStore,
  ProjectionRebuildRegistry,
} from '@narada2/control-plane';
import { SearchEngine } from '@narada2/search';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';

export interface RebuildProjectionsOptions {
  config?: string;
  verbose?: boolean;
  format?: 'json' | 'human' | 'auto';
  mailbox?: string;
}

interface MailboxRebuildResult {
  mailboxId: string;
  scopeId: string;
  rootDir: string;
  projections: Array<{ name: string; success: boolean; durationMs: number; error?: string }>;
  durationMs: number;
}

export async function rebuildProjectionsCommand(
  options: RebuildProjectionsOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const { configPath, logger } = context;
  const fmt = createFormatter({ format: options.format, verbose: options.verbose });

  logger.info('Loading config', { path: configPath });

  // Read raw config to detect multi-mailbox vs single-config shape
  let parsed: unknown;
  try {
    const raw = await readFile(resolve(configPath), 'utf8');
    parsed = JSON.parse(raw) as unknown;
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
    return rebuildMultiMailbox(options, context, fmt, parsed);
  }

  return rebuildSingleConfig(options, context, fmt);
}

async function rebuildSingleConfig(
  options: RebuildProjectionsOptions,
  context: CommandContext,
  fmt: ReturnType<typeof createFormatter>,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const { configPath, logger } = context;

  const config = await loadConfig({ path: configPath });
  const scope = config.scopes[0];
  if (!scope) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: 'No scopes configured' },
    };
  }

  const rootDir = resolve(config.root_dir);
  const registry = buildProjectionRegistry(rootDir);

  logger.info('Rebuilding projections', { rootDir, scopeId: scope.scope_id, projections: registry.list().map(p => p.name) });

  const startTime = Date.now();
  const results = await registry.rebuildAll();
  const duration = Date.now() - startTime;

  const allSuccess = results.every(r => r.success);

  logger.info('Projections rebuilt', { duration_ms: duration, scopeId: scope.scope_id, results });

  const result = {
    status: allSuccess ? 'success' : 'partial_failure',
    duration_ms: duration,
    scope_id: scope.scope_id,
    root_dir: rootDir,
    projections: results,
  };

  if (fmt.getFormat() === 'json') {
    return { exitCode: allSuccess ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR, result };
  }

  outputHumanReadable(fmt, [{ mailboxId: scope.scope_id, scopeId: scope.scope_id, rootDir, projections: results, durationMs: duration }]);
  return { exitCode: allSuccess ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR, result };
}

async function rebuildMultiMailbox(
  options: RebuildProjectionsOptions,
  context: CommandContext,
  fmt: ReturnType<typeof createFormatter>,
  _parsed: unknown,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const { configPath, logger } = context;

  const { config, valid } = await loadMultiMailboxConfig({ path: configPath });
  if (!valid) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: 'Invalid multi-mailbox configuration' },
    };
  }

  const mailboxes = options.mailbox
    ? config.mailboxes.filter(m => m.id === options.mailbox)
    : config.mailboxes;

  if (options.mailbox && mailboxes.length === 0) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: `Mailbox not found: ${options.mailbox}` },
    };
  }

  logger.info('Rebuilding projections for multi-mailbox config', {
    total: config.mailboxes.length,
    filtered: mailboxes.length,
    filter: options.mailbox ?? 'all',
  });

  const mailboxResults: MailboxRebuildResult[] = [];
  let overallSuccess = true;

  for (const mailbox of mailboxes) {
    const rootDir = resolve(mailbox.root_dir);
    const registry = buildProjectionRegistry(rootDir);

    logger.info('Rebuilding projections for mailbox', {
      mailboxId: mailbox.id,
      scopeId: mailbox.mailbox_id,
      rootDir,
      projections: registry.list().map(p => p.name),
    });

    const startTime = Date.now();
    const results = await registry.rebuildAll();
    const duration = Date.now() - startTime;

    const mailboxSuccess = results.every(r => r.success);
    if (!mailboxSuccess) overallSuccess = false;

    logger.info('Projections rebuilt for mailbox', {
      mailboxId: mailbox.id,
      duration_ms: duration,
      success: mailboxSuccess,
    });

    mailboxResults.push({
      mailboxId: mailbox.id,
      scopeId: mailbox.mailbox_id,
      rootDir,
      projections: results,
      durationMs: duration,
    });
  }

  const totalDuration = mailboxResults.reduce((sum, r) => sum + r.durationMs, 0);

  const result = {
    status: overallSuccess ? 'success' : 'partial_failure',
    duration_ms: totalDuration,
    mailboxes: mailboxResults.map(r => ({
      mailbox_id: r.mailboxId,
      scope_id: r.scopeId,
      root_dir: r.rootDir,
      projections: r.projections,
      duration_ms: r.durationMs,
    })),
  };

  if (fmt.getFormat() === 'json') {
    return { exitCode: overallSuccess ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR, result };
  }

  outputHumanReadable(fmt, mailboxResults);
  return { exitCode: overallSuccess ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR, result };
}

function buildProjectionRegistry(rootDir: string): ProjectionRebuildRegistry {
  const registry = new ProjectionRebuildRegistry();

  const viewStore = new FileViewStore({ rootDir });
  registry.register(viewStore.asProjectionRebuildSurface());

  const messagesDir = join(rootDir, 'messages');
  const searchEngine = new SearchEngine({ rootDir });
  registry.register({
    name: 'search_index',
    authoritativeInput: 'messages/ directory (canonical message records)',
    rebuild: async () => {
      searchEngine.initialize();
      await searchEngine.build(messagesDir);
      searchEngine.close();
    },
  });

  return registry;
}

function outputHumanReadable(
  fmt: ReturnType<typeof createFormatter>,
  mailboxResults: MailboxRebuildResult[],
): void {
  const allProjectionsSuccess = mailboxResults.every(m => m.projections.every(p => p.success));
  const totalDuration = mailboxResults.reduce((sum, r) => sum + r.durationMs, 0);

  if (allProjectionsSuccess) {
    fmt.message('Projections rebuilt successfully', 'success');
  } else {
    fmt.message('Some projections failed to rebuild', 'warning');
  }

  fmt.section('Details');
  fmt.kv('Duration', fmt.duration(totalDuration));
  fmt.kv('Scopes processed', String(mailboxResults.length));

  for (const m of mailboxResults) {
    console.log('');
    fmt.message(`Scope: ${m.scopeId} (${m.rootDir})`, 'info');
    for (const r of m.projections) {
      const status = r.success ? '✓' : '✗';
      const line = `  ${status} ${r.name} (${r.durationMs}ms)`;
      if (r.error) {
        fmt.message(`${line} — ${r.error}`, 'error');
      } else {
        fmt.message(line, r.success ? 'success' : 'error');
      }
    }
  }

  console.log('');
  fmt.message('Rebuilt projection set: filesystem_views, search_index', 'info');
  fmt.message('These non-authoritative surfaces are now consistent with the message store.', 'info');
}
