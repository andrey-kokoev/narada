export type {
  WindowsSiteVariant,
  WindowsAuthorityLocus,
  WindowsUserSiteLocus,
  WindowsPcSiteLocus,
  WindowsSiteLocus,
  WindowsUserSiteSyncPosture,
  WindowsUserSiteSyncConfig,
  SiteVariant,
  WindowsSiteConfig,
  WindowsCycleOutcome,
  WindowsCycleResult,
  SiteHealthRecord,
  CycleTraceRecord,
} from "./types.js";

export {
  defaultWindowsUserSiteLocus,
  defaultWindowsPcSiteLocus,
  defaultWindowsSiteLocus,
  resolveWindowsSiteLocus,
  validateWindowsSiteLocus,
  type WindowsSiteLocusInput,
  type WindowsSiteLocusValidationResult,
} from "./authority-locus.js";

export {
  detectVariant,
  SITE_SUBDIRECTORIES,
  resolveSiteRoot,
  resolveWindowsSiteRootByLocus,
  sitePath,
  ensureSiteDir,
  siteConfigPath,
  siteDbPath,
  siteLogsPath,
  siteTracesPath,
  type WindowsSiteRootPolicy,
} from "./path-utils.js";

export {
  SqliteSiteCoordinator,
  openCoordinatorDb,
  type WindowsSiteCoordinator,
} from "./coordinator.js";

export {
  DefaultWindowsSiteRunner,
  type WindowsSiteRunner,
  type CycleConfig,
  type CycleRunOptions,
} from "./runner.js";

export {
  WindowsCycleCoordinator,
  type FactRecord,
  type FixtureSourceDelta,
  type ExecutionAttemptRecord,
} from "./cycle-coordinator.js";

export {
  createSyncStepHandler,
  createDeriveWorkStepHandler,
  createEvaluateStepHandler,
  createHandoffStepHandler,
  createEffectExecuteStepHandler,
  createReconcileStepHandler,
  createDefaultStepHandlers,
  fixtureEvaluate,
  type CycleStepId,
  type CycleStepName,
  type CycleStepStatus,
  type CycleStepContext,
  type CycleStepHandler,
  type CycleStepResult,
  type FixtureEvaluationInput,
  type FixtureEvaluationOutput,
} from "./cycle-step.js";

export {
  generateSystemdUnits,
  writeSystemdUnits,
  generateCronEntry,
  generateShellScript,
  writeShellScript,
  generateRegisterTaskScript,
  generateUnregisterTaskScript,
  generateTaskStatusScript,
  buildTaskInfo,
  type SupervisorRegistration,
  type TaskSchedulerOptions,
  type ScheduledTaskInfo,
} from "./supervisor.js";

export {
  SiteRegistry,
  type RegisteredSite,
  type RegistryAuditRecord,
  resolveRegistryDbPath,
  resolveRegistryDbPathByLocus,
  resolveSitesBaseDir,
  openRegistryDb,
  type WindowsRegistryPathPolicy,
} from "./registry.js";

export {
  ControlRequestRouter,
  type ConsoleControlRequest,
  type ControlRequestResult,
  type SiteControlClient,
  type SiteControlClientFactory,
} from "./router.js";

export {
  WindowsSiteControlClient,
  createWindowsSiteControlClient,
  createWindowsSiteControlClientFactory,
  type WindowsSiteControlContext,
  type WindowsSiteControlContextFactory,
} from "./site-control.js";

export {
  envVarName,
  credentialManagerTarget,
  resolveSecret,
  resolveSecretRequired,
  type ResolveSecretOptions,
} from "./credentials.js";

export {
  type SiteObservationApi,
  type StuckWorkItem,
  type PendingOutboundCommand,
  type PendingDraft,
  type CredentialRequirement,
} from "./site-observation.js";

export {
  aggregateHealth,
  deriveAttentionQueue,
  type CrossSiteHealthSummary,
  type SiteHealthView,
  type AttentionQueueItem,
  type AttentionItemType,
  type AttentionSeverity,
  type AttentionRemediation,
} from "./aggregation.js";

export {
  SiteHealthTracker,
  shouldNotify,
  buildNotification,
  CrossSiteNotificationRouter,
} from "./cross-site-notifier.js";

export {
  type OperatorNotification,
  type NotificationAdapter,
  type NotificationRateLimiter,
  type NotificationEmitter,
  LogNotificationAdapter,
  DefaultNotificationEmitter,
  NullNotificationEmitter,
  notifyOperator,
  DEFAULT_NOTIFICATION_COOLDOWN_MS,
} from "./notification.js";

export {
  getWindowsSiteStatus,
  getSiteHealth,
  getLastCycleTrace,
  discoverWindowsSites,
  resolveSiteVariant,
  WindowsSiteObservationApi,
  createWindowsSiteObservationApi,
  type WindowsSiteStatus,
  type DiscoveredSite,
} from "./observability.js";

export {
  type ConsoleSiteAdapter,
  windowsSiteAdapter,
} from "./console-adapter.js";
