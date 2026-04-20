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
  TimerSource,
  WebhookSource,
  DefaultSyncRunner,
  FileCursorStore,
  FileApplyLogStore,
  FileMessageStore,
  FileTombstoneStore,
  FileViewStore,
  FileBlobStore,
  ProjectionRebuildRegistry,
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
  SendReplyWorker,
  NonSendWorker,
  OutboundReconciler,
  DefaultGraphDraftClient,
  type ParticipantResolver,
  type NonSendGraphClient,
  type MessageFinder,
  DefaultForemanFacade,
  resolveContextStrategy,
  SqliteScheduler,
  MockCharterRunner,
  buildInvocationEnvelope,
  buildEvaluationRecord,
  persistEvaluation,
  buildScopeDispatchSummary,
  getStuckWorkItemSummary,
  getStuckOutboundSummary,
  VerticalMaterializerRegistry,
  TimerContextMaterializer,
  WebhookContextMaterializer,
  FilesystemContextMaterializer,
  MailboxContextMaterializer,
  validateCharterRuntimeConfig,
  loadCharterEnv,
  type ExchangeFsSyncConfig,
  type ScopeConfig,
  type NormalizedEvent,
  type SyncCompletionSignal,
  type ChangedContext,
  type Fact,
  type CharterRunner,
  type GraphAdapter,
  type WorkItem,
  type ExecutionAttempt,
  type LeaseAcquisitionResult,
  type SchedulerOptions,
  type ToolCatalogEntry,
  type WorkItemLease,
} from '@narada2/control-plane';
import { SearchEngine } from '@narada2/search';
import { CodexCharterRunner, ToolRunner } from '@narada2/charters';
import type { ToolDefinition, ToolInvocationRequest } from '@narada2/charters';
import { createLogger } from './lib/logger.js';
import { PidFile } from './lib/pid-file.js';
import { HealthFile, type HealthStatus } from './lib/health.js';
import { createObservationServer, type ObservationApiScope } from './observation/observation-server.js';
import { registerScopeApis } from './observation/scope-registry.js';
import type { WakeReason } from './observation/types.js';
import { WAKE_PRIORITY } from './observation/types.js';
import { OUTBOUND_WORKER_IDS } from './lib/workers.js';

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
  /** Max time since last sync before health is considered stale (default: 5 min) */
  maxStalenessMs?: number;
  /** Max consecutive errors before health transitions to error (default: 3) */
  maxConsecutiveErrors?: number;
  /** Maximum time in ms to wait for in-flight work during graceful shutdown (default: 30000) */
  maxDrainMs?: number;
}

export interface DispatchHooks {
  afterSyncCompleted?: (signal: import("@narada2/control-plane").SyncCompletionSignal, result: import("@narada2/control-plane").WorkOpeningResult) => Promise<void>;
  afterWorkOpened?: (workItem: WorkItem) => Promise<void>;
  afterLeaseAcquired?: (workItem: WorkItem, lease: LeaseAcquisitionResult) => Promise<void>;
  beforeRuntimeInvoke?: (workItem: WorkItem, attempt: ExecutionAttempt, envelope: import("@narada2/control-plane").CharterInvocationEnvelope) => Promise<void>;
  afterRuntimeComplete?: (workItem: WorkItem, attempt: ExecutionAttempt, output: import("@narada2/control-plane").CharterOutputEnvelope) => Promise<void>;
  beforeToolExecution?: (workItem: WorkItem, attempt: ExecutionAttempt, requests: ToolInvocationRequest[]) => Promise<void>;
  duringToolExecution?: (workItem: WorkItem, attempt: ExecutionAttempt, request: ToolInvocationRequest, index: number) => Promise<void>;
  afterToolExecution?: (workItem: WorkItem, attempt: ExecutionAttempt) => Promise<void>;
  beforeResolveWorkItem?: (workItem: WorkItem, attempt: ExecutionAttempt, evaluation: ReturnType<typeof buildEvaluationRecord>) => Promise<void>;
}

/**
 * Pending-wake coalescing with priority replacement.
 * Higher-priority wake replaces lower-priority pending wake.
 */
export class WakeController {
  private pendingWake: WakeReason | null = null;
  private resolveSleep: ((reason: WakeReason) => void) | null = null;
  private sleepTimer: NodeJS.Timeout | null = null;

  requestWake(reason: WakeReason): boolean {
    if (!this.pendingWake || WAKE_PRIORITY[reason] > WAKE_PRIORITY[this.pendingWake]) {
      this.pendingWake = reason;
      if (this.resolveSleep) {
        this.resolveSleep(reason);
        this.resolveSleep = null;
      }
      if (this.sleepTimer) {
        clearTimeout(this.sleepTimer);
        this.sleepTimer = null;
      }
      return true;
    }
    return false;
  }

  async sleep(ms: number, defaultReason: WakeReason = 'poll'): Promise<WakeReason> {
    return new Promise((resolve) => {
      this.resolveSleep = (reason) => {
        this.resolveSleep = null;
        this.sleepTimer = null;
        resolve(reason);
      };
      this.sleepTimer = setTimeout(() => {
        this.resolveSleep = null;
        this.sleepTimer = null;
        resolve(defaultReason);
      }, ms);
    });
  }

  getAndClearPendingWake(): WakeReason | null {
    const r = this.pendingWake;
    this.pendingWake = null;
    return r;
  }

  stop(): void {
    if (this.sleepTimer) {
      clearTimeout(this.sleepTimer);
      this.sleepTimer = null;
    }
    if (this.resolveSleep) {
      this.resolveSleep('manual');
      this.resolveSleep = null;
    }
  }
}

export interface SyncService {
  start(): Promise<void>;
  runOnce(): Promise<'success' | 'retryable' | 'fatal'>;
  stop(): Promise<void>;
  getStats(): SyncStats;
  /** Request an out-of-band wake with the given priority reason */
  requestWake(reason: WakeReason): void;
}

export interface SyncStats {
  cyclesCompleted: number;
  eventsApplied: number;
  lastSyncAt: Date | null;
  errors: number;
  consecutiveErrors: number;
  perScope?: Record<string, {
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
    authority_class: "derive",
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

  if (runtime === 'codex-api' || runtime === 'kimi-api') {
    const apiKey = cfg.charter?.api_key ?? (runtime === 'kimi-api' ? env.kimi_api_key : env.openai_api_key);
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

  throw new Error(`Invalid charter runtime: ${runtime}. Expected 'codex-api', 'kimi-api', or 'mock'.`);
}

export interface ShutdownSignal {
  shuttingDown: boolean;
}

async function createDispatchContext(
  scope: ScopeConfig,
  _globalConfig: ExchangeFsSyncConfig,
  opts: SyncServiceConfig,
  logger: ReturnType<typeof createLogger>,
  graphHttpClient?: GraphHttpClient,
  userId?: string,
  callbacks?: {
    /** @deprecated Use rebuildProjections instead */
    rebuildViews?: () => Promise<void>;
    rebuildProjections?: () => Promise<void>;
  },
  shutdownSignal?: ShutdownSignal,
  getLastSyncAt?: () => Date | null,
  syncFreshThresholdMs?: number,
) {
  const rootDir = scope.root_dir;
  const messageStore = new FileMessageStore({ rootDir });

  const materializerRegistry = new VerticalMaterializerRegistry()
    .register('timer', () => new TimerContextMaterializer())
    .register('webhook', () => new WebhookContextMaterializer())
    .register('filesystem', () => new FilesystemContextMaterializer())
    .register('mail', () => new MailboxContextMaterializer(rootDir, messageStore));

  let dispatchDeps: {
    db: InstanceType<typeof Database>;
    coordinatorStore: InstanceType<typeof SqliteCoordinatorStore>;
    outboundStore: InstanceType<typeof SqliteOutboundStore>;
    intentStore: InstanceType<typeof SqliteIntentStore>;
    traceStore: InstanceType<typeof SqliteAgentTraceStore>;
    foreman: InstanceType<typeof DefaultForemanFacade>;
    scheduler: InstanceType<typeof SqliteScheduler>;
    charterRunner: CharterRunner;
    materializerRegistry: InstanceType<typeof VerticalMaterializerRegistry>;
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

    const getRuntimePolicy = (_scopeId: string) => scope.policy;

    const foreman = new DefaultForemanFacade({
      coordinatorStore,
      outboundStore,
      intentStore,
      db,
      foremanId: scope.scope_id,
      getRuntimePolicy,
      contextFormationStrategy: resolveContextStrategy(scope.context_strategy ?? 'mail'),
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
    const [SEND_REPLY, NON_SEND_ACTIONS, OUTBOUND_RECONCILER] = OUTBOUND_WORKER_IDS;
    workerRegistry.register({
      identity: {
        worker_id: 'process_executor',
        executor_family: 'process',
        concurrency_policy: 'singleton',
        description: 'Executes process.run intents via local subprocess',
      },
      fn: () => processExecutor.processNext(),
    });

    // Mail outbound workers — registered through the common registry for unified dispatch
    const draftClient = new DefaultGraphDraftClient({ httpClient: graphHttpClient });

    const nonSendGraphClient: NonSendGraphClient = {
      patchMessage: async (uid, messageId, body) => {
        await graphHttpClient.patchJson(`/users/${encodeURIComponent(uid)}/messages/${encodeURIComponent(messageId)}`, body);
      },
      moveMessage: async (uid, messageId, destinationId) => {
        await graphHttpClient.postJson(`/users/${encodeURIComponent(uid)}/messages/${encodeURIComponent(messageId)}/move`, { destinationId });
      },
    };

    const messageFinder: MessageFinder = {
      findByOutboundId: async (_mailboxId, outboundId) => {
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
      findByMessageId: async (_mailboxId, messageId) => {
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

    const participantResolver: ParticipantResolver = {
      getParticipants: async (_mailboxId, threadId) => {
        try {
          const result = await graphHttpClient.getJson<{ value: Array<{ toRecipients?: Array<{ emailAddress?: { address?: string } }>; ccRecipients?: Array<{ emailAddress?: { address?: string } }>; bccRecipients?: Array<{ emailAddress?: { address?: string } }>; from?: { emailAddress?: { address?: string } } }> }>(
            `/users/${encodeURIComponent(userId)}/messages?$filter=conversationId%20eq%20'${encodeURIComponent(threadId)}'&$select=toRecipients,ccRecipients,bccRecipients,from`,
          );
          const participants = new Set<string>();
          for (const msg of result.value ?? []) {
            for (const r of msg.toRecipients ?? []) {
              if (r.emailAddress?.address) participants.add(r.emailAddress.address.toLowerCase());
            }
            for (const r of msg.ccRecipients ?? []) {
              if (r.emailAddress?.address) participants.add(r.emailAddress.address.toLowerCase());
            }
            for (const r of msg.bccRecipients ?? []) {
              if (r.emailAddress?.address) participants.add(r.emailAddress.address.toLowerCase());
            }
            if (msg.from?.emailAddress?.address) {
              participants.add(msg.from.emailAddress.address.toLowerCase());
            }
          }
          return participants;
        } catch {
          return new Set<string>();
        }
      },
    };

    const sendReplyWorker = new SendReplyWorker({
      store: outboundStore,
      draftClient,
      participantResolver,
      resolveUserId: () => userId,
    });

    const nonSendWorker = new NonSendWorker({
      store: outboundStore,
      graphClient: nonSendGraphClient,
      resolveUserId: () => userId,
    });

    const reconciler = new OutboundReconciler({
      store: outboundStore,
      messageFinder,
    });

    workerRegistry.register({
      identity: {
        worker_id: SEND_REPLY,
        executor_family: 'outbound',
        concurrency_policy: 'singleton',
        description: 'Creates drafts and sends reply messages via Graph API',
      },
      fn: async () => {
        const result = await sendReplyWorker.processNext(scope.scope_id);
        return { processed: result.processed, execution_id: result.outboundId };
      },
    });

    workerRegistry.register({
      identity: {
        worker_id: NON_SEND_ACTIONS,
        executor_family: 'outbound',
        concurrency_policy: 'singleton',
        description: 'Executes mark_read, move_message, and set_categories actions',
      },
      fn: async () => {
        const actionTypes = ['mark_read', 'move_message', 'set_categories'] as const;
        for (const actionType of actionTypes) {
          const result = await nonSendWorker.processNext(actionType, scope.scope_id);
          if (result.processed) {
            return { processed: true, execution_id: result.outboundId };
          }
        }
        return { processed: false };
      },
    });

    workerRegistry.register({
      identity: {
        worker_id: OUTBOUND_RECONCILER,
        executor_family: 'outbound',
        concurrency_policy: 'singleton',
        description: 'Reconciles submitted outbound commands with remote mailbox state',
      },
      fn: async () => {
        const result = await reconciler.processNext(scope.scope_id);
        return { processed: result.processed, execution_id: result.outboundId };
      },
    });

    dispatchDeps = { db, coordinatorStore, outboundStore, intentStore, traceStore, foreman, scheduler, charterRunner, materializerRegistry, toolCatalog, toolDefinitions, processExecutionStore, workerRegistry, processExecutor, factStore };
    return dispatchDeps;
  }

  function buildChangedContextsFromFacts(
    facts: Fact[],
    coordinatorStore: InstanceType<typeof SqliteCoordinatorStore>,
  ): ChangedContext[] {
    const groups = new Map<string, Set<string>>();
    for (const fact of facts) {
      let contextId: string | undefined;
      let kind: ChangedContext['change_kinds'][number] = 'new_message';
      try {
        const payload = JSON.parse(fact.payload_json) as Record<string, unknown>;
        const event = payload.event as Record<string, unknown> | undefined;
        if (event && typeof event === 'object') {
          const convId = event.conversation_id ?? event.thread_id;
          if (typeof convId === 'string') {
            contextId = convId;
          }
          const eventKind = event.event_kind;
          if (eventKind === 'deleted' || eventKind === 'delete' || eventKind === 'removed') {
            kind = 'moved';
          }
        }
      } catch {
        continue;
      }
      if (!contextId) continue;
      const set = groups.get(contextId) ?? new Set<string>();
      set.add(kind);
      groups.set(contextId, set);
    }

    const contexts: ChangedContext[] = [];
    for (const [contextId, kinds] of groups) {
      const previousOrdinal = coordinatorStore.getLatestRevisionOrdinal(contextId) ?? null;
      const currentOrdinal = (previousOrdinal ?? 0) + 1;
      contexts.push({
        context_id: contextId,
        previous_revision_ordinal: previousOrdinal,
        current_revision_ordinal: currentOrdinal,
        change_kinds: Array.from(kinds) as ChangedContext['change_kinds'],
      });
    }
    return contexts;
  }

  async function runDispatchPhase(): Promise<{
    signal: SyncCompletionSignal | null;
    openedCount: number;
  }> {
    const deps = await initDispatchDeps();

    // Fact-driven admission: read unadmitted facts and route them through the foreman.
    // This is the canonical dispatch trigger. Fact admission supersedes the older
    // signal-based onSyncCompleted() path because it preserves full event payloads
    // for context formation (see Task 122 signal reconciliation).
    const facts = deps.factStore.getUnadmittedFacts(scope.scope_id, 1000);

    let signal: SyncCompletionSignal | null = null;
    let openedCount = 0;

    if (facts.length > 0) {
      logger.info('Dispatch phase starting', { scope: scope.scope_id, facts: facts.length });

      const changedContexts = buildChangedContextsFromFacts(facts, deps.coordinatorStore);
      signal = {
        signal_id: `sync_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        scope_id: scope.scope_id,
        synced_at: new Date().toISOString(),
        changed_contexts: changedContexts,
      };

      const openResult = await deps.foreman.onFactsAdmitted(facts, scope.scope_id);
      openedCount = openResult.opened.length;

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

    // Recover stale leases mechanically, then route semantic failure through foreman.
    // This preserves the authority boundary: scheduler owns lease/execution lifecycle,
    // foreman owns all work-item state transitions.
    const recovered = deps.scheduler.recoverStaleLeases();
    for (const { workItemId } of recovered) {
      // Stale-lease recovery means the runner vanished (crash/restart), not that
      // the work failed. Use `immediate` so the item is runnable right away.
      deps.foreman.failWorkItem(workItemId, "Lease abandoned due to stale recovery", true, "immediate");
    }

    while (!deps.scheduler.isQuiescent(scope.scope_id)) {
      if (shutdownSignal?.shuttingDown) {
        logger.info('Dispatch phase interrupted by shutdown', { scope: scope.scope_id });
        break;
      }

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
        { coordinatorStore: deps.coordinatorStore, materializerRegistry, rootDir, getRuntimePolicy: (_scopeId: string) => scope.policy },
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

        deps.scheduler.completeExecution(attempt.execution_id, JSON.stringify(output));

        const evaluation = buildEvaluationRecord(output, {
          execution_id: attempt.execution_id,
          work_item_id: workItem.work_item_id,
          context_id: workItem.context_id,
        });

        // Persist evaluation before foreman resolution (runtime responsibility)
        persistEvaluation(evaluation, deps.coordinatorStore, scope.scope_id);

        await opts.dispatchHooks?.beforeResolveWorkItem?.(workItem, attempt, evaluation);

        const resolveResult = await deps.foreman.resolveWorkItem({
          work_item_id: workItem.work_item_id,
          execution_id: attempt.execution_id,
          evaluation_id: evaluation.evaluation_id,
        });

        if (!resolveResult.success && resolveResult.error) {
          logger.warn('Work item resolution failed', {
            scope: scope.scope_id,
            work_item_id: workItem.work_item_id,
            error: resolveResult.error,
          });
        }

        // Tool execution happens AFTER foreman governance.
        // Governance is the authority boundary: unauthorized or approval-required
        // tool requests are rejected or pended by the foreman, not by ad-hoc daemon gating.
        // Only tools from evaluations that passed governance (success + action_created/no_op)
        // are executed.
        if (resolveResult.success && output.tool_requests.length > 0) {
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
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        deps.scheduler.failExecution(attempt.execution_id, msg, true);
        deps.foreman.failWorkItem(workItem.work_item_id, msg, true);
        logger.error('Execution failed', { scope: scope.scope_id, work_item_id: workItem.work_item_id, error: msg });
      } finally {
        if (leaseRenewalTimer) {
          clearInterval(leaseRenewalTimer);
        }
      }
    }

    // Recover stale process executions before dispatching new work.
    // NOTE: This is an intentionally distinct recovery path from the scheduler's
    // `recoverStaleLeases()`. Process executor leases govern subprocess intents
    // (`process.run`), while scheduler leases govern charter execution work items.
    // The dual model is documented in `process-executor.ts` and `docs/02-architecture.md`.
    // Both paths are called explicitly here; do not merge or skip either.
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

    // Worker registry pass: run outbound workers through unified registry path
    for (const workerId of OUTBOUND_WORKER_IDS) {
      try {
        await drainWorker(deps.workerRegistry, workerId);
      } catch (outboundError) {
        const msg = outboundError instanceof Error ? outboundError.message : String(outboundError);
        logger.error('Outbound worker error', { scope: scope.scope_id, worker_id: workerId, error: msg });
      }
    }

    logger.info('Dispatch phase complete', { scope: scope.scope_id });
    return { signal, openedCount };
  }

  async function getNextRetryDeadline(): Promise<Date | null> {
    const deps = await initDispatchDeps();
    const row = deps.db.prepare(
      `select min(next_retry_at) as next_retry from work_items where scope_id = ? and status = 'failed_retryable' and next_retry_at is not null`,
    ).get(scope.scope_id) as { next_retry: string | null } | undefined;
    return row?.next_retry ? new Date(row.next_retry) : null;
  }

  async function getDispatchHealth() {
    const deps = await initDispatchDeps();
    const summary = buildScopeDispatchSummary(deps.coordinatorStore, deps.outboundStore, scope.scope_id);
    const workersRegistered = OUTBOUND_WORKER_IDS.every((id) => deps.workerRegistry.getWorker(id) !== undefined);
    const stuckWork = getStuckWorkItemSummary(deps.coordinatorStore);
    const stuckOutbound = getStuckOutboundSummary(deps.outboundStore);

    const lastSync = getLastSyncAt?.() ?? null;
    const threshold = syncFreshThresholdMs ?? 24 * 60 * 60 * 1000;
    const syncFresh = lastSync ? Date.now() - lastSync.getTime() < threshold : false;

    return {
      openWorkItems: summary.active_work_items,
      leasedWorkItems: summary.leased_work_items,
      executingWorkItems: summary.executing_work_items,
      failedRetryableWorkItems: summary.failed_retryable_work_items,
      failedTerminalWorkItems: summary.failed_terminal_work_items,
      pendingOutboundHandoffs: summary.pending_outbound_handoffs,
      recentDecisionsCount: summary.recent_decisions_count,
      stuck_items: {
        work_items: stuckWork,
        outbound_handoffs: stuckOutbound,
      },
      readiness: {
        dispatchReady: syncFresh,
        outboundHealthy: summary.readiness.outbound_healthy,
        workersRegistered,
        syncFresh,
      },
    };
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
      foreman: deps.foreman,
      rebuildViews: callbacks?.rebuildViews,
      rebuildProjections: callbacks?.rebuildProjections,
      runDispatchPhase,
      previewWork: async (options) => {
        const facts = deps.factStore.getFactsByScope(scope.scope_id, {
          contextIds: options.contextId ? [options.contextId] : undefined,
          since: options.since,
          factIds: options.factIds,
          limit: 1000,
        });
        return deps.foreman.previewWorkFromStoredFacts(
          facts,
          scope.scope_id,
          deps.charterRunner,
          deps.materializerRegistry,
          { tools: deps.toolCatalog, rootDir },
        );
      },
      getLastSyncAt,
      syncFreshThresholdMs,
    };
  }

  async function releaseActiveLeases(reason: WorkItemLease['release_reason']): Promise<number> {
    if (!dispatchDeps) {
      throw new Error('Dispatch dependencies not initialized');
    }
    const deps = dispatchDeps;
    const now = new Date().toISOString();
    const tx = deps.db.transaction(() => {
      const leases = deps.db.prepare(`
        select l.lease_id, l.work_item_id from work_item_leases l
        join work_items wi on wi.work_item_id = l.work_item_id
        where l.released_at is null and wi.scope_id = ?
      `).all(scope.scope_id) as Array<{ lease_id: string; work_item_id: string }>;

      for (const row of leases) {
        deps.coordinatorStore.releaseLease(row.lease_id, now, reason);
        deps.coordinatorStore.updateWorkItemStatus(row.work_item_id, 'opened', { updated_at: now });
        deps.db.prepare(`
          update execution_attempts
          set status = 'abandoned', completed_at = ?
          where work_item_id = ? and status = 'active'
        `).run(now, row.work_item_id);
      }
      return leases.length;
    });
    return tx();
  }

  return {
    runDispatchPhase,
    close,
    getObservationApiScope,
    getNextRetryDeadline,
    getDispatchHealth,
    releaseActiveLeases,
  };
}

export interface ShutdownSignal {
  shuttingDown: boolean;
}

export async function createScopeService(
  scope: ScopeConfig,
  globalConfig: ExchangeFsSyncConfig,
  opts: SyncServiceConfig,
  logger: ReturnType<typeof createLogger>,
  _shutdownSignal?: ShutdownSignal,
  getLastSyncAt?: () => Date | null,
  syncFreshThresholdMs?: number,
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

  const cursorStore = new FileCursorStore({ rootDir, scopeId: scope.scope_id });
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

  // Build unified projection rebuild registry
  const projectionRegistry = new ProjectionRebuildRegistry();
  projectionRegistry.register(viewStore.asProjectionRebuildSurface());

  const searchEngine = new SearchEngine({ rootDir });
  projectionRegistry.register({
    name: 'search_index',
    authoritativeInput: 'messages/ directory (canonical message records)',
    rebuild: async () => {
      searchEngine.initialize();
      await searchEngine.build(join(rootDir, 'messages'));
      searchEngine.close();
    },
  });

  const rebuildProjections = async () => { await projectionRegistry.rebuildAll(); };

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
    rebuildProjections,
    rebuildProjectionsAfterSync: scope.runtime.rebuild_search_after_sync || scope.runtime.rebuild_views_after_sync,
  });

  const dispatchContext = await createMailboxDispatchContext(
    scope,
    globalConfig,
    opts,
    logger,
    client,
    graphSource.user_id!,
    {
      rebuildViews: () => viewStore.rebuildAll(),
      rebuildProjections,
    },
    undefined,
    getLastSyncAt,
    syncFreshThresholdMs,
  );

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
  const wakeController = new WakeController();

  const pollingIntervalMs = opts.pollingIntervalMs ?? Math.min(
    ...scopes.map((s) => s.runtime.polling_interval_ms),
    60000,
  );

  let lastDispatchAt: Date | null = null;

  const shutdownSignal: ShutdownSignal = { shuttingDown: false };

  const DEFAULT_MAX_STALENESS_MS = 24 * 60 * 60 * 1000; // 24 hours (Task 234 documented default)
  const DEFAULT_MAX_CONSECUTIVE_ERRORS = 3;

  const healthMaxStalenessMs = opts.maxStalenessMs ?? globalConfig.health?.max_staleness_ms ?? DEFAULT_MAX_STALENESS_MS;
  const healthMaxConsecutiveErrors = opts.maxConsecutiveErrors ?? globalConfig.health?.max_consecutive_errors ?? DEFAULT_MAX_CONSECUTIVE_ERRORS;
  const healthMaxDrainMs = opts.maxDrainMs ?? globalConfig.health?.max_drain_ms ?? 30_000;

  function getScopeLastSyncAt(scopeId: string): Date | null {
    const mb = stats.perMailbox?.[scopeId];
    return mb?.lastSyncAt ?? stats.lastSyncAt ?? null;
  }

  const scopeServices = await Promise.all(
    scopes.map((scope) => createScopeService(
      scope,
      globalConfig,
      opts,
      logger,
      shutdownSignal,
      () => getScopeLastSyncAt(scope.scope_id),
      healthMaxStalenessMs,
    )),
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
    const maxStalenessMs = healthMaxStalenessMs;
    const maxConsecutiveErrors = healthMaxConsecutiveErrors;

    const scopeHealthEntries = await Promise.all(
      scopeServices.map(async (svc) => {
        try {
          const h = await svc.dispatchContext.getDispatchHealth();
          return { scopeId: svc.scope.scope_id, ...h };
        } catch {
          return null;
        }
      }),
    );

    const scopes = scopeHealthEntries.filter((s): s is NonNullable<typeof s> => s !== null);
    const totals = scopes.reduce(
      (acc, s) => ({
        openWorkItems: acc.openWorkItems + s.openWorkItems,
        leasedWorkItems: acc.leasedWorkItems + s.leasedWorkItems,
        executingWorkItems: acc.executingWorkItems + s.executingWorkItems,
        failedRetryableWorkItems: acc.failedRetryableWorkItems + s.failedRetryableWorkItems,
        failedTerminalWorkItems: acc.failedTerminalWorkItems + s.failedTerminalWorkItems,
        pendingOutboundHandoffs: acc.pendingOutboundHandoffs + s.pendingOutboundHandoffs,
      }),
      {
        openWorkItems: 0,
        leasedWorkItems: 0,
        executingWorkItems: 0,
        failedRetryableWorkItems: 0,
        failedTerminalWorkItems: 0,
        pendingOutboundHandoffs: 0,
      },
    );

    // Aggregate stuck items across all scopes
    function mergeStuckEntries(
      entries: Array<{ classification: string; count: number }>,
    ): Array<{ classification: string; count: number }> {
      const map = new Map<string, number>();
      for (const e of entries) {
        map.set(e.classification, (map.get(e.classification) ?? 0) + e.count);
      }
      return Array.from(map.entries()).map(([classification, count]) => ({ classification, count }));
    }

    const allStuckWork = scopes.flatMap((s) => s.stuck_items?.work_items ?? []);
    const allStuckOutbound = scopes.flatMap((s) => s.stuck_items?.outbound_handoffs ?? []);
    const stuck_items = {
      work_items: mergeStuckEntries(allStuckWork),
      outbound_handoffs: mergeStuckEntries(allStuckOutbound),
    };

    // Aggregate readiness across all scopes
    const allReadiness = scopes.map((s) => s.readiness);
    const aggregateReadiness = allReadiness.length > 0
      ? {
          dispatchReady: allReadiness.every((r) => r.dispatchReady),
          outboundHealthy: allReadiness.every((r) => r.outboundHealthy),
          workersRegistered: allReadiness.every((r) => r.workersRegistered),
          syncFresh: allReadiness.every((r) => r.syncFresh),
        }
      : {
          dispatchReady: false,
          outboundHealthy: false,
          workersRegistered: false,
          syncFresh: false,
        };

    // Staleness: true if last sync is older than threshold or too many consecutive errors
    const isStale = stats.lastSyncAt
      ? Date.now() - stats.lastSyncAt.getTime() > maxStalenessMs
      : true;
    const isErrorState = stats.consecutiveErrors >= maxConsecutiveErrors;

    const health: Omit<HealthStatus, 'timestamp'> = {
      status: running ? (isErrorState ? 'error' : 'healthy') : 'stopped',
      lastSyncAt: stats.lastSyncAt?.toISOString(),
      lastDispatchAt: lastDispatchAt?.toISOString(),
      cyclesCompleted: stats.cyclesCompleted,
      eventsApplied: stats.eventsApplied,
      errors: stats.errors,
      consecutiveErrors: stats.consecutiveErrors,
      pid: process.pid,
      ...totals,
      stuck_items,
      readiness: aggregateReadiness,
      isStale: isStale || isErrorState,
      thresholds: {
        maxStalenessMs,
        maxConsecutiveErrors,
      },
      scopes,
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
              const dispatchResult = await dispatchContext.runDispatchPhase();
              if (dispatchResult.openedCount > 0 || dispatchResult.signal) {
                lastDispatchAt = new Date();
              }
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

      // Consume any pending wake that arrived during the sync cycle.
      // Higher-priority wakes skip all sleep and immediately continue.
      const pendingWake = wakeController.getAndClearPendingWake();
      if (pendingWake) {
        logger.info('Pending wake consumed, skipping sleep', { reason: pendingWake, afterResult: result });
        continue;
      }

      if (result === 'retryable') {
        const delay = backoff.next();
        logger.info(`Backing off for ${delay}ms before retry`);
        const wakeReason = await wakeController.sleep(delay, 'retry');
        if (wakeReason !== 'retry') {
          logger.info(`Woken early by ${wakeReason} during retry backoff`);
        }
        continue;
      }

      backoff.reset();

      // Compute retry-aware sleep: wake early if retryable work becomes runnable
      let sleepMs = pollingIntervalMs;
      for (const svc of scopeServices) {
        try {
          const nextRetry = await svc.dispatchContext.getNextRetryDeadline?.();
          if (nextRetry) {
            const untilRetry = nextRetry.getTime() - Date.now();
            if (untilRetry <= 0) {
              sleepMs = 0;
              break;
            } else if (untilRetry < sleepMs) {
              sleepMs = untilRetry;
            }
          }
        } catch {
          // Ignore errors querying retry deadline
        }
      }

      if (sleepMs <= 0) {
        logger.debug('Retry work is due, skipping poll sleep');
        continue;
      }

      logger.debug(`Sleeping ${sleepMs}ms until next sync`);
      const wakeReason = await wakeController.sleep(sleepMs, 'poll');
      if (wakeReason !== 'poll') {
        logger.info(`Woken early by ${wakeReason}`);
      }
    }
  }

  async function stop(): Promise<void> {
    if (!running) {
      return;
    }

    logger.info('Stopping service');
    stopRequested = true;
    shutdownSignal.shuttingDown = true;

    // Stop accepting new external requests first so no new operator actions
    // arrive while we are draining in-flight work.
    if (observationServer) {
      await observationServer.stop().catch((err) => {
        logger.warn('Observation server stop error', { error: err.message });
      });
    }

    // Break any sleeping poll so runLoop checks stopRequested promptly.
    wakeController.stop();

    // Wait for the current sync/dispatch iteration to complete or timeout.
    const maxDrainMs = healthMaxDrainMs;
    if (currentIteration) {
      try {
        await Promise.race([
          currentIteration,
          new Promise<void>((_, reject) => {
            const timer = setTimeout(() => {
              reject(new Error('Drain timeout'));
            }, maxDrainMs);
            if (typeof timer.unref === 'function') {
              timer.unref();
            }
          }),
        ]);
      } catch (drainError) {
        const msg = drainError instanceof Error ? drainError.message : String(drainError);
        logger.warn('Drain timed out, force-releasing remaining leases', { error: msg, maxDrainMs });
      }
    }

    // Safety net: release any leases that are still active (either because
    // drain timed out or because a lease was acquired just before shutdown).
    for (const svc of scopeServices) {
      try {
        const count = await svc.dispatchContext.releaseActiveLeases('shutdown');
        if (count > 0) {
          logger.info('Released leases on shutdown', { scope: svc.scope.scope_id, count, reason: 'shutdown' });
        }
      } catch (releaseError) {
        const rmsg = releaseError instanceof Error ? releaseError.message : String(releaseError);
        logger.warn('Failed to release leases on shutdown', { scope: svc.scope.scope_id, error: rmsg });
      }
    }

    running = false;

    // Write final health with control-plane fields before shutting down
    await updateHealth().catch(() => {
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

  function requestWake(reason: WakeReason): void {
    const accepted = wakeController.requestWake(reason);
    if (accepted) {
      logger.debug('Out-of-band wake requested', { reason });
    }
  }

  return {
    async runOnce(): Promise<'success' | 'retryable' | 'fatal'> {
      if (running) {
        throw new Error('Service already running');
      }

      if (pidFile) {
        logger.debug('Writing PID file');
        await pidFile.write();
      }

      running = true;
      stopRequested = false;

      try {
        if (observationServer) {
          await registerScopeApis(scopeServices, { requestWake: requestWake as (reason: string) => void }, scopeApis);
          await observationServer.start();
        }

        const oncePromise = runSingleSync();
        currentIteration = oncePromise;
        return await oncePromise;
      } finally {
        await stop();
      }
    },

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
        await registerScopeApis(scopeServices, { requestWake: requestWake as (reason: string) => void }, scopeApis);
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

    requestWake,

    getStats(): SyncStats {
      return { ...stats };
    },
  };
}
