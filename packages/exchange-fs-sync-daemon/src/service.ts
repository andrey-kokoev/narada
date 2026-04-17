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
  MailboxContextStrategy,
  SqliteScheduler,
  MockCharterRunner,
  buildInvocationEnvelope,
  buildEvaluationRecord,
  validateCharterRuntimeConfig,
  loadCharterEnv,
  type ExchangeFsSyncConfig,
  type ScopeConfig,
  type NormalizedEvent,
  type SyncCompletionSignal,
  type CharterRunner,
  type GraphAdapter,
  type WorkItem,
  type ExecutionAttempt,
  type LeaseAcquisitionResult,
  type SchedulerOptions,
  type ToolCatalogEntry,
} from '@narada/exchange-fs-sync';
import { CodexCharterRunner, ToolRunner } from '@narada/charters';
import type { ToolDefinition, ToolInvocationRequest } from '@narada/charters';
import { createLogger } from './lib/logger.js';
import { PidFile } from './lib/pid-file.js';
import { HealthFile, type HealthStatus } from './lib/health.js';
import { createObservationServer, type ObservationApiScope } from './observation-server.js';

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
  /** Port for the read-only observation API server (default: disabled) */
  observationApiPort?: number;
  /** Host for the observation API server (default: 127.0.0.1) */
  observationApiHost?: string;
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
  cfg: ScopeConfig,
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
  scope: ScopeConfig,
  _globalConfig: ExchangeFsSyncConfig,
  opts: SyncServiceConfig,
  logger: ReturnType<typeof createLogger>,
  callbacks?: {
    rebuildViews?: () => Promise<void>;
  },
) {
  const rootDir = scope.root_dir;
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
    factStore: InstanceType<typeof SqliteFactStore>;
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

    const factDb = new Database(join(dbDir, 'facts.db'));
    factDb.pragma('journal_mode = WAL');
    factDb.pragma('synchronous = NORMAL');
    const factStore = new SqliteFactStore({ db: factDb });
    factStore.initSchema();

    const getRuntimePolicy = (_mailboxId: string) => scope.policy;

    const foreman = new DefaultForemanFacade({
      coordinatorStore,
      outboundStore,
      intentStore,
      db,
      foremanId: scope.scope_id,
      getRuntimePolicy,
      contextFormationStrategy: new MailboxContextStrategy(),
    });

    const scheduler = new SqliteScheduler(coordinatorStore, {
      runnerId: scope.scope_id,
      ...opts.schedulerOptions,
    });

    const charterRunner = opts.charterRunner ?? createDefaultCharterRunner(scope, coordinatorStore);
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

    dispatchDeps = { db, coordinatorStore, outboundStore, intentStore, traceStore, foreman, scheduler, charterRunner, toolCatalog, toolDefinitions, processExecutionStore, workerRegistry, processExecutor, factStore };
    return dispatchDeps;
  }

  async function runDispatchPhase(): Promise<void> {
    const deps = await initDispatchDeps();

    // Fact-driven admission: read unadmitted facts and route them through the foreman
    const facts = deps.factStore.getUnadmittedFacts(scope.scope_id, 1000);

    if (facts.length > 0) {
      logger.info('Dispatch phase starting', { scope: scope.scope_id, facts: facts.length });

      const openResult = await deps.foreman.onFactsAdmitted(facts, scope.scope_id);
      const signal: SyncCompletionSignal = {
        signal_id: `fact_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        scope_id: scope.scope_id,
        synced_at: new Date().toISOString(),
        changed_contexts: [],
      };
      await opts.dispatchHooks?.afterSyncCompleted?.(signal, openResult);
      for (const opened of openResult.opened) {
        const openedItem = deps.coordinatorStore.getWorkItem(opened.work_item_id);
        if (openedItem) {
          await opts.dispatchHooks?.afterWorkOpened?.(openedItem);
        }
      }

      deps.factStore.markAdmitted(facts.map((f) => f.fact_id));
    }

    function persistRejectedToolCall(
      request: { tool_id: string; arguments_json: string; purpose: string },
      reason: string,
      executionId: string,
      workItem: { work_item_id: string; context_id: string },
    ): void {
      const now = new Date().toISOString();
      try {
        deps.coordinatorStore.db
          .prepare(
            `insert into tool_call_records (
              call_id, execution_id, work_item_id, context_id, tool_id,
              request_args_json, exit_status, stdout, stderr, structured_output_json,
              started_at, completed_at, duration_ms
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            `tc_${executionId}_${Date.now()}_${request.tool_id}`,
            executionId,
            workItem.work_item_id,
            workItem.context_id,
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
        logger.warn('Failed to persist rejected tool call record', { scope: scope.scope_id, error: String(persistError) });
      }
    }

    while (!deps.scheduler.isQuiescent(scope.scope_id)) {
      const runnable = deps.scheduler.scanForRunnableWork(scope.scope_id, 1);
      if (runnable.length === 0) {
        break;
      }

      const workItem = runnable[0]!;
      const leaseResult = deps.scheduler.acquireLease(workItem.work_item_id, scope.scope_id);
      if (!leaseResult.success) {
        logger.warn('Failed to acquire lease', { scope: scope.scope_id, work_item_id: workItem.work_item_id, error: leaseResult.error });
        continue;
      }

      await opts.dispatchHooks?.afterLeaseAcquired?.(workItem, leaseResult);

      const envelope = await buildInvocationEnvelope(
        { coordinatorStore: deps.coordinatorStore, messageStore, rootDir, getRuntimePolicy: (_mailboxId: string) => scope.policy },
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
              logger.warn('Lease renewal failed', { scope: scope.scope_id, lease_id: leaseResult.lease!.lease_id, error: String(renewError) });
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
                logger.warn('Failed to persist tool call record', { scope: scope.scope_id, error: String(persistError) });
              }
            },
          });

          let toolIndex = 0;
          for (const request of output.tool_requests) {
            await opts.dispatchHooks?.duringToolExecution?.(workItem, attempt, request, toolIndex);

            const catalogTool = envelope.available_tools.find((t) => t.tool_id === request.tool_id);
            if (!catalogTool) {
              logger.warn('Tool request rejected: not in envelope catalog', { scope: scope.scope_id, tool_id: request.tool_id });
              persistRejectedToolCall(request, 'not_in_catalog', attempt.execution_id, workItem);
              toolIndex++;
              continue;
            }

            if (!catalogTool.read_only) {
              logger.warn('Tool request rejected: not read-only in Phase A', { scope: scope.scope_id, tool_id: request.tool_id });
              persistRejectedToolCall(request, 'not_read_only', attempt.execution_id, workItem);
              toolIndex++;
              continue;
            }

            const definitionTool = deps.toolDefinitions[request.tool_id];
            if (!definitionTool) {
              logger.warn('Tool request rejected: no definition', { scope: scope.scope_id, tool_id: request.tool_id });
              persistRejectedToolCall(request, 'no_definition', attempt.execution_id, workItem);
              toolIndex++;
              continue;
            }

            let sanitizedArgs: Record<string, unknown>;
            try {
              sanitizedArgs = JSON.parse(request.arguments_json) as Record<string, unknown>;
            } catch {
              logger.warn('Unparseable tool arguments', { scope: scope.scope_id, tool_id: request.tool_id });
              persistRejectedToolCall(request, 'unparseable_args', attempt.execution_id, workItem);
              toolIndex++;
              continue;
            }
            const result = await toolRunner.executeToolCall(request, catalogTool, {
              execution_id: attempt.execution_id,
              work_item_id: workItem.work_item_id,
              conversation_id: workItem.context_id,
              sanitized_args: sanitizedArgs,
            });
            logger.info('Tool executed', {
              scope: scope.scope_id,
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
          context_id: workItem.context_id,
        });

        await opts.dispatchHooks?.beforeResolveWorkItem?.(workItem, attempt, evaluation);

        const resolveResult = await deps.foreman.resolveWorkItem({
          work_item_id: workItem.work_item_id,
          execution_id: attempt.execution_id,
          evaluation,
        });

        if (!resolveResult.success && resolveResult.error) {
          logger.warn('Work item resolution failed', {
            scope: scope.scope_id,
            work_item_id: workItem.work_item_id,
            error: resolveResult.error,
          });
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        deps.scheduler.failExecution(attempt.execution_id, msg, true);
        logger.error('Execution failed', { scope: scope.scope_id, work_item_id: workItem.work_item_id, error: msg });
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
        logger.info('Recovered stale process executions', { scope: scope.scope_id, count: recovered.length });
      }
    } catch (recoverError) {
      const msg = recoverError instanceof Error ? recoverError.message : String(recoverError);
      logger.error('Process executor recovery error', { scope: scope.scope_id, error: msg });
    }

    // Worker registry pass: run pending process intents
    try {
      await drainWorker(deps.workerRegistry, 'process_executor');
    } catch (processError) {
      const msg = processError instanceof Error ? processError.message : String(processError);
      logger.error('Process executor error', { scope: scope.scope_id, error: msg });
    }

    logger.info('Dispatch phase complete', { scope: scope.scope_id });
  }

  async function close(): Promise<void> {
    if (dispatchDeps) {
      dispatchDeps.factStore.close();
      dispatchDeps.db.close();
    }
  }

  async function getObservationApiScope(): Promise<ObservationApiScope> {
    const deps = await initDispatchDeps();
    return {
      scope_id: scope.scope_id,
      coordinatorStore: deps.coordinatorStore,
      outboundStore: deps.outboundStore,
      intentStore: deps.intentStore,
      executionStore: deps.processExecutionStore,
      workerRegistry: deps.workerRegistry,
      factStore: deps.factStore,
      rebuildViews: callbacks?.rebuildViews,
      runDispatchPhase,
    };
  }

  return { runDispatchPhase, close, getObservationApiScope };
}

async function createScopeService(
  scope: ScopeConfig,
  globalConfig: ExchangeFsSyncConfig,
  opts: SyncServiceConfig,
  logger: ReturnType<typeof createLogger>,
) {
  const rootDir = scope.root_dir;
  const graphSource = scope.graph ?? (scope.sources.find(s => s.type === 'graph') as ScopeConfig['graph'] | undefined);
  if (!graphSource) {
    throw new Error(`No graph source found for scope ${scope.scope_id}`);
  }

  const tokenProvider = buildGraphTokenProvider({ graph: graphSource });
  const client = new GraphHttpClient({
    tokenProvider,
    preferImmutableIds: graphSource.prefer_immutable_ids ?? true,
  });

  const adapter = opts.adapter ?? new DefaultGraphAdapter({
    mailbox_id: scope.scope_id,
    user_id: graphSource.user_id!,
    client,
    adapter_scope: {
      mailbox_id: scope.scope_id,
      included_container_refs: scope.scope.included_container_refs,
      included_item_kinds: scope.scope.included_item_kinds,
      attachment_policy: scope.normalize.attachment_policy,
      body_policy: scope.normalize.body_policy,
    },
    body_policy: scope.normalize.body_policy,
    attachment_policy: scope.normalize.attachment_policy,
    include_headers: scope.normalize.include_headers,
    normalize_folder_ref: normalizeFolderRef,
    normalize_flagged: normalizeFlagged,
  });

  const cursorStore = new FileCursorStore({ rootDir, mailboxId: scope.scope_id });
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
    acquireTimeoutMs: scope.runtime.acquire_lock_timeout_ms,
  });

  const source = new ExchangeSource({ adapter, sourceId: scope.scope_id });

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
            tombstones_enabled: scope.normalize.tombstones_enabled,
          },
          event,
        );
        return result;
      },
    },
    cleanupTmp: () => cleanupTmp({ rootDir }),
    acquireLock: () => lock.acquire(),
    rebuildViews: () => viewStore.rebuildAll(),
    rebuildViewsAfterSync: scope.runtime.rebuild_views_after_sync,
  });

  const dispatchContext = await createMailboxDispatchContext(scope, globalConfig, opts, logger, {
    rebuildViews: () => viewStore.rebuildAll(),
  });

  return { scope, runner, dispatchContext };
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

  let scopes: ScopeConfig[];
  let globalConfig: ExchangeFsSyncConfig;

  if (isMultiMailboxConfig(parsed) && Array.isArray((parsed as Record<string, unknown>).mailboxes)) {
    const result = await loadMultiMailboxConfig({ path: opts.configPath });
    if (!result.valid) {
      throw new Error('Invalid multi-mailbox configuration');
    }
    scopes = result.scopes;
    globalConfig = {
      root_dir: scopes[0]?.root_dir ?? resolve('.'),
      scopes,
    };
  } else {
    globalConfig = await loadConfig({ path: opts.configPath });
    scopes = globalConfig.scopes;
  }

  for (const scope of scopes) {
    validateCharterRuntimeConfig(scope as unknown as ExchangeFsSyncConfig);
  }

  const pidFile = opts.pidFilePath
    ? new PidFile({ path: opts.pidFilePath, checkStale: true })
    : null;

  const healthRootDir = globalConfig.root_dir ?? scopes[0]?.root_dir ?? resolve('.');
  const healthFile = new HealthFile({ rootDir: healthRootDir });

  let running = false;
  let stopRequested = false;
  let currentIteration: Promise<unknown> | null = null;

  const stats: SyncStats = {
    cyclesCompleted: 0,
    eventsApplied: 0,
    lastSyncAt: null,
    errors: 0,
    consecutiveErrors: 0,
    perMailbox: Object.fromEntries(
      scopes.map((s) => [
        s.scope_id,
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

  const pollingIntervalMs = opts.pollingIntervalMs ?? Math.min(
    ...scopes.map((s) => s.runtime.polling_interval_ms),
    60000,
  );

  const scopeServices = await Promise.all(
    scopes.map((scope) => createScopeService(scope, globalConfig, opts, logger)),
  );

  const scopeApis = new Map<string, ObservationApiScope>();
  const observationServer = opts.observationApiPort
    ? createObservationServer({
        port: opts.observationApiPort,
        host: opts.observationApiHost,
        verbose: opts.verbose,
      }, scopeApis)
    : null;

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

    let anyFatal = false;
    let anyRetryable = false;

    await Promise.all(
      scopeServices.map(async (svc) => {
        const { scope, runner, dispatchContext } = svc;
        try {
          const result = await runner.syncOnce();

          if (result.status === 'success') {
            const mb = stats.perMailbox?.[scope.scope_id];
            if (mb) {
              mb.cyclesCompleted++;
              mb.eventsApplied += result.applied_count;
              mb.lastSyncAt = new Date();
            }
            stats.eventsApplied += result.applied_count;

            logger.info('Sync complete', {
              scope: scope.scope_id,
              applied: result.applied_count,
              skipped: result.skipped_count,
              duration_ms: result.duration_ms,
            });

            try {
              await dispatchContext.runDispatchPhase();
            } catch (dispatchError) {
              const msg = dispatchError instanceof Error ? dispatchError.message : String(dispatchError);
              logger.error('Dispatch phase error', { scope: scope.scope_id, error: msg });
              if (mb) mb.errors++;
              stats.errors++;
              anyRetryable = true;
            }
          } else if (result.status === 'retryable_failure') {
            const mb = stats.perMailbox?.[scope.scope_id];
            if (mb) mb.errors++;
            stats.errors++;
            anyRetryable = true;
            logger.warn('Sync failed (retryable)', { scope: scope.scope_id, error: result.error });
          } else {
            const mb = stats.perMailbox?.[scope.scope_id];
            if (mb) mb.errors++;
            stats.errors++;
            anyFatal = true;
            logger.error('Sync failed (fatal)', new Error(result.error || 'Unknown error'), { scope: scope.scope_id });
          }
        } catch (error) {
          const mb = stats.perMailbox?.[scope.scope_id];
          if (mb) mb.errors++;
          stats.errors++;
          anyFatal = true;
          logger.error('Sync error', error instanceof Error ? error : new Error(String(error)), { scope: scope.scope_id });
        }
      }),
    );

    if (anyFatal) {
      stats.consecutiveErrors++;
      await updateHealth();
      return 'fatal';
    }

    if (anyRetryable) {
      stats.consecutiveErrors++;
      await updateHealth();
      return 'retryable';
    }

    stats.cyclesCompleted++;
    stats.lastSyncAt = new Date();
    stats.consecutiveErrors = 0;
    logger.info('Sync cycle complete', { scopes: scopeServices.length });
    await updateHealth();
    return 'success';
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

    logger.info('Stopping service');
    stopRequested = true;
    if (wakeUp) {
      wakeUp();
    }

    if (observationServer) {
      await observationServer.stop().catch((err) => {
        logger.warn('Observation server stop error', { error: err.message });
      });
    }

    if (currentIteration) {
      try {
        await currentIteration;
      } catch {
        // Ignore errors during shutdown
      }
    }

    running = false;

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

    for (const svc of scopeServices) {
      await svc.dispatchContext.close().catch(() => {
        // Ignore close errors during shutdown
      });
    }

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

      logger.info('Starting service', {
        scopes: scopes.length,
        pollingInterval: pollingIntervalMs,
      });

      if (observationServer) {
        for (const svc of scopeServices) {
          const apiScope = await svc.dispatchContext.getObservationApiScope();
          scopeApis.set(svc.scope.scope_id, apiScope);
        }
        await observationServer.start();
      }

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
