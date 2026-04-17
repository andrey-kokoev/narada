import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import type { RunResult, ScopeConfig, ExchangeFsSyncConfig } from '@narada/exchange-fs-sync';
import {
  loadConfig,
  buildGraphTokenProvider,
  GraphHttpClient,
  DefaultGraphAdapter,
  ExchangeSource,
  DefaultSyncRunner,
  FileCursorStore,
  FileApplyLogStore,
  DefaultProjector,
  cleanupTmp,
  FileLock,
  normalizeFolderRef,
  normalizeFlagged,
  loadMultiMailboxConfig,
  isMultiMailboxConfig,
  syncMultiple,
  formatMultiSyncResult,
} from '@narada/exchange-fs-sync';

export interface SyncOptions {
  config?: string;
  verbose?: boolean;
  dryRun?: boolean;
  format?: 'json' | 'human' | 'auto';
  mailbox?: string;
}

export async function syncCommand(
  options: SyncOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const { configPath, verbose, logger } = context;
  const fmt = createFormatter({ format: options.format, verbose });

  logger.info('Loading config', { path: configPath });

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
    return syncMultiMailbox(options, context, fmt, parsed);
  }

  const config = await loadConfig({ path: configPath });
  const scope = config.scopes[0];
  if (!scope) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: 'No scopes configured' },
    };
  }

  const graphSource = scope.graph ?? scope.sources.find((s) => s.type === 'graph');
  if (!graphSource || !('user_id' in graphSource)) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: 'No graph source configured for first scope' },
    };
  }
  const graph = graphSource as { user_id: string; tenant_id?: string; client_id?: string; client_secret?: string; base_url?: string; prefer_immutable_ids?: boolean };

  const rootDir = resolve(config.root_dir);

  if (options.dryRun) {
    fmt.message('DRY RUN: Fetching and analyzing changes without writing local state', 'warning');
  }

  logger.info('Initializing Graph client', {
    user: graph.user_id,
    scope: scope.scope_id,
  });

  // Set up token provider
  const tokenProvider = buildGraphTokenProvider({ graph: graph as ScopeConfig['graph'] });

  // Create Graph HTTP client
  const graphClient = new GraphHttpClient({
    tokenProvider,
    baseUrl: graph.base_url,
    preferImmutableIds: graph.prefer_immutable_ids ?? true,
  });

  // Create adapter
  const adapter = new DefaultGraphAdapter({
    mailbox_id: scope.scope_id,
    user_id: graph.user_id,
    client: graphClient,
    adapter_scope: {
      mailbox_id: scope.scope_id,
      included_container_refs: scope.scope.included_container_refs,
      included_item_kinds: scope.scope.included_item_kinds,
    },
    body_policy: scope.normalize.body_policy,
    attachment_policy: scope.normalize.attachment_policy,
    include_headers: scope.normalize.include_headers,
    normalize_folder_ref: normalizeFolderRef,
    normalize_flagged: normalizeFlagged,
  });

  // Create persistence stores
  const cursorStore = new FileCursorStore({
    rootDir,
    scopeId: scope.scope_id,
  });

  const applyLogStore = new FileApplyLogStore({ rootDir });

  const projector = new DefaultProjector({
    rootDir,
    tombstonesEnabled: scope.normalize.tombstones_enabled,
  });

  // Create lock mechanism
  const lock = new FileLock({
    rootDir,
    acquireTimeoutMs: scope.runtime.acquire_lock_timeout_ms,
  });

  // Run sync or a read-only preview
  logger.info('Starting sync cycle', { dryRun: options.dryRun });

  const source = new ExchangeSource({ adapter, sourceId: scope.scope_id });

  const result = options.dryRun
    ? await previewSync({ adapter, cursorStore, applyLogStore, logger })
    : await new DefaultSyncRunner({
        rootDir,
        source,
        cursorStore,
        applyLogStore,
        projector,
        cleanupTmp: scope.runtime.cleanup_tmp_on_startup
          ? () => cleanupTmp({ rootDir })
          : undefined,
        acquireLock: () => lock.acquire(),
        rebuildViewsAfterSync: scope.runtime.rebuild_views_after_sync,
      }).syncOnce();

  logger.info('Sync complete', {
    status: result.status,
    applied: result.applied_count,
    skipped: result.skipped_count,
    duration: result.duration_ms,
  });

  // Output based on format
  if (fmt.getFormat() === 'json') {
    return { exitCode: getExitCode(result.status), result };
  }

  // Human-readable output
  outputHumanReadable(fmt, result, options.dryRun);

  return { exitCode: getExitCode(result.status), result };
}

async function syncMultiMailbox(
  options: SyncOptions,
  context: CommandContext,
  fmt: ReturnType<typeof createFormatter>,
  parsed: unknown,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const { configPath, logger } = context;
  const { config, valid } = await loadMultiMailboxConfig({ path: configPath });
  if (!valid) {
    throw new Error('Invalid multi-mailbox configuration');
  }

  if (options.mailbox && !config.mailboxes.some((m) => m.id === options.mailbox)) {
    throw new Error(`Mailbox not found: ${options.mailbox}`);
  }

  if (options.dryRun) {
    fmt.message('DRY RUN: Fetching and analyzing changes without writing local state', 'warning');
    const results: RunResult[] = [];
    const mailboxes = options.mailbox
      ? config.mailboxes.filter((m) => m.id === options.mailbox)
      : config.mailboxes;

    for (const mailbox of mailboxes) {
      logger.info('Previewing mailbox', { mailbox: mailbox.id });
      const tokenProvider = buildGraphTokenProvider({
        config: { graph: mailbox.graph } as ExchangeFsSyncConfig,
      });
      const graphClient = new GraphHttpClient({
        tokenProvider,
        baseUrl: mailbox.graph.base_url,
        preferImmutableIds: mailbox.graph.prefer_immutable_ids,
      });
      const adapter = new DefaultGraphAdapter({
        mailbox_id: mailbox.mailbox_id,
        user_id: mailbox.graph.user_id,
        client: graphClient,
        adapter_scope: {
          mailbox_id: mailbox.mailbox_id,
          included_container_refs: mailbox.scope?.included_container_refs ?? ['inbox', 'sentitems', 'drafts', 'archive'],
          included_item_kinds: mailbox.scope?.included_item_kinds ?? ['message'],
        },
        body_policy: mailbox.sync?.body_policy ?? 'text_only',
        attachment_policy: mailbox.sync?.attachment_policy ?? 'metadata_only',
        include_headers: mailbox.sync?.include_headers ?? false,
        normalize_folder_ref: normalizeFolderRef,
        normalize_flagged: normalizeFlagged,
      });
      const rootDir = resolve(mailbox.root_dir);
      const cursorStore = new FileCursorStore({ rootDir, scopeId: mailbox.mailbox_id });
      const applyLogStore = new FileApplyLogStore({ rootDir });
      const result = await previewSync({ adapter, cursorStore, applyLogStore, logger });
      results.push(result);
    }

    const totalApplied = results.reduce((sum, r) => sum + r.applied_count, 0);
    const totalSkipped = results.reduce((sum, r) => sum + r.skipped_count, 0);
    const totalEvents = results.reduce((sum, r) => sum + r.event_count, 0);

    fmt.message(
      `Dry run completed for ${results.length} mailbox(es) — ${totalApplied} would be updated`,
      'success',
    );
    fmt.section('Summary');
    fmt.kv('Mailboxes', results.length);
    fmt.kv('Total events', totalEvents);
    fmt.kv('Would apply', totalApplied);
    fmt.kv('Already applied', totalSkipped);

    return { exitCode: ExitCode.SUCCESS, result: results };
  }

  logger.info('Starting multi-mailbox sync', {
    mailboxes: config.mailboxes.length,
    filter: options.mailbox ?? 'all',
  });

  const result = await syncMultiple(config, {
    continueOnError: true,
    mailboxIds: options.mailbox ? [options.mailbox] : undefined,
    createTokenProvider: (mailbox) =>
      buildGraphTokenProvider({
        config: { graph: mailbox.graph } as ExchangeFsSyncConfig,
      }),
  });

  logger.info('Multi-mailbox sync complete', {
    successes: result.successes,
    failures: result.failures,
    duration: result.totalDurationMs,
  });

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: result.failures === 0 ? ExitCode.SUCCESS : ExitCode.SYNC_FATAL,
      result,
    };
  }

  console.log(formatMultiSyncResult(result));
  return {
    exitCode: result.failures === 0 ? ExitCode.SUCCESS : ExitCode.SYNC_FATAL,
    result,
  };
}

function getExitCode(status: RunResult['status']): ExitCode {
  switch (status) {
    case 'success':
      return ExitCode.SUCCESS;
    case 'retryable_failure':
      return ExitCode.SYNC_RETRYABLE;
    case 'fatal_failure':
      return ExitCode.SYNC_FATAL;
    default:
      return ExitCode.GENERAL_ERROR;
  }
}

async function previewSync(
  deps: {
    adapter: DefaultGraphAdapter;
    cursorStore: FileCursorStore;
    applyLogStore: FileApplyLogStore;
    logger: CommandContext['logger'];
  },
): Promise<RunResult> {
  const startedAt = Date.now();

  const priorCursor = await deps.cursorStore.read();
  const batch = await deps.adapter.fetch_since(priorCursor);

  let skippedCount = 0;

  for (const event of batch.events) {
    if (await deps.applyLogStore.hasApplied(event.event_id)) {
      skippedCount += 1;
    }
  }

  const appliedCount = batch.events.length - skippedCount;

  deps.logger.info('Dry-run preview complete', {
    priorCursor: priorCursor ? 'set' : 'none',
    nextCursor: batch.next_cursor ? 'set' : 'none',
    eventCount: batch.events.length,
    wouldApply: appliedCount,
    alreadyApplied: skippedCount,
  });

  return {
    prior_cursor: priorCursor,
    next_cursor: batch.next_cursor,
    event_count: batch.events.length,
    applied_count: appliedCount,
    skipped_count: skippedCount,
    duration_ms: Date.now() - startedAt,
    status: 'success',
  };
}

function outputHumanReadable(
  fmt: ReturnType<typeof createFormatter>,
  result: RunResult,
  dryRun?: boolean,
): void {
  const status = result.status;

  if (status === 'success') {
    if (result.applied_count > 0) {
      fmt.message(
        `${dryRun ? 'Dry run completed' : 'Sync completed successfully'} - ${fmt.formatNumber(result.applied_count)} message(s) ${dryRun ? 'would be updated' : 'updated'}`,
        'success'
      );
    } else {
      fmt.message(dryRun ? 'Dry run completed - no new messages' : 'Sync completed - no new messages', 'success');
    }
  } else if (status === 'retryable_failure') {
    fmt.message(`Sync failed (retryable): ${result.error || 'Unknown error'}`, 'warning');
  } else {
    fmt.message(`Sync failed: ${result.error || 'Unknown error'}`, 'error');
  }

  fmt.section('Summary');

  fmt.kv('Status', status === 'success' ? 'Success' : status === 'retryable_failure' ? 'Retryable' : 'Fatal');
  fmt.kv('Messages applied', result.applied_count);
  fmt.kv('Messages skipped', result.skipped_count);
  fmt.kv('Total events', result.event_count);
  fmt.kv('Duration', fmt.duration(result.duration_ms));

  if (result.prior_cursor) {
    fmt.kv('Previous cursor', 'Set');
  } else {
    fmt.kv('Previous cursor', 'None (initial sync)');
  }

  if (result.next_cursor) {
    fmt.kv('New cursor', 'Updated');
  }

  if (dryRun) {
    console.log('');
    fmt.message('This was a dry run. Remote changes were fetched, but cursor, apply-log, messages, and views were not modified.', 'info');
  }

  if (status === 'success' && result.applied_count === 0) {
    console.log('');
    fmt.message('No new messages to sync. The mailbox is up to date.', 'info');
  }

  if (status === 'retryable_failure') {
    console.log('');
    fmt.message('This error may be temporary. You can retry the sync.', 'info');
  }

  if (status === 'fatal_failure') {
    console.log('');
    fmt.message('A fatal error occurred. Please check your configuration and credentials.', 'error');
  }
}
