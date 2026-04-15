/**
 * Sync Service - Long-running polling daemon core
 */

import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import {
  loadConfig,
  buildGraphTokenProvider,
  GraphHttpClient,
  DefaultGraphAdapter,
  ExchangeSource,
  DefaultSyncRunner,
  FileCursorStore,
  FileApplyLogStore,
  FileMessageStore,
  FileTombstoneStore,
  FileViewStore,
  FileBlobStore,
  FileLock,
  applyEvent,
  cleanupTmp,
  normalizeFolderRef,
  normalizeFlagged,
  isMultiMailboxConfig,
  loadMultiMailboxConfig,
  syncMultiple,
  writeMultiMailboxHealth,
  Database,
  SqliteCoordinatorStore,
  SqliteOutboundStore,
  SqliteAgentTraceStore,
  SqliteFactStore,
  SqliteIntentStore,
  SqliteProcessExecutionStore,
  ProcessExecutor,
  DefaultWorkerRegistry,
  drainWorker,
  DefaultForemanFacade,
  SqliteScheduler,
  MockCharterRunner,
  buildInvocationEnvelope,
  buildEvaluationRecord,
  validateCharterRuntimeConfig,
  loadCharterEnv,
  type ExchangeFsSyncConfig,
  type NormalizedEvent,
  type ApplyEventResult,
  type SyncCompletionSignal,
  type ChangedConversation,
  type CharterRunner,
  type GraphAdapter,
  type WorkItem,
  type ExecutionAttempt,
  type LeaseAcquisitionResult,
  type SchedulerOptions,
  type ToolCatalogEntry,
  DEFAULT_EXCHANGE_FS_SYNC_CONFIG,
  type MailboxConfig,
} from '@narada/exchange-fs-sync';
import { CodexCharterRunner, ToolRunner } from '@narada/charters';
import type { ToolDefinition, ToolInvocationRequest } from '@narada/charters';
import { createLogger } from './lib/logger.js';
import { PidFile } from './lib/pid-file.js';
import { HealthFile, type HealthStatus } from './lib/health.js';

export interface SyncServiceConfig {
  configPath: string;
  verbose?: boolean;
  pidFilePath?: string;
  /** Override the Graph adapter (for testing) */
  adapter?: GraphAdapter;
  /** Override the charter runner (for testing) */
  charterRunner?: CharterRunner;
  /** Override polling interval in ms (for testing) */
  pollingIntervalMs?: number;
  dispatchHooks?: DispatchHooks;
  schedulerOptions?: Partial<SchedulerOptions>;
  toolCatalog?: ToolCatalogEntry[];
  toolDefinitions?: Record<string, ToolDefinition>;
}

export interface DispatchHooks {
  afterSyncCompleted?: (signal: import("@narada/exchange-fs-sync").SyncCompletionSignal, result: import("@narada/exchange-fs-sync").WorkOpeningResult) => Promise<void>;
  afterWorkOpened?: (workItem: WorkItem) => Promise<void>;
  afterLeaseAcquired?: (workItem: WorkItem, lease: LeaseAcquisitionResult) => Promise<void>;
  beforeRuntimeInvoke?: (workItem: WorkItem, attempt: ExecutionAttempt, envelope: import("@narada/exchange-fs-sync").CharterInvocationEnvelope) => Promise<void>;
  afterRuntimeComplete?: (workItem: WorkItem, attempt: ExecutionAttempt, output: import("@narada/exchange-fs-sync").CharterOutputEnvelope) => Promise<void>;
  beforeToolExecution?: (workItem: WorkItem, attempt: ExecutionAttempt, requests: ToolInvocationRequest[]) => Promise<void>;
  duringToolExecution?: (workItem: WorkItem, attempt: ExecutionAttempt, request: ToolInvocationRequest, index: number) => Promise<void>;
  afterToolExecution?: (workItem: WorkItem, attempt: ExecutionAttempt) => Promise<void>;
  beforeResolveWorkItem?: (workItem: WorkItem, attempt: ExecutionAttempt, evaluation: ReturnType<typeof buildEvaluationRecord>) => Promise<void>;
}

export interface SyncService {
  start(): Promise<void>;
  stop(): Promise<void>;
  getStats(): SyncStats;
}

export interface SyncStats {
  cyclesCompleted: number;
  eventsApplied: number;
  lastSyncAt: Date | null;
  errors: number;
  consecutiveErrors: number;
  perMailbox?: Record<string, {
    cyclesCompleted: number;
    eventsApplied: number;
    errors: number;
    lastSyncAt: Date | null;
  }>;
}

/**
 * Exponential backoff for error handling
 */
class ExponentialBackoff {
  private delay: number;
  private readonly initialDelay: number;
  private readonly maxDelay: number;

  constructor(initialDelayMs = 5000, maxDelayMs = 300000) {
    this.initialDelay = initialDelayMs;
    this.maxDelay = maxDelayMs;
    this.delay = initialDelayMs;
  }

  next(): number {
    const current = this.delay;
    this.delay = Math.min(this.delay * 2, this.maxDelay);
    return current;
  }

  reset(): void {
    this.delay = this.initialDelay;
  }

  get currentDelay(): number {
    return this.delay;
  }
}


function mailboxConfigToSingleConfig(mailbox: MailboxConfig): ExchangeFsSyncConfig {
  return {
    mailbox_id: mailbox.mailbox_id,
    root_dir: mailbox.root_dir,
    graph: {
      tenant_id: mailbox.graph.tenant_id,
      client_id: mailbox.graph.client_id,
      client_secret: mailbox.graph.client_secret,
      user_id: mailbox.graph.user_id,
      base_url: mailbox.graph.base_url,
      prefer_immutable_ids: mailbox.graph.prefer_immutable_ids,
    },
    scope: {
      included_container_refs: mailbox.scope?.included_container_refs ?? ["inbox", "sentitems", "drafts", "archive"],
      included_item_kinds: mailbox.scope?.included_item_kinds ?? ["message"],
    },
    normalize: {
      attachment_policy: mailbox.sync?.attachment_policy ?? DEFAULT_EXCHANGE_FS_SYNC_CONFIG.normalize.attachment_policy,
      body_policy: mailbox.sync?.body_policy ?? DEFAULT_EXCHANGE_FS_SYNC_CONFIG.normalize.body_policy,
      include_headers: mailbox.sync?.include_headers ?? DEFAULT_EXCHANGE_FS_SYNC_CONFIG.normalize.include_headers,
      tombstones_enabled: mailbox.sync?.tombstones_enabled ?? DEFAULT_EXCHANGE_FS_SYNC_CONFIG.normalize.tombstones_enabled,
    },
    runtime: {
      polling_interval_ms: mailbox.sync?.polling_interval_ms ?? DEFAULT_EXCHANGE_FS_SYNC_CONFIG.runtime.polling_interval_ms,
      acquire_lock_timeout_ms: mailbox.sync?.acquire_lock_timeout_ms ?? DEFAULT_EXCHANGE_FS_SYNC_CONFIG.runtime.acquire_lock_timeout_ms,
      cleanup_tmp_on_startup: mailbox.sync?.cleanup_tmp_on_startup ?? DEFAULT_EXCHANGE_FS_SYNC_CONFIG.runtime.cleanup_tmp_on_startup,
      rebuild_views_after_sync: mailbox.sync?.rebuild_views_after_sync ?? DEFAULT_EXCHANGE_FS_SYNC_CONFIG.runtime.rebuild_views_after_sync,
    },
    lifecycle: mailbox.lifecycle ?? DEFAULT_EXCHANGE_FS_SYNC_CONFIG.lifecycle,
    charter: mailbox.charter ?? DEFAULT_EXCHANGE_FS_SYNC_CONFIG.charter,
    policy: mailbox.policy ?? DEFAULT_EXCHANGE_FS_SYNC_CONFIG.policy,
    ...(mailbox.webhook ? { webhook: mailbox.webhook } : {}),
  };
}

const phaseAToolCatalog: ToolCatalogEntry[] = [
  {
    tool_id: "echo_test",
    tool_signature: "echo_test(input: string)",
    description: "Echoes input for testing tool execution path",
    schema_args: [{ name: "input", type: "string", required: true, description: "Input to echo" }],
    read_only: true,
    requires_approval: false,
    timeout_ms: 5000,
  },
];

const phaseAToolDefinitions: Record<string, ToolDefinition> = {
  echo_test: {
    id: "echo_test",
    source_type: "local_executable",
    executable_path: process.platform === "win32" ? "cmd" : "/bin/echo",
  },
};

function createDefaultCharterRunner(
  cfg: ExchangeFsSyncConfig,
  store: InstanceType<typeof SqliteCoordinatorStore>,
): CharterRunner {
  const env = loadCharterEnv();
  const runtime = cfg.charter?.runtime ?? 'mock';

  if (runtime === 'codex-api') {
    const apiKey = cfg.charter?.api_key ?? env.openai_api_key;
    return new CodexCharterRunner(
      {
        apiKey: apiKey!,
        model: cfg.charter?.model,
        baseUrl: cfg.charter?.base_url,
        timeoutMs: cfg.charter?.timeout_ms,
      },
      {
        persistTrace: (trace) => {
          try {
            store.db
              .prepare(
                `insert into agent_traces (trace_id, execution_id, envelope_json, reasoning_log, created_at)
                 values (?, ?, ?, ?, ?)
                 on conflict(trace_id) do update set envelope_json=excluded.envelope_json, reasoning_log=excluded.reasoning_log`,
              )
              .run(trace.trace_id, trace.execution_id, trace.envelope_json, trace.reasoning_log ?? null, trace.created_at);
          } catch {
            // Ignore trace persistence errors
          }
        },
      },
    ) as unknown as CharterRunner;
  }

  if (runtime === 'mock') {
    return new MockCharterRunner({
      output: {
        output_version: '2.0',
        execution_id: 'mock-exec',
        charter_id: 'support_steward',
        role: 'primary',
        analyzed_at: new Date().toISOString(),
        outcome: 'no_op',
        confidence: { overall: 'high', uncertainty_flags: [] },
        summary: 'Mock evaluation: no action required',
        classifications: [],
        facts: [],
        proposed_actions: [],
        tool_requests: [],
        escalations: [],
      },
    });
  }

  throw new Error(`Invalid charter runtime: ${runtime}. Expected 'codex-api' or 'mock'.`);
}

async function createMailboxDispatchContext(
  config: ExchangeFsSyncConfig,
  opts: SyncServiceConfig,
  logger: ReturnType<typeof createLogger>,
) {
  const rootDir = config.root_dir;
  const messageStore = new FileMessageStore({ rootDir });

  let dispatchDeps: {
    db: InstanceType<typeof Database>;
    coordinatorStore: InstanceType<typeof SqliteCoordinatorStore>;
    outboundStore: InstanceType<typeof SqliteOutboundStore>;
    intentStore: InstanceType<typeof SqliteIntentStore>;
    traceStore: InstanceType<typeof SqliteAgentTraceStore>;
    foreman: InstanceType<typeof DefaultForemanFacade>;
    scheduler: InstanceType<typeof SqliteScheduler>;
    charterRunner: CharterRunner;
    toolCatalog: ToolCatalogEntry[];
    toolDefinitions: Record<string, ToolDefinition>;
    workerRegistry: InstanceType<typeof DefaultWorkerRegistry>;
    processExecutionStore: InstanceType<typeof SqliteProcessExecutionStore>;
    processExecutor: InstanceType<typeof ProcessExecutor>;
  } | null = null;

  async function initDispatchDeps(): Promise<NonNullable<typeof dispatchDeps>> {
    if (dispatchDeps) {
      return dispatchDeps;
    }

    const dbDir = join(rootDir, '.narada');
    await mkdir(dbDir, { recursive: true });
    const dbPath = join(dbDir, 'coordinator.db');

    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    const coordinatorStore = new SqliteCoordinatorStore({ db });
    coordinatorStore.initSchema();

    const outboundStore = new SqliteOutboundStore({ db });
    outboundStore.initSchema();

    const intentStore = new SqliteIntentStore({ db });
    intentStore.initSchema();

    const traceStore = new SqliteAgentTraceStore({ db });
    traceStore.initSchema();

    const getRuntimePolicy = (_mailboxId: string) => config.policy ?? {
      primary_charter: 'support_steward',
      allowed_actions: ['draft_reply', 'send_reply', 'send_new_message', 'mark_read', 'move_message', 'archive', 'no_action'],
    };

    const foreman = new DefaultForemanFacade({
      coordinatorStore,
      outboundStore,
      intentStore,
      db,
      foremanId: config.mailbox_id,
      getRuntimePolicy,
    });

    const scheduler = new SqliteScheduler(coordinatorStore, {
      runnerId: config.mailbox_id,
      ...opts.schedulerOptions,
    });

    const charterRunner = opts.charterRunner ?? createDefaultCharterRunner(config, coordinatorStore);
    const toolCatalog = opts.toolCatalog ?? phaseAToolCatalog;
    const toolDefinitions = opts.toolDefinitions ?? phaseAToolDefinitions;

    const processExecutionStore = new SqliteProcessExecutionStore({ db });
    processExecutionStore.initSchema();

    const processExecutor = new ProcessExecutor({ intentStore, executionStore: processExecutionStore });

    const workerRegistry = new DefaultWorkerRegistry();
    workerRegistry.register({
      identity: {
        worker_id: 'process_executor',
        executor_family: 'process',
        concurrency_policy: 'singleton',
        description: 'Executes process.run intents via local subprocess',
      },
      fn: () => processExecutor.processNext(),
    });

    dispatchDeps = { db, coordinatorStore, outboundStore, intentStore, traceStore, foreman, scheduler, charterRunner, toolCatalog, toolDefinitions, processExecutionStore, workerRegistry, processExecutor };
    return dispatchDeps;
  }

  async function runDispatchPhase(
    changedConversations: Map<string, Set<ChangedConversation['change_kinds'][number]>>,
  ): Promise<void> {
    const deps = await initDispatchDeps();
    const now = new Date().toISOString();

    if (changedConversations.size > 0) {
      const changed: ChangedConversation[] = [];
      for (const [conversationId, kindsSet] of changedConversations) {
        const previousOrdinal = deps.coordinatorStore.getLatestRevisionOrdinal(conversationId);
        const currentOrdinal = (previousOrdinal ?? 0) + 1;
        changed.push({
          conversation_id: conversationId,
          previous_revision_ordinal: previousOrdinal,
          current_revision_ordinal: currentOrdinal,
          change_kinds: Array.from(kindsSet),
        });
      }

      const signal: SyncCompletionSignal = {
        signal_id: `sync_${now}_${Math.random().toString(36).slice(2)}`,
        mailbox_id: config.mailbox_id,
        synced_at: now,
        changed_conversations: changed,
      };

      logger.info('Dispatch phase starting', { conversations: changed.length });

      const openResult = await deps.foreman.onSyncCompleted(signal);
      await opts.dispatchHooks?.afterSyncCompleted?.(signal, openResult);
      for (const opened of openResult.opened) {
        const openedItem = deps.coordinatorStore.getWorkItem(opened.work_item_id);
        if (openedItem) {
          await opts.dispatchHooks?.afterWorkOpened?.(openedItem);
        }
      }
    }

    function persistRejectedToolCall(
      request: { tool_id: string; arguments_json: string; purpose: string },
      reason: string,
      executionId: string,
      workItem: { work_item_id: string; conversation_id: string },
    ): void {
      const now = new Date().toISOString();
      try {
        deps.coordinatorStore.db
          .prepare(
            `insert into tool_call_records (
              call_id, execution_id, work_item_id, conversation_id, tool_id,
              request_args_json, exit_status, stdout, stderr, structured_output_json,
              started_at, completed_at, duration_ms
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            `tc_${executionId}_${Date.now()}_${request.tool_id}`,
            executionId,
            workItem.work_item_id,
            workItem.conversation_id,
            request.tool_id,
            request.arguments_json,
            'rejected_policy',
            '',
            `Rejected by Phase A policy: ${reason}`,
            null,
            now,
            now,
            0,
          );
      } catch (persistError) {
        logger.warn('Failed to persist rejected tool call record', { error: String(persistError) });
      }
    }

    while (!deps.scheduler.isQuiescent(config.mailbox_id)) {
      const runnable = deps.scheduler.scanForRunnableWork(config.mailbox_id, 1);
      if (runnable.length === 0) {
        break;
      }

      const workItem = runnable[0]!;
      const leaseResult = deps.scheduler.acquireLease(workItem.work_item_id, config.mailbox_id);
      if (!leaseResult.success) {
        logger.warn('Failed to acquire lease', { work_item_id: workItem.work_item_id, error: leaseResult.error });
        continue;
      }

      await opts.dispatchHooks?.afterLeaseAcquired?.(workItem, leaseResult);

      const envelope = await buildInvocationEnvelope(
        { coordinatorStore: deps.coordinatorStore, messageStore, rootDir, getRuntimePolicy: (_mailboxId: string) => config.policy ?? {
          primary_charter: 'support_steward',
          allowed_actions: ['draft_reply', 'send_reply', 'send_new_message', 'mark_read', 'move_message', 'archive', 'no_action'],
        } },
        { executionId: `ex_${workItem.work_item_id}_${Date.now()}`, workItem, tools: deps.toolCatalog },
      );

      const attempt = deps.scheduler.startExecution(
        workItem.work_item_id,
        workItem.opened_for_revision_id,
        JSON.stringify(envelope),
      );

      await opts.dispatchHooks?.beforeRuntimeInvoke?.(workItem, attempt, envelope);

      let leaseRenewalTimer: NodeJS.Timeout | null = null;
      try {
        if (leaseResult.success && leaseResult.lease) {
          leaseRenewalTimer = setInterval(() => {
            try {
              const newExpiresAt = new Date(Date.now() + 60000).toISOString();
              deps.scheduler.renewLease(leaseResult.lease!.lease_id, newExpiresAt);
            } catch (renewError) {
              logger.warn('Lease renewal failed', { lease_id: leaseResult.lease!.lease_id, error: String(renewError) });
            }
          }, 30000);
        }

        const output = await deps.charterRunner.run(envelope);

        await opts.dispatchHooks?.afterRuntimeComplete?.(workItem, attempt, output);

        if (output.tool_requests.length > 0) {
          await opts.dispatchHooks?.beforeToolExecution?.(workItem, attempt, output.tool_requests);

          const toolRunner = new ToolRunner({
            definitions: deps.toolDefinitions,
            persistHook: async (record) => {
              try {
                deps.coordinatorStore.insertToolCallRecord(record as unknown as Parameters<typeof deps.coordinatorStore.insertToolCallRecord>[0]);
              } catch (persistError) {
                logger.warn('Failed to persist tool call record', { error: String(persistError) });
              }
            },
          });

          let toolIndex = 0;
          for (const request of output.tool_requests) {
            await opts.dispatchHooks?.duringToolExecution?.(workItem, attempt, request, toolIndex);

            const catalogTool = envelope.available_tools.find((t) => t.tool_id === request.tool_id);
            if (!catalogTool) {
              logger.warn('Tool request rejected: not in envelope catalog', { tool_id: request.tool_id });
              persistRejectedToolCall(request, 'not_in_catalog', attempt.execution_id, workItem);
              toolIndex++;
              continue;
            }

            if (!catalogTool.read_only) {
              logger.warn('Tool request rejected: not read-only in Phase A', { tool_id: request.tool_id });
              persistRejectedToolCall(request, 'not_read_only', attempt.execution_id, workItem);
              toolIndex++;
              continue;
            }

            const definitionTool = deps.toolDefinitions[request.tool_id];
            if (!definitionTool) {
              logger.warn('Tool request rejected: no definition', { tool_id: request.tool_id });
              persistRejectedToolCall(request, 'no_definition', attempt.execution_id, workItem);
              toolIndex++;
              continue;
            }

            let sanitizedArgs: Record<string, unknown>;
            try {
              sanitizedArgs = JSON.parse(request.arguments_json) as Record<string, unknown>;
            } catch {
              logger.warn('Unparseable tool arguments', { tool_id: request.tool_id });
              persistRejectedToolCall(request, 'unparseable_args', attempt.execution_id, workItem);
              toolIndex++;
              continue;
            }
            const result = await toolRunner.executeToolCall(request, catalogTool, {
              execution_id: attempt.execution_id,
              work_item_id: workItem.work_item_id,
              conversation_id: workItem.conversation_id,
              sanitized_args: sanitizedArgs,
            });
            logger.info('Tool executed', {
              tool_id: request.tool_id,
              exit_status: result.exit_status,
              duration_ms: result.duration_ms,
            });
            toolIndex++;
          }

          await opts.dispatchHooks?.afterToolExecution?.(workItem, attempt);
        }

        deps.scheduler.completeExecution(attempt.execution_id, JSON.stringify(output));

        const evaluation = buildEvaluationRecord(output, {
          execution_id: attempt.execution_id,
          work_item_id: workItem.work_item_id,
          conversation_id: workItem.conversation_id,
        });

        await opts.dispatchHooks?.beforeResolveWorkItem?.(workItem, attempt, evaluation);

        const resolveResult = await deps.foreman.resolveWorkItem({
          work_item_id: workItem.work_item_id,
          execution_id: attempt.execution_id,
          evaluation,
        });

        if (!resolveResult.success && resolveResult.error) {
          logger.warn('Work item resolution failed', {
            work_item_id: workItem.work_item_id,
            error: resolveResult.error,
          });
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        deps.scheduler.failExecution(attempt.execution_id, msg, true);
        logger.error('Execution failed', { work_item_id: workItem.work_item_id, error: msg });
      } finally {
        if (leaseRenewalTimer) {
          clearInterval(leaseRenewalTimer);
        }
      }
    }

    // Recover stale process executions before dispatching new work
    try {
      const recovered = deps.processExecutor.recoverStaleExecutions();
      if (recovered.length > 0) {
        logger.info('Recovered stale process executions', { count: recovered.length });
      }
    } catch (recoverError) {
      const msg = recoverError instanceof Error ? recoverError.message : String(recoverError);
      logger.error('Process executor recovery error', { error: msg });
    }

    // Worker registry pass: run pending process intents
    try {
      await drainWorker(deps.workerRegistry, 'process_executor');
    } catch (processError) {
      const msg = processError instanceof Error ? processError.message : String(processError);
      logger.error('Process executor error', { error: msg });
    }

    logger.info('Dispatch phase complete');
  }

  async function close(): Promise<void> {
    if (dispatchDeps) {
      dispatchDeps.db.close();
    }
  }

  return { runDispatchPhase, close };
}

export async function createSyncService(
  opts: SyncServiceConfig,
): Promise<SyncService> {
  const logger = createLogger({ component: 'service', verbose: opts.verbose });

  logger.info('Loading configuration', { path: opts.configPath });
  let parsed: unknown;
  try {
    const raw = await readFile(resolve(opts.configPath), 'utf8');
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    throw new Error(
      `Failed to load configuration from ${opts.configPath}: ${(error as Error).message}`,
    );
  }

  if (isMultiMailboxConfig(parsed)) {
    return createMultiMailboxService(opts, logger);
  }

  return createSingleMailboxService(opts, logger);
}

async function createSingleMailboxService(
  opts: SyncServiceConfig,
  logger: ReturnType<typeof createLogger>,
): Promise<SyncService> {
  const config = await loadConfig({ path: opts.configPath });

  // Fail fast on invalid charter runtime configuration
  validateCharterRuntimeConfig(config);

  const rootDir = config.root_dir;

  // Initialize PID file
  const pidFile = opts.pidFilePath
    ? new PidFile({ path: opts.pidFilePath, checkStale: true })
    : null;

  // Initialize health file
  const healthFile = new HealthFile({ rootDir });

  let running = false;
  let stopRequested = false;
  let currentIteration: Promise<unknown> | null = null;

  const stats: SyncStats = {
    cyclesCompleted: 0,
    eventsApplied: 0,
    lastSyncAt: null,
    errors: 0,
    consecutiveErrors: 0,
  };

  const backoff = new ExponentialBackoff();

  let wakeUp: (() => void) | null = null;
  function interruptibleSleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = globalThis.setTimeout(resolve, ms);
      wakeUp = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }

  /**
   * Eager validation of charter runtime configuration so that
   * misconfiguration fails fast during service creation.
   */
  // Initialize dependencies
  logger.debug('Initializing Graph client');
  const tokenProvider = buildGraphTokenProvider({ config });
  const client = new GraphHttpClient({
    tokenProvider,
    preferImmutableIds: config.graph.prefer_immutable_ids,
  });

  logger.debug('Creating Graph adapter');
  const adapter = opts.adapter ?? new DefaultGraphAdapter({
    mailbox_id: config.mailbox_id,
    user_id: config.graph.user_id,
    client,
    adapter_scope: {
      mailbox_id: config.mailbox_id,
      included_container_refs: config.scope.included_container_refs,
      included_item_kinds: config.scope.included_item_kinds,
      attachment_policy: config.normalize.attachment_policy,
      body_policy: config.normalize.body_policy,
    },
    body_policy: config.normalize.body_policy,
    attachment_policy: config.normalize.attachment_policy,
    include_headers: config.normalize.include_headers,
    normalize_folder_ref: normalizeFolderRef,
    normalize_flagged: normalizeFlagged,
  });

  logger.debug('Initializing persistence stores');
  const cursorStore = new FileCursorStore({
    rootDir,
    mailboxId: config.mailbox_id,
  });
  const applyLogStore = new FileApplyLogStore({ rootDir });
  const factDbDir = join(rootDir, '.narada');
  await mkdir(factDbDir, { recursive: true });
  const factDb = new Database(join(factDbDir, 'facts.db'));
  factDb.pragma('journal_mode = WAL');
  const factStore = new SqliteFactStore({ db: factDb });
  factStore.initSchema();
  const messageStore = new FileMessageStore({ rootDir });
  const tombstoneStore = new FileTombstoneStore({ rootDir });
  const viewStore = new FileViewStore({ rootDir });
  const blobStore = new FileBlobStore({ rootDir });
  const lock = new FileLock({
    rootDir,
    acquireTimeoutMs: config.runtime.acquire_lock_timeout_ms,
  });

  const changedConversations = new Map<string, Set<ChangedConversation['change_kinds'][number]>>();

  function trackEventChanges(event: NormalizedEvent, result: ApplyEventResult): void {
    for (const threadId of result.dirty_views.by_thread) {
      const kinds = changedConversations.get(threadId) ?? new Set();
      if (event.event_kind === 'created' || event.event_kind === 'upsert') {
        kinds.add('new_message');
      } else if (event.event_kind === 'updated') {
        kinds.add('new_message');
      } else if (event.event_kind === 'deleted' || event.event_kind === 'delete') {
        kinds.add('moved');
      }
      changedConversations.set(threadId, kinds);
    }
  }

  const source = new ExchangeSource({ adapter, sourceId: config.mailbox_id });

  const runner = new DefaultSyncRunner({
    rootDir,
    source,
    cursorStore,
    applyLogStore,
    factStore,
    projector: {
      applyRecord: async (record) => {
        const event = record.payload as NormalizedEvent;
        const result = await applyEvent(
          {
            blobs: blobStore,
            messages: messageStore,
            tombstones: tombstoneStore,
            views: viewStore,
            tombstones_enabled: config.normalize.tombstones_enabled,
          },
          event,
        );
        trackEventChanges(event, result);
        return result;
      },
    },
    cleanupTmp: () => cleanupTmp({ rootDir }),
    acquireLock: () => lock.acquire(),
    rebuildViews: () => viewStore.rebuildAll(),
    rebuildViewsAfterSync: config.runtime.rebuild_views_after_sync,
  });

  const pollingIntervalMs = opts.pollingIntervalMs ?? config.runtime.polling_interval_ms;

  const dispatchContext = await createMailboxDispatchContext(config, opts, logger);

  async function updateHealth(): Promise<void> {
    const health: Omit<HealthStatus, 'timestamp'> = {
      status: running ? 'healthy' : 'stopped',
      lastSyncAt: stats.lastSyncAt?.toISOString(),
      cyclesCompleted: stats.cyclesCompleted,
      eventsApplied: stats.eventsApplied,
      errors: stats.errors,
      consecutiveErrors: stats.consecutiveErrors,
      pid: process.pid,
    };

    await healthFile.update(health).catch((err) => {
      logger.warn('Failed to update health file', { error: err.message });
    });
  }

  async function runSingleSync(): Promise<'success' | 'retryable' | 'fatal'> {
    logger.info('Starting sync cycle');
    changedConversations.clear();

    try {
      const result = await runner.syncOnce();

      if (result.status === 'success') {
        stats.cyclesCompleted++;
        stats.eventsApplied += result.applied_count;
        stats.lastSyncAt = new Date();
        stats.consecutiveErrors = 0;

        logger.info('Sync complete', {
          applied: result.applied_count,
          skipped: result.skipped_count,
          duration_ms: result.duration_ms,
        });

        try {
          await dispatchContext.runDispatchPhase(changedConversations);
        } catch (dispatchError) {
          const msg = dispatchError instanceof Error ? dispatchError.message : String(dispatchError);
          logger.error('Dispatch phase error', { error: msg });
          stats.errors++;
          stats.consecutiveErrors++;
        }

        await updateHealth();
        return 'success';
      } else if (result.status === 'retryable_failure') {
        stats.errors++;
        stats.consecutiveErrors++;
        logger.warn('Sync failed (retryable)', { error: result.error });
        await updateHealth();
        return 'retryable';
      } else {
        // fatal_failure
        stats.errors++;
        stats.consecutiveErrors++;
        logger.error('Sync failed (fatal)', new Error(result.error || 'Unknown error'));
        await updateHealth();
        return 'fatal';
      }
    } catch (error) {
      stats.errors++;
      stats.consecutiveErrors++;
      logger.error('Sync error', error instanceof Error ? error : new Error(String(error)));
      await updateHealth();
      return 'fatal';
    }
  }

  async function runLoop(): Promise<void> {
    while (running && !stopRequested) {
      const result = await runSingleSync();

      if (stopRequested) break;

      // Handle fatal errors - stop the service
      if (result === 'fatal') {
        logger.error('Fatal error occurred, stopping service');
        await stop();
        return;
      }

      // Handle retryable errors with backoff
      if (result === 'retryable') {
        const delay = backoff.next();
        logger.info(`Backing off for ${delay}ms before retry`);
        await interruptibleSleep(delay);
        continue;
      }

      // Success - reset backoff and sleep normally
      backoff.reset();
      logger.debug(`Sleeping ${pollingIntervalMs}ms until next sync`);
      await interruptibleSleep(pollingIntervalMs);
    }
  }

  async function stop(): Promise<void> {
    if (!running) {
      return;
    }

    logger.info('Stopping service');
    stopRequested = true;
    if (wakeUp) {
      wakeUp();
    }

    // Wait for current iteration to complete
    if (currentIteration) {
      try {
        await currentIteration;
      } catch {
        // Ignore errors during shutdown
      }
    }

    running = false;

    // Update health file with stopped status
    await healthFile.markStopped({
      cyclesCompleted: stats.cyclesCompleted,
      eventsApplied: stats.eventsApplied,
      lastSyncAt: stats.lastSyncAt?.toISOString(),
      errors: stats.errors,
      consecutiveErrors: stats.consecutiveErrors,
      pid: process.pid,
    }).catch(() => {
      // Ignore errors during shutdown
    });

    await dispatchContext.close().catch(() => {
      // Ignore close errors during shutdown
    });

    // Remove PID file
    if (pidFile) {
      await pidFile.remove().catch(() => {
        // Ignore errors during shutdown
      });
    }

    logger.info('Service stopped', {
      cycles: stats.cyclesCompleted,
      events: stats.eventsApplied,
      errors: stats.errors,
    });
  }

  return {
    async start(): Promise<void> {
      if (running) {
        throw new Error('Service already running');
      }

      // Write PID file
      if (pidFile) {
        logger.debug('Writing PID file');
        await pidFile.write();
      }

      running = true;
      stopRequested = false;

      logger.info('Starting service', {
        mailbox: config.mailbox_id,
        rootDir: config.root_dir,
        pollingInterval: pollingIntervalMs,
      });

      // Run initial sync
      const initialPromise = runSingleSync();
      currentIteration = initialPromise;
      const initialResult = await initialPromise;

      // If fatal error on initial sync, don't start loop
      if (initialResult === 'fatal') {
        logger.error('Fatal error on initial sync, not starting polling loop');
        await stop();
        throw new Error('Initial sync failed with fatal error');
      }

      // Continue polling
      currentIteration = runLoop();
      await currentIteration;
    },

    stop,

    getStats(): SyncStats {
      return { ...stats };
    },
  };
}

async function createMultiMailboxService(
  opts: SyncServiceConfig,
  logger: ReturnType<typeof createLogger>,
): Promise<SyncService> {
  const { config, valid } = await loadMultiMailboxConfig({ path: opts.configPath });
  if (!valid) {
    throw new Error('Invalid multi-mailbox configuration');
  }

  // Validate charter runtime config for each mailbox before starting
  for (const mailbox of config.mailboxes) {
    validateCharterRuntimeConfig(mailboxConfigToSingleConfig(mailbox));
  }

  const pidFile = opts.pidFilePath
    ? new PidFile({ path: opts.pidFilePath, checkStale: true })
    : null;

  const healthPath = config.mailboxes[0]?.root_dir
    ? resolve(config.mailboxes[0].root_dir, '.multi-health.json')
    : resolve('.multi-health.json');

  let running = false;
  let stopRequested = false;
  let currentIteration: Promise<unknown> | null = null;
  const abortController = new AbortController();

  const stats: SyncStats = {
    cyclesCompleted: 0,
    eventsApplied: 0,
    lastSyncAt: null,
    errors: 0,
    consecutiveErrors: 0,
    perMailbox: Object.fromEntries(
      config.mailboxes.map((m) => [
        m.id,
        {
          cyclesCompleted: 0,
          eventsApplied: 0,
          errors: 0,
          lastSyncAt: null,
        },
      ]),
    ),
  };

  const backoff = new ExponentialBackoff();

  let wakeUp: (() => void) | null = null;
  function interruptibleSleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = globalThis.setTimeout(resolve, ms);
      wakeUp = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }

  // Use the shortest polling interval across mailboxes, with a 60s ceiling
  const pollingIntervalMs = opts.pollingIntervalMs ?? Math.min(
    ...config.mailboxes.map((m) => m.sync?.polling_interval_ms ?? 60000),
    60000,
  );

  async function runSingleSync(): Promise<'success' | 'retryable' | 'fatal'> {
    logger.info('Starting multi-mailbox sync cycle');

    try {
      const result = await syncMultiple(config, {
        continueOnError: true,
        abortSignal: abortController.signal,
        createTokenProvider: (mailbox) =>
          buildGraphTokenProvider({
            config: { graph: mailbox.graph } as ExchangeFsSyncConfig,
          }),
      });

      const totalApplied = result.results.reduce(
        (sum, r) => sum + (r.eventsApplied ?? r.messagesSynced),
        0,
      );

      stats.cyclesCompleted++;
      stats.eventsApplied += totalApplied;
      stats.lastSyncAt = new Date();

      for (const r of result.results) {
        const mb = stats.perMailbox?.[r.mailboxId];
        if (mb) {
          mb.cyclesCompleted++;
          mb.eventsApplied += r.eventsApplied ?? r.messagesSynced;
          mb.lastSyncAt = new Date();
          if (!r.success) {
            mb.errors++;
          }
        }
      }

      await writeMultiMailboxHealth(config, result.results, {
        healthFilePath: healthPath,
      }).catch((err) => {
        logger.warn('Failed to update health file', { error: (err as Error).message });
      });

      if (result.failures === 0) {
        stats.consecutiveErrors = 0;
        logger.info('Multi-mailbox sync complete', {
          successes: result.successes,
          duration_ms: result.totalDurationMs,
        });
        // Run per-mailbox dispatch independently
        const dispatchContexts = new Map<string, Awaited<ReturnType<typeof createMailboxDispatchContext>>>();

        for (const r of result.results) {
          if (r.success && r.changedConversations && r.changedConversations.length > 0) {
            const mailbox = config.mailboxes.find((m) => m.id === r.mailboxId);
            if (!mailbox) continue;

            try {
              if (!dispatchContexts.has(mailbox.id)) {
                const singleConfig = mailboxConfigToSingleConfig(mailbox);
                dispatchContexts.set(mailbox.id, await createMailboxDispatchContext(singleConfig, opts, logger));
              }
              const ctx = dispatchContexts.get(mailbox.id)!;
              const changedMap = new Map<string, Set<ChangedConversation['change_kinds'][number]>>();
              for (const c of r.changedConversations) {
                changedMap.set(c.conversation_id, new Set(c.change_kinds as ChangedConversation['change_kinds'][number][]));
              }
              await ctx.runDispatchPhase(changedMap);
            } catch (dispatchError) {
              const msg = dispatchError instanceof Error ? dispatchError.message : String(dispatchError);
              logger.error('Dispatch phase error', { mailbox_id: r.mailboxId, error: msg });
              if (stats.perMailbox?.[r.mailboxId]) {
                stats.perMailbox[r.mailboxId].errors++;
              }
            }
          }
        }

        for (const ctx of dispatchContexts.values()) {
          await ctx.close().catch(() => {
            // Ignore close errors
          });
        }

        return 'success';
      }

      stats.errors += result.failures;
      stats.consecutiveErrors++;
      logger.warn('Multi-mailbox sync had failures', {
        failures: result.failures,
        cancelled: result.cancelled,
      });
      return result.cancelled ? 'retryable' : 'retryable';
    } catch (error) {
      stats.errors++;
      stats.consecutiveErrors++;
      logger.error(
        'Multi-mailbox sync error',
        error instanceof Error ? error : new Error(String(error)),
      );
      return 'fatal';
    }
  }

  async function runLoop(): Promise<void> {
    while (running && !stopRequested) {
      const result = await runSingleSync();

      if (stopRequested) break;

      if (result === 'fatal') {
        logger.error('Fatal error occurred, stopping service');
        await stop();
        return;
      }

      if (result === 'retryable') {
        const delay = backoff.next();
        logger.info(`Backing off for ${delay}ms before retry`);
        await interruptibleSleep(delay);
        continue;
      }

      backoff.reset();
      logger.debug(`Sleeping ${pollingIntervalMs}ms until next sync`);
      await interruptibleSleep(pollingIntervalMs);
    }
  }

  async function stop(): Promise<void> {
    if (!running) {
      return;
    }

    logger.info('Stopping multi-mailbox service');
    stopRequested = true;
    abortController.abort();
    if (wakeUp) {
      wakeUp();
    }

    if (currentIteration) {
      try {
        await currentIteration;
      } catch {
        // Ignore errors during shutdown
      }
    }

    running = false;

    await writeMultiMailboxHealth(config, [], { healthFilePath: healthPath }).catch(() => {
      // Ignore errors during shutdown
    });

    if (pidFile) {
      await pidFile.remove().catch(() => {
        // Ignore errors during shutdown
      });
    }

    logger.info('Service stopped', {
      cycles: stats.cyclesCompleted,
      events: stats.eventsApplied,
      errors: stats.errors,
    });
  }

  return {
    async start(): Promise<void> {
      if (running) {
        throw new Error('Service already running');
      }

      if (pidFile) {
        logger.debug('Writing PID file');
        await pidFile.write();
      }

      running = true;
      stopRequested = false;

      logger.info('Starting multi-mailbox service', {
        mailboxes: config.mailboxes.length,
        pollingInterval: pollingIntervalMs,
      });

      const initialPromise = runSingleSync();
      currentIteration = initialPromise;
      const initialResult = await initialPromise;

      if (initialResult === 'fatal') {
        logger.error('Fatal error on initial sync, not starting polling loop');
        await stop();
        throw new Error('Initial sync failed with fatal error');
      }

      currentIteration = runLoop();
      await currentIteration;
    },

    stop,

    getStats(): SyncStats {
      return { ...stats };
    },
  };
}
