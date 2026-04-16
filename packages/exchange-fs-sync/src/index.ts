// Main exports
export { default as Database } from "better-sqlite3";
export { loadConfig } from "./config/load.js";
export { validateCharterRuntimeConfig } from "./config/validation.js";
export { DEFAULT_EXCHANGE_FS_SYNC_CONFIG } from "./config/defaults.js";
export {
  ConfigSchema,
  validateConfig,
  validateConfigOrThrow,
  isValidConfig,
  type ConfigSchemaType,
} from "./config/schema.js";
export type {
  Checkpoint,
  Source,
  SourceBatch,
  SourceRecord,
  SourceProvenance,
} from "./types/source.js";
export { ClientCredentialsTokenProvider } from "./adapter/graph/auth.js";
export { buildGraphTokenProvider } from "./config/token-provider.js";
export { DefaultGraphAdapter } from "./adapter/graph/adapter.js";
export { ExchangeSource } from "./adapter/graph/exchange-source.js";
export { TimerSource } from "./sources/timer-source.js";
export type { TimerSourceOptions, TimerTickPayload } from "./sources/timer-source.js";
export {
  WebhookSource,
  InMemoryWebhookEventQueue,
  FileWebhookEventQueue,
} from "./sources/webhook-source.js";
export type {
  WebhookSourceOptions,
  WebhookReceivedPayload,
  WebhookEventQueue,
  WebhookQueueRecord,
} from "./sources/webhook-source.js";
export {
  FilesystemSource,
  InMemoryFilesystemEventQueue,
} from "./sources/filesystem-source.js";
export type {
  FilesystemSourceOptions,
  FilesystemChangePayload,
  FilesystemEventQueue,
  FilesystemQueueRecord,
} from "./sources/filesystem-source.js";
export { GraphHttpClient } from "./adapter/graph/client.js";
export { GraphDeltaWalker } from "./adapter/graph/delta.js";
export {
  GraphSubscriptionManager,
  extractMessageId,
  validateClientState,
  isLifecycleNotification,
  isChangeNotification,
  MAX_SUBSCRIPTION_EXPIRATION_MINUTES,
  DEFAULT_SUBSCRIPTION_EXPIRATION_MINUTES,
  RENEWAL_BUFFER_MINUTES,
} from "./adapter/graph/subscription.js";
export type {
  SubscriptionConfig,
  Subscription,
  Notification,
  LifecycleNotification,
  GraphNotification,
  ChangeType,
  LifecycleEvent,
  CreateSubscriptionResult,
} from "./adapter/graph/subscription.js";
export { normalizeFolderRef, normalizeFlagged } from "./adapter/graph/scope.js";
export { MockGraphAdapter, createMockAdapter } from "./adapter/graph/mock-adapter.js";
export { normalizeBatch } from "./normalize/batch.js";
export { DefaultSyncRunner } from "./runner/sync-once.js";
export { MultiSourceSyncRunner } from "./runner/multi-source-sync.js";
export { ScopeCursorStore } from "./persistence/scope-cursor.js";
export { FileCursorStore } from "./persistence/cursor.js";
export { FileApplyLogStore } from "./persistence/apply-log.js";
export { DefaultProjector, applyEvent } from "./projector/apply-event.js";
export { FileBlobStore } from "./persistence/blobs.js";
export { FileMessageStore } from "./persistence/messages.js";
export { FileTombstoneStore } from "./persistence/tombstones.js";
export { FileViewStore } from "./persistence/views.js";
export { FileLock } from "./persistence/lock.js";

// Outbound exports
export {
  isValidTransition,
  isTerminalStatus,
  VALID_TRANSITIONS,
  TERMINAL_STATUSES,
  isVersionEligible,
} from "./outbound/types.js";
export type {
  OutboundActionType,
  OutboundStatus,
  OutboundCommand,
  OutboundVersion,
  ManagedDraft,
  OutboundTransition,
} from "./outbound/types.js";
export { SqliteOutboundStore } from "./outbound/store.js";
export type { OutboundStore, SqliteOutboundStoreOptions, SqliteOutboundStoreDbOptions } from "./outbound/store.js";

// Coordinator exports
export { SqliteCoordinatorStore } from "./coordinator/store.js";
export type {
  CoordinatorStore,
  ThreadRecord,
  ConversationRecord,
  ConversationRevision,
  NormalizedThreadContext,
  CharterOutputRow,
  ForemanDecisionRow,
  PolicyOverrideRow,
  WorkItem,
  WorkItemStatus,
  WorkItemLease,
  ExecutionAttempt,
  ExecutionAttemptStatus,
  Evaluation,
  ToolCallRecord,
  ToolCallStatus,
  OperatorActionRequest,
} from "./coordinator/types.js";
export type { SqliteCoordinatorStoreOptions } from "./coordinator/store.js";
export { deriveThreadId } from "./coordinator/thread-id.js";

// Foreman exports
export { DefaultForemanFacade } from "./foreman/facade.js";
export type {
  ForemanFacadeDeps,
  ForemanFacadeOptions,
} from "./foreman/facade.js";
export {
  MailboxContextStrategy,
  TimerContextStrategy,
  WebhookContextStrategy,
  FilesystemContextStrategy,
} from "./foreman/context.js";
export type {
  ForemanFacade,
  SyncCompletionSignal,
  ChangedConversation,
  WorkOpeningResult,
  OpenedWorkItem,
  SupersededWorkItem,
  ResolveWorkItemRequest,
  ResolutionResult,
  EvaluationEnvelope,
  CharterOutputEnvelope,
  CharterInvocationEnvelope,
  AllowedAction,
  ToolCatalogEntry,
  PriorEvaluation,
  CharterClassification,
  ExtractedFact,
  ProposedAction,
  EscalationProposal,
  ToolInvocationRequest,
  PolicyContext,
  ContextFormationStrategy,
} from "./foreman/types.js";
export { validateCharterOutput, arbitrateEvaluations } from "./foreman/validation.js";
export { OutboundHandoff } from "./foreman/handoff.js";

// Scheduler exports
export { SqliteScheduler } from "./scheduler/scheduler.js";
export type {
  Scheduler,
  SchedulerOptions,
  LeaseAcquisitionResult,
} from "./scheduler/types.js";
export { createLeaseScanner, type LeaseScanner } from "./scheduler/lease-scanner.js";

// Charter runtime exports
export { MockCharterRunner } from "./charter/index.js";
export type { CharterRunner, MockCharterRunnerOptions } from "./charter/index.js";
export {
  buildInvocationEnvelope,
  buildEvaluationRecord,
} from "./charter/index.js";
export type {
  BuildInvocationEnvelopeDeps,
  BuildInvocationEnvelopeOptions,
  BuildEvaluationRecordOptions,
} from "./charter/index.js";

// Agent trace exports
export { SqliteAgentTraceStore } from "./agent/traces/store.js";
export { SqliteFactStore } from "./facts/store.js";
export { SqliteIntentStore } from "./intent/store.js";
export { SqliteProcessExecutionStore } from "./executors/store.js";
export type { ProcessExecutionStore, SqliteProcessExecutionStoreOptions, SqliteProcessExecutionStoreDbOptions } from "./executors/store.js";
export { ProcessExecutor } from "./executors/process-executor.js";
export type { ProcessExecutorDeps } from "./executors/process-executor.js";
export type { ProcessExecution, ProcessRunPayload } from "./executors/types.js";
export {
  isValidPhaseTransition,
  isTerminalPhase,
  canConfirm,
  mapOutboundStatusToPhase,
  mapOutboundStatusToConfirmation,
  deriveConfirmationOnComplete,
  assertValidPhaseTransition,
} from "./executors/lifecycle.js";
export type {
  ExecutionPhase,
  ConfirmationStatus,
  ExecutionLifecycle,
} from "./executors/lifecycle.js";
export {
  outboundCommandToExecutionLifecycle,
  MailLifecycleAdapter,
} from "./executors/mail-lifecycle.js";
export type { MailLifecycleQueryDeps } from "./executors/mail-lifecycle.js";
export { ExecutionCoordinator } from "./executors/coordinator.js";
export type { ExecutionCoordinatorDeps } from "./executors/coordinator.js";
export {
  ProcessConfirmationResolver,
  MailConfirmationResolver,
  CompositeConfirmationResolver,
} from "./executors/confirmation.js";
export type {
  ConfirmationResolver,
  ProcessConfirmationResolverDeps,
  MailConfirmationResolverDeps,
  CompositeConfirmationResolverDeps,
} from "./executors/confirmation.js";
export { DefaultWorkerRegistry, drainWorker } from "./workers/registry.js";
export type { WorkerRegistry, RegisteredWorker, WorkerIdentity, WorkerFn, WorkerExecutionResult, ConcurrencyPolicy } from "./workers/index.js";
export type { IntentStore, SqliteIntentStoreOptions, SqliteIntentStoreDbOptions } from "./intent/store.js";
export type { Intent, IntentType, IntentStatus } from "./intent/types.js";
export { IntentHandoff } from "./intent/handoff.js";
export {
  getIntentFamily,
  validateIntent,
  assertValidIntent,
  INTENT_FAMILIES,
} from "./intent/registry.js";
export type {
  IntentFamily,
  IdempotencyScope,
  ConfirmationModel,
  SchemaProperty,
} from "./intent/registry.js";
export type { IntentHandoffDeps } from "./intent/handoff.js";
export type { Fact, FactStore, FactType, FactProvenance } from "./facts/types.js";
export { buildFactId } from "./ids/fact-id.js";
export { sourceRecordToFact } from "./facts/record-to-fact.js";
export type {
  AgentTraceStore,
  AgentTrace,
  TraceType,
} from "./agent/traces/types.js";
export type { SqliteAgentTraceStoreOptions } from "./agent/traces/store.js";
export type { SqliteFactStoreOptions } from "./facts/store.js";

// Lifecycle exports
export {
  cleanupTombstones,
  compactMessages,
  vacuum,
  applyRetentionPolicy,
  getTombstoneStats,
  getCompactionStats,
  getRetentionStats,
  shouldRunCleanup,
  getNextRunTime,
  maybeRunCleanup,
  runWithTimeLimit,
  parseSize,
} from "./lifecycle/index.js";
export type {
  CleanupOptions,
  CleanupResult,
  CompactionOptions,
  CompactionResult,
  VacuumOptions,
  VacuumResult,
  RetentionPolicy,
  RetentionResult,
  CleanupSchedule,
  LifecycleConfig,
} from "./lifecycle/types.js";
export { cleanupTmp } from "./recovery/cleanup-tmp.js";
export { writeHealthFile, createHealthWriter } from "./health.js";

// Multi-mailbox exports
export {
  loadMultiMailboxConfig,
  validateMailboxConfig,
  getMailboxById,
  isMultiMailboxConfig,
  DEFAULT_GLOBAL_CONFIG,
  DEFAULT_SYNC_OPTIONS,
} from "./config/multi-mailbox.js";
export type {
  MailboxConfig,
  MultiMailboxConfig,
  MultiMailboxGlobalConfig,
  TokenProviderConfig,
  ResourceLimits,
  LoadMultiMailboxOptions,
  LoadMultiMailboxResult,
} from "./config/multi-mailbox.js";

export {
  ResourceManager,
  getGlobalResourceManager,
  resetGlobalResourceManager,
  DEFAULT_RESOURCE_LIMITS,
} from "./utils/resources.js";
export type { ResourceUsage } from "./utils/resources.js";

export {
  SharedTokenProvider,
  getGlobalSharedTokenProvider,
  resetGlobalSharedTokenProvider,
} from "./adapter/graph/shared-token.js";

export {
  syncMultiple,
  gracefulShutdown,
  allMailboxesHealthy,
  getFailedMailboxIds,
  formatMultiSyncResult,
} from "./runner/multi-sync.js";
export type {
  MultiSyncOptions,
  MultiSyncResult,
  SyncMultipleOptions,
} from "./runner/multi-sync.js";

export {
  writeMultiMailboxHealth,
  readMultiMailboxHealth,
  markMailboxSyncing,
  formatHealthSummary,
  formatHealthTable,
} from "./health-multi.js";
export type {
  MailboxHealth,
  GlobalHealthMetrics,
  MultiMailboxHealth,
  MailboxSyncResult,
  MailboxStatus,
} from "./health-multi.js";

// Normalize exports
export { normalizeMessageToPayload, normalizeMessage } from "./normalize/message.js";
export { normalizeDeltaEntry } from "./normalize/delta-entry.js";
export { normalizeAttachments } from "./normalize/attachments.js";
export { normalizeBody } from "./normalize/body.js";
export { normalizeRecipient, normalizeRecipientList } from "./normalize/addresses.js";
export type { GraphMessage, GraphListResponse } from "./types/graph.js";

// ID exports
export { buildEventId, hashNormalizedPayload } from "./ids/event-id.js";

// Observability exports
export type {
  DaemonCycleSummary,
  MailboxDispatchSummary,
  WorkItemLifecycleSummary,
  ExecutionAttemptSummary,
  ToolCallSummary,
  OutboundHandoffSummary,
  ControlPlaneStatusSnapshot,
  ProcessExecutionSummary,
  IntentSummary,
  IntentExecutionSummary,
  ProcessExecutionDetail,
  MailExecutionDetail,
  MailExecutionTransition,
  IntentLifecycleTransition,
  WorkerStatusObservation,
  ContextSummary,
  FactSummary,
  TimelineEvent,
  WorkItemTimeline,
  ContextTimeline,
  FactTimeline,
  ObservationPlaneSnapshot,
  LeaseSummary,
  StaleLeaseRecoveryEvent,
  QuiescenceIndicator,
  MailboxVerticalView,
  MailboxConversationSummary,
} from "./observability/types.js";
export {
  OperatorErrorCategory,
  classifyErrorToOperatorCategory,
  classifyWorkItemForOperator,
  classifyToolCallForOperator,
  type OperatorErrorClassification,
} from "./observability/errors.js";
export {
  getActiveWorkItems,
  getRecentFailedWorkItems,
  getWorkItemsAwaitingRetry,
  getRecentOutboundCommands,
  getRecentSessionsAndExecutions,
  getToolCallSummary,
  buildMailboxDispatchSummary,
  buildControlPlaneSnapshot,
  getProcessExecutionSummaries,
  getIntentSummaries,
  getIntentExecutionSummaries,
  getProcessExecutionDetails,
  getMailExecutionDetails,
  getIntentLifecycleTransitions,
  getWorkerStatuses,
  getRecentFacts,
  getContextSummaries,
  getMailboxVerticalView,
  getWorkItemTimeline,
  getContextTimeline,
  getFactTimeline,
  getUnifiedTimeline,
  buildObservationPlaneSnapshot,
  getActiveLeases,
  getRecentStaleLeaseRecoveries,
  getQuiescenceIndicator,
} from "./observability/queries.js";
export { ObservationPlane } from "./observability/plane.js";
export type { ObservationPlaneDeps } from "./observability/plane.js";

// Error handling exports
export {
  ExchangeFSSyncError,
  NetworkError,
  AuthError,
  StorageError,
  CorruptionError,
  RateLimitError,
  ErrorCode,
  classifyGraphError,
  classifyFsError,
  wrapError,
} from "./errors.js";

// Retry and resilience exports
export {
  withRetry,
  CircuitBreaker,
  globalCircuitBreakers,
  resetCircuitBreakers,
  handleGraphError,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from "./retry.js";
export type {
  RetryConfig,
  CircuitBreakerConfig,
  RetryContext,
  RetryResult,
} from "./retry.js";

// Security exports
export {
  SecureStorage,
  KeychainStorage,
  FileSecureStorage,
  InMemorySecureStorage,
  createSecureStorage,
} from "./auth/secure-storage.js";
export {
  secureRandomFilename,
  createSecureTempDir,
  withSecureTemp,
  writeSecureTempFile,
  readAndDeleteSecureTempFile,
  createAutoCleanupTempFile,
  writeFileSecurely,
  createSecureTempFileStream,
} from "./utils/temp.js";
export type {
  SecureTempOptions,
  TempFileStreamOptions,
  TempFileStreamResult,
} from "./utils/temp.js";
export {
  ensurePrivateFile,
  ensurePrivateDirectory,
  checkFilePermissions,
  checkDirectoryPermissions,
  verifyFileAccess,
  applySecurePermissions,
  scanDirectoryPermissions,
  fixDirectoryPermissions,
  runSecurityChecks,
  isRunningAsRoot,
  PermissionMode,
} from "./utils/permissions.js";
export type {
  PermissionCheckResult,
  SecurityCheckResult,
} from "./utils/permissions.js";

// Log sanitization exports
export {
  sanitizeForLogging,
  sanitizeError,
  sanitizeHeaders,
  sanitizeUrl,
  sanitizeLogEntry,
  redactEmail,
  isSensitiveField,
  REDACTED,
} from "./logging/sanitize.js";
export type { LogEntry } from "./logging/sanitize.js";

// Logging and metrics exports
export {
  configureLogging,
  getLoggingConfig,
  resetLogging,
  setLogLevel,
  setLogFormat,
} from "./logging/index.js";
export {
  metrics,
  MetricsCollector,
  MetricNames,
} from "./metrics.js";
export type { MetricsSnapshot } from "./metrics.js";

// Batch processing exports
export {
  batchSync,
  streamEvents,
  processEventsConcurrently,
  createThrottledFunction,
} from "./runner/batch-sync.js";
export type {
  SyncProgress,
  BatchSyncOptions,
  BatchSyncResult,
} from "./runner/batch-sync.js";

// Memory profiling exports
export {
  getMemoryUsage,
  formatMemoryUsage,
  logMemorySnapshot,
  MemoryMonitor,
  MemoryWatcher,
  triggerHeapSnapshot,
  estimateObjectSize,
  formatBytes,
} from "./utils/memory.js";
export type {
  MemoryUsage,
  MemoryAlertCallback,
} from "./utils/memory.js";

// Timing utilities
export {
  sleep,
  createTimeout,
  withTimeout,
  measureTime,
  debounce,
  throttle,
} from "./utils/timing.js";

// Secure config exports
export {
  resolveSecrets,
  extractSecureRefs,
  validateSecureRefs,
  isSecureRef,
} from "./config/secure-config.js";
export { loadCharterEnv } from "./config/env.js";
export type { CharterEnvConfig } from "./config/env.js";
export type { SecureRef } from "./config/secure-config.js";

// Type exports
export type {
  ExchangeFsSyncConfig,
  ScopeConfig,
} from "./config/types.js";
export type {
  GraphAdapterConfig,
} from "./adapter/graph/adapter.js";
export type {
  MockAdapterOptions,
} from "./adapter/graph/mock-adapter.js";
export type {
  SyncOnceDeps,
  SyncError,
  DetailedSyncResult,
} from "./runner/sync-once.js";
export type { MultiSyncOnceDeps } from "./runner/multi-source-sync.js";
export {
  isSyncSuccess,
  isSyncRetryable,
  getErrorSummary,
} from "./runner/sync-once.js";
export type {
  NormalizeMessageInput,
} from "./normalize/message.js";
export type {
  NormalizeDeltaEntryInput,
} from "./normalize/delta-entry.js";
export type {
  NormalizeBatchInput,
} from "./normalize/batch.js";

// Re-export all types from types directory
export * from "./types/index.js";

// Progress types
export type {
  ProgressEvent,
  ProgressCallback,
  SyncPhase,
  ProgressTracker,
} from "./types/progress.js";
export type {
  HealthFileData,
  HealthStatus,
  HealthWriterOptions,
  HealthMetrics,
  HealthRecentError,
} from "./health.js";

export {
  createTracer,
  setGlobalTracer,
  getTracer,
  trace,
  createSpan,
  initTracing,
  type Span,
  type SpanContext,
  type Tracer,
  type SpanExporter,
} from "./tracing.js";
