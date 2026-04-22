/**
 * Observability surface for Linux Sites.
 *
 * Provides operator inspection functions:
 * - Query site health and last cycle trace from SQLite
 * - Discover all configured Linux Sites on the local machine
 * - Run doctor checks (directory, DB, lock, health)
 */

import { readdirSync, existsSync, statSync } from "node:fs";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  SiteHealthRecord,
  CycleTraceRecord,
  LinuxSiteMode,
} from "./types.js";
import { resolveSiteRoot } from "./path-utils.js";
import { SqliteSiteCoordinator, openCoordinatorDb } from "./coordinator.js";

export interface LinuxSiteStatus {
  siteId: string;
  mode: LinuxSiteMode;
  siteRoot: string;
  health: SiteHealthRecord;
  lastTrace: CycleTraceRecord | null;
}

export interface DiscoveredLinuxSite {
  siteId: string;
  mode: LinuxSiteMode;
  siteRoot: string;
}

export interface SiteDoctorCheck {
  name: string;
  status: "pass" | "fail" | "warn";
  detail: string;
  remediation?: string;
}

/**
 * Check whether a site directory exists at the canonical Linux path for the given mode.
 */
export function isLinuxSite(
  siteId: string,
  mode?: LinuxSiteMode
): boolean {
  if (mode) {
    return isSiteDir(resolveSiteRoot(siteId, mode));
  }
  // Try system first, then user
  return (
    isSiteDir(resolveSiteRoot(siteId, "system")) ||
    isSiteDir(resolveSiteRoot(siteId, "user"))
  );
}

/**
 * Resolve the mode for a site by checking where its directory exists.
 *
 * Checks system path first, then user path.
 * Returns null if the site cannot be found.
 */
export function resolveLinuxSiteMode(siteId: string): LinuxSiteMode | null {
  if (isSiteDir(resolveSiteRoot(siteId, "system"))) return "system";
  if (isSiteDir(resolveSiteRoot(siteId, "user"))) return "user";
  return null;
}

/**
 * Read the current health and last cycle trace for a Linux Site.
 */
export async function getLinuxSiteStatus(
  siteId: string,
  mode: LinuxSiteMode
): Promise<LinuxSiteStatus> {
  const siteRoot = resolveSiteRoot(siteId, mode);
  const db = await openCoordinatorDb(siteId, mode);
  const coordinator = new SqliteSiteCoordinator(db);
  try {
    const health = coordinator.getHealth(siteId);
    const lastTrace = coordinator.getLastCycleTrace(siteId);
    return { siteId, mode, siteRoot, health, lastTrace };
  } finally {
    coordinator.close();
  }
}

/**
 * Read only the health record for a Linux Site.
 */
export async function getSiteHealth(
  siteId: string,
  mode: LinuxSiteMode
): Promise<SiteHealthRecord> {
  const db = await openCoordinatorDb(siteId, mode);
  const coordinator = new SqliteSiteCoordinator(db);
  try {
    return coordinator.getHealth(siteId);
  } finally {
    coordinator.close();
  }
}

/**
 * Read only the last cycle trace for a Linux Site.
 */
export async function getLastCycleTrace(
  siteId: string,
  mode: LinuxSiteMode
): Promise<CycleTraceRecord | null> {
  const db = await openCoordinatorDb(siteId, mode);
  const coordinator = new SqliteSiteCoordinator(db);
  try {
    return coordinator.getLastCycleTrace(siteId);
  } finally {
    coordinator.close();
  }
}

/**
 * Discover all Linux Sites on the local machine.
 *
 * Scans:
 * - System: /var/lib/narada/*
 * - User: ~/.local/share/narada/* (or $XDG_DATA_HOME/narada/*)
 *
 * A directory is considered a site if it contains a db/coordinator.db file.
 */
export function listAllSites(mode?: LinuxSiteMode): DiscoveredLinuxSite[] {
  const sites: DiscoveredLinuxSite[] = [];

  const scanRoot = (root: string, siteMode: LinuxSiteMode) => {
    if (!existsSync(root)) return;
    for (const entry of readdirSync(root)) {
      const siteRoot = join(root, entry);
      if (isSiteDir(siteRoot)) {
        sites.push({ siteId: entry, mode: siteMode, siteRoot });
      }
    }
  };

  if (mode === "system" || mode === undefined) {
    scanRoot("/var/lib/narada", "system");
  }

  if (mode === "user" || mode === undefined) {
    const xdgDataHome = process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
    scanRoot(join(xdgDataHome, "narada"), "user");
  }

  return sites;
}

/**
 * Run doctor checks for a Linux Site.
 *
 * Checks:
 * 1. Site directory exists and is writable
 * 2. Coordinator database is readable
 * 3. Lock is not stuck
 * 4. Health status is not critical/auth_failed
 * 5. Cycle freshness (within threshold)
 */
export async function checkSite(
  siteId: string,
  mode: LinuxSiteMode,
  staleThresholdMinutes = 60
): Promise<SiteDoctorCheck[]> {
  const checks: SiteDoctorCheck[] = [];
  const siteRoot = resolveSiteRoot(siteId, mode);

  // 1. Site directory exists and is writable
  try {
    const s = await stat(siteRoot);
    if (s.isDirectory()) {
      checks.push({
        name: "site-directory",
        status: "pass",
        detail: `Site directory exists: ${siteRoot}`,
      });
    } else {
      checks.push({
        name: "site-directory",
        status: "fail",
        detail: `Site path exists but is not a directory: ${siteRoot}`,
        remediation: `Remove the file and recreate the site directory`,
      });
    }
  } catch {
    checks.push({
      name: "site-directory",
      status: "fail",
      detail: `Site directory not found: ${siteRoot}`,
      remediation: `Run narada cycle --site ${siteId} --mode ${mode} to initialize`,
    });
  }

  // 2. Coordinator database
  let status: LinuxSiteStatus | null = null;
  try {
    status = await getLinuxSiteStatus(siteId, mode);
    checks.push({
      name: "coordinator-db",
      status: "pass",
      detail: "Coordinator database readable",
    });
  } catch {
    checks.push({
      name: "coordinator-db",
      status: "fail",
      detail: "Coordinator database not found or unreadable",
      remediation: `Run narada cycle --site ${siteId} --mode ${mode} to initialize`,
    });
  }

  // 3. Lock not stuck
  try {
    const lockDir = join(siteRoot, "state", "cycle.lock");
    const lockStat = await stat(lockDir);
    const ageMs = Date.now() - lockStat.mtimeMs;
    const staleThresholdMs = staleThresholdMinutes * 60 * 1000;
    if (ageMs > staleThresholdMs) {
      checks.push({
        name: "stuck-lock",
        status: "fail",
        detail: `Lock is stale (${Math.round(ageMs / 1000)}s old)`,
        remediation: `The next cycle will auto-recover, or run narada cycle --site ${siteId} --mode ${mode}`,
      });
    } else {
      checks.push({
        name: "stuck-lock",
        status: "pass",
        detail: "Lock is fresh or not present",
      });
    }
  } catch {
    checks.push({
      name: "stuck-lock",
      status: "pass",
      detail: "No active lock",
    });
  }

  // 4. systemd service/timer registered (system mode only)
  if (mode === "system") {
    try {
      const servicePath = join(siteRoot, "systemd", `${siteId}.service`);
      if (existsSync(servicePath)) {
        checks.push({
          name: "systemd-units",
          status: "pass",
          detail: `Systemd service unit exists: ${servicePath}`,
        });
      } else {
        checks.push({
          name: "systemd-units",
          status: "warn",
          detail: "Systemd service unit not found — site is not scheduled",
          remediation: `Run the site setup to generate systemd units`,
        });
      }
    } catch {
      checks.push({
        name: "systemd-units",
        status: "warn",
        detail: "Could not check systemd unit registration",
      });
    }
  } else {
    try {
      const servicePath = join(siteRoot, "systemd", `${siteId}.service`);
      if (existsSync(servicePath)) {
        checks.push({
          name: "systemd-units",
          status: "pass",
          detail: `Systemd user service unit exists: ${servicePath}`,
        });
      } else {
        checks.push({
          name: "systemd-units",
          status: "warn",
          detail: "Systemd user service unit not found — site is not scheduled",
          remediation: `Run the site setup to generate systemd units`,
        });
      }
    } catch {
      checks.push({
        name: "systemd-units",
        status: "warn",
        detail: "Could not check systemd unit registration",
      });
    }
  }

  // 5. Health status
  if (status) {
    const healthOk =
      status.health.status !== "critical" &&
      status.health.status !== "auth_failed";
    checks.push({
      name: "health-status",
      status: healthOk ? "pass" : "fail",
      detail: `Health: ${status.health.status} (${status.health.consecutive_failures} consecutive failures)`,
      remediation: healthOk
        ? undefined
        : `Investigate with narada status --site ${siteId} --mode ${mode}`,
    });

    // 6. Cycle freshness
    if (status.health.last_cycle_at) {
      const lastCycle = new Date(status.health.last_cycle_at);
      const minsSince = (Date.now() - lastCycle.getTime()) / (1000 * 60);
      checks.push({
        name: "cycle-freshness",
        status: minsSince <= staleThresholdMinutes ? "pass" : "warn",
        detail: `Last cycle ${Math.round(minsSince)} minutes ago`,
        remediation:
          minsSince <= staleThresholdMinutes
            ? undefined
            : `Check if the systemd timer is active: systemctl --user status ${siteId}.timer`,
      });
    } else {
      checks.push({
        name: "cycle-freshness",
        status: "warn",
        detail: "No cycle recorded yet",
        remediation: `Run narada cycle --site ${siteId} --mode ${mode} to start`,
      });
    }
  } else {
    checks.push({
      name: "health-status",
      status: "warn",
      detail: "Cannot determine health without coordinator database",
    });
    checks.push({
      name: "cycle-freshness",
      status: "warn",
      detail: "Cannot determine cycle freshness without coordinator database",
    });
  }

  return checks;
}

function isSiteDir(siteRoot: string): boolean {
  try {
    const s = statSync(siteRoot);
    if (!s.isDirectory()) return false;
    return existsSync(join(siteRoot, "db", "coordinator.db"));
  } catch {
    return false;
  }
}
