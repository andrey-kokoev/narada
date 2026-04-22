/**
 * macOS Site materialization for Narada.
 *
 * Exports the bounded Cycle runner, LaunchAgent supervision,
 * path utilities, and site-local coordinator.
 */

export { DefaultMacosSiteRunner, type MacosSiteRunner, type CycleConfig, type CycleRunOptions } from "./runner.js";
export {
  generateLaunchAgentPlist,
  generateWrapperScript,
  writeLaunchAgentFiles,
  generateLoadCommand,
  generateUnloadCommand,
  generateStatusCommand,
  type LaunchAgentPaths,
} from "./supervisor.js";
export {
  resolveSiteRoot,
  sitePath,
  sitePathFromRoot,
  ensureSiteDir,
  ensureSiteDirFromRoot,
  siteConfigPath,
  siteConfigPathFromRoot,
  siteDbPath,
  siteCoordinatorPath,
  siteLogsPath,
  siteLogsPathFromRoot,
  siteTracesPath,
  siteTracesPathFromRoot,
  SITE_SUBDIRECTORIES,
} from "./path-utils.js";
export { SqliteSiteCoordinator, openCoordinatorDb, type MacosSiteCoordinator } from "./coordinator.js";
export type {
  MacosSiteConfig,
  MacosCycleOutcome,
  MacosCycleResult,
  SiteHealthRecord,
  CycleTraceRecord,
} from "./types.js";
export {
  resolveSecret,
  resolveSecretRequired,
  envVarName,
  keychainServiceName,
  setupKeychainAccess,
  type ResolveSecretOptions,
} from "./credentials.js";
export {
  getMacosSiteStatus,
  getSiteHealth,
  getLastCycleTrace,
  getSiteSummary,
  discoverMacosSites,
  isMacosSite,
  type MacosSiteStatus,
  type DiscoveredMacosSite,
} from "./observability.js";
export { writeHealthRecord, readHealthRecord } from "./health.js";
export { appendCycleTrace, writeTraceArtifact } from "./trace.js";

/**
 * Convenience entrypoint for CLI / wrapper script invocation.
 *
 * Reads site configuration from the site root and runs one bounded Cycle.
 */
export async function runCycle(options: { site_id: string; site_root?: string }): Promise<void> {
  const { siteConfigPath } = await import("./path-utils.js");
  const { DefaultMacosSiteRunner } = await import("./runner.js");
  const { readFile } = await import("node:fs/promises");

  const configPath = siteConfigPath(options.site_id);

  let configRaw: string;
  try {
    configRaw = await readFile(configPath, "utf8");
  } catch {
    throw new Error(`Site config not found: ${configPath}`);
  }

  const config = JSON.parse(configRaw) as import("./types.js").MacosSiteConfig;
  // site_root in config may differ from resolved default; runner uses config value

  const runner = new DefaultMacosSiteRunner();
  const result = await runner.runCycle(config);

  if (result.status === "failed") {
    process.exitCode = 1;
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(result, null, 2));
}
