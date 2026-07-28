// Types
export type {
  LinuxSiteMode,
  LinuxSiteConfig,
  LinuxCycleOutcome,
  LinuxCycleResult,
  SiteHealthRecord,
  CycleTraceRecord,
} from "./types.js";

// Path utilities
export {
  detectMode,
  resolveSiteRoot,
  sitePath,
  ensureSiteDir,
  siteConfigPath,
  siteDbPath,
  siteLogsPath,
  siteTracesPath,
  siteRuntimePath,
  SITE_SUBDIRECTORIES,
} from "./path-utils.js";

// Credentials
export {
  envVarName,
  resolveSecret,
  resolveSecretWithEvidence,
  resolveSecretRequired,
  checkProviderReadiness,
} from "./credentials.js";
export type {
  ResolveSecretOptions,
  SecretResolutionSource,
  SecretResolutionEvidence,
  ProviderReadinessOptions,
  ProviderReadiness,
} from "./credentials.js";

// Coordinator
export {
  SqliteSiteCoordinator,
  openCoordinatorDb,
} from "./coordinator.js";
export type { LinuxSiteCoordinator } from "./coordinator.js";

// Runner
export { DefaultLinuxSiteRunner } from "./runner.js";
export type { LinuxSiteRunner, CycleConfig } from "./runner.js";

// Recovery
export { checkLockHealth, recoverStuckLock } from "./recovery.js";
export type { LockHealthReport } from "./recovery.js";

// Supervisor
export {
  DefaultLinuxSiteSupervisor,
  isSystemdAvailable,
  generateSystemdService,
  generateSystemdTimer,
  generateCronEntry,
  generateShellScript,
  writeSystemdUnits,
  removeSystemdUnits,
  writeCronEntry,
  writeShellScript,
  unitDir,
  validateSystemdService,
  inspectSystemdCapability,
} from "./supervisor.js";
export type {
  LinuxSiteSupervisor,
  SupervisorRegistration,
  ServiceGenerationOptions,
  SystemdCapability,
  SystemdCapabilityOptions,
  SupervisorLifecycleOperation,
  SupervisorLifecycleResult,
  SystemctlCommandRunner,
  LinuxSiteSupervisorOptions,
} from "./supervisor.js";

// Installation lifecycle
export {
  LINUX_INSTALLATION_LIFECYCLE_SCHEMA,
  LINUX_INSTALLATION_STATE_SCHEMA,
  LINUX_DATA_REMOVAL_CONFIRMATION,
  linuxInstallationStatePath,
  linuxInstallationEvidencePath,
  readLinuxInstallationState,
  buildLinuxInstallationLifecyclePlan,
  applyLinuxInstallationLifecyclePlan,
} from "./installation-lifecycle.js";
export type {
  LinuxInstallationLifecycleOperation,
  LinuxInstallationLifecycleStatus,
  LinuxInstallationState,
  LinuxInstallationLifecycleRequest,
  LinuxInstallationLifecycleStep,
  LinuxInstallationLifecyclePlan,
  LinuxInstallationLifecycleApplyResult,
} from "./installation-lifecycle.js";

// Observability
export {
  getLinuxSiteStatus,
  getSiteHealth,
  getLastCycleTrace,
  listAllSites,
  checkSite,
  isLinuxSite,
  resolveLinuxSiteMode,
} from "./observability.js";
export type {
  LinuxSiteStatus,
  DiscoveredLinuxSite,
  SiteDoctorCheck,
} from "./observability.js";

// Site control
export {
  LinuxSiteControlClient,
  createLinuxSiteControlClient,
  type LinuxSiteControlContext,
  type LinuxSiteControlContextFactory,
} from "./site-control.js";

// Console adapter
export {
  linuxSiteAdapter,
  LinuxSiteObservationApi,
} from "./console-adapter.js";
