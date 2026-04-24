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
  resolveSecretRequired,
} from "./credentials.js";
export type { ResolveSecretOptions } from "./credentials.js";

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
} from "./supervisor.js";
export type {
  LinuxSiteSupervisor,
  SupervisorRegistration,
  ServiceGenerationOptions,
} from "./supervisor.js";

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
