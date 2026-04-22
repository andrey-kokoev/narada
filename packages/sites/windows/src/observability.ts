/**
 * Observability surface for Windows Sites.
 *
 * Provides operator inspection functions:
 * - Query site health and last cycle trace from SQLite
 * - Discover all configured Windows Sites on the local machine
 * - Resolve site variant by path presence
 */

import { readdirSync, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  SiteHealthRecord,
  CycleTraceRecord,
  WindowsSiteVariant,
} from "./types.js";
import { resolveSiteRoot } from "./path-utils.js";
import { SqliteSiteCoordinator, openCoordinatorDb } from "./coordinator.js";

export interface WindowsSiteStatus {
  siteId: string;
  variant: WindowsSiteVariant;
  siteRoot: string;
  health: SiteHealthRecord;
  lastTrace: CycleTraceRecord | null;
}

export interface DiscoveredSite {
  siteId: string;
  variant: WindowsSiteVariant;
  siteRoot: string;
}

/**
 * Read the current health and last cycle trace for a Windows Site.
 */
export async function getWindowsSiteStatus(
  siteId: string,
  variant: WindowsSiteVariant
): Promise<WindowsSiteStatus> {
  const siteRoot = resolveSiteRoot(siteId, variant);
  const db = await openCoordinatorDb(siteId, variant);
  const coordinator = new SqliteSiteCoordinator(db);
  try {
    const health = coordinator.getHealth(siteId);
    const lastTrace = coordinator.getLastCycleTrace(siteId);
    return { siteId, variant, siteRoot, health, lastTrace };
  } finally {
    coordinator.close();
  }
}

/**
 * Read only the health record for a Windows Site.
 */
export async function getSiteHealth(
  siteId: string,
  variant: WindowsSiteVariant
): Promise<SiteHealthRecord> {
  const db = await openCoordinatorDb(siteId, variant);
  const coordinator = new SqliteSiteCoordinator(db);
  try {
    return coordinator.getHealth(siteId);
  } finally {
    coordinator.close();
  }
}

/**
 * Read only the last cycle trace for a Windows Site.
 */
export async function getLastCycleTrace(
  siteId: string,
  variant: WindowsSiteVariant
): Promise<CycleTraceRecord | null> {
  const db = await openCoordinatorDb(siteId, variant);
  const coordinator = new SqliteSiteCoordinator(db);
  try {
    return coordinator.getLastCycleTrace(siteId);
  } finally {
    coordinator.close();
  }
}

/**
 * Discover all Windows Sites on the local machine.
 *
 * Scans:
 * - Native: %LOCALAPPDATA%\Narada\*
 * - WSL: /var/lib/narada/* and ~/narada/*
 *
 * A directory is considered a site if it contains a coordinator.db file.
 */
export function discoverWindowsSites(): DiscoveredSite[] {
  const sites: DiscoveredSite[] = [];

  // Native Windows sites
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    const nativeRoot = join(localAppData, "Narada");
    if (existsSync(nativeRoot)) {
      for (const entry of readdirSync(nativeRoot)) {
        const siteRoot = join(nativeRoot, entry);
        if (isSiteDir(siteRoot)) {
          sites.push({ siteId: entry, variant: "native", siteRoot });
        }
      }
    }
  }

  // WSL sites — /var/lib/narada
  const varLibNarada = "/var/lib/narada";
  if (existsSync(varLibNarada)) {
    for (const entry of readdirSync(varLibNarada)) {
      const siteRoot = join(varLibNarada, entry);
      if (isSiteDir(siteRoot)) {
        sites.push({ siteId: entry, variant: "wsl", siteRoot });
      }
    }
  }

  // WSL sites — ~/narada
  const homeNarada = join(homedir(), "narada");
  if (existsSync(homeNarada)) {
    for (const entry of readdirSync(homeNarada)) {
      const siteRoot = join(homeNarada, entry);
      // Avoid duplicates if /var/lib/narada and ~/narada happen to overlap
      if (isSiteDir(siteRoot) && !sites.some((s) => s.siteRoot === siteRoot)) {
        sites.push({ siteId: entry, variant: "wsl", siteRoot });
      }
    }
  }

  return sites;
}

function isSiteDir(siteRoot: string): boolean {
  try {
    const s = statSync(siteRoot);
    if (!s.isDirectory()) return false;
    // A site directory is valid if it contains a db/coordinator.db file
    return existsSync(join(siteRoot, "db", "coordinator.db"));
  } catch {
    return false;
  }
}

/**
 * Resolve the variant for a site by checking where its directory exists.
 *
 * Checks native path first, then WSL paths.
 * Returns null if the site cannot be found.
 */
export function resolveSiteVariant(siteId: string): WindowsSiteVariant | null {
  // Check env override first
  if (process.env.NARADA_SITE_VARIANT) {
    const envVariant = process.env.NARADA_SITE_VARIANT;
    if (envVariant === "native" || envVariant === "wsl") {
      return envVariant;
    }
  }

  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    const nativeRoot = join(localAppData, "Narada", siteId);
    if (existsSync(nativeRoot) && isSiteDir(nativeRoot)) {
      return "native";
    }
  }

  const varLibPath = join("/var/lib/narada", siteId);
  if (existsSync(varLibPath) && isSiteDir(varLibPath)) {
    return "wsl";
  }

  const homePath = join(homedir(), "narada", siteId);
  if (existsSync(homePath) && isSiteDir(homePath)) {
    return "wsl";
  }

  return null;
}
