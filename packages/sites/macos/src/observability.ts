/**
 * Observability surface for macOS Sites.
 *
 * Provides operator inspection functions:
 * - Query site health and last cycle trace from SQLite
 * - Discover all configured macOS Sites on the local machine
 */

import { readdirSync, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SiteHealthRecord, CycleTraceRecord } from "./types.js";
import { resolveSiteRoot } from "./path-utils.js";
import { SqliteSiteCoordinator, openCoordinatorDb } from "./coordinator.js";

export interface MacosSiteStatus {
  siteId: string;
  siteRoot: string;
  health: SiteHealthRecord;
  lastTrace: CycleTraceRecord | null;
}

export interface DiscoveredMacosSite {
  siteId: string;
  siteRoot: string;
}

/**
 * Check whether a site directory exists at the canonical macOS path.
 */
export function isMacosSite(siteId: string): boolean {
  const siteRoot = resolveSiteRoot(siteId);
  return isSiteDir(siteRoot);
}

/**
 * Read the current health and last cycle trace for a macOS Site.
 */
export async function getMacosSiteStatus(siteId: string): Promise<MacosSiteStatus> {
  const siteRoot = resolveSiteRoot(siteId);
  const db = openCoordinatorDb(siteId);
  const coordinator = new SqliteSiteCoordinator(db);
  try {
    const health = coordinator.getHealth(siteId);
    const lastTrace = coordinator.getLastCycleTrace(siteId);
    return { siteId, siteRoot, health, lastTrace };
  } finally {
    coordinator.close();
  }
}

/**
 * Read only the health record for a macOS Site.
 */
export async function getSiteHealth(siteId: string): Promise<SiteHealthRecord> {
  const db = openCoordinatorDb(siteId);
  const coordinator = new SqliteSiteCoordinator(db);
  try {
    return coordinator.getHealth(siteId);
  } finally {
    coordinator.close();
  }
}

/**
 * Read only the last cycle trace for a macOS Site.
 */
export async function getLastCycleTrace(siteId: string): Promise<CycleTraceRecord | null> {
  const db = openCoordinatorDb(siteId);
  const coordinator = new SqliteSiteCoordinator(db);
  try {
    return coordinator.getLastCycleTrace(siteId);
  } finally {
    coordinator.close();
  }
}

/**
 * Aggregate site summary: health + last trace + scope count.
 *
 * Scope count is derived from the number of message directories.
 */
export async function getSiteSummary(siteId: string): Promise<{
  siteId: string;
  siteRoot: string;
  health: SiteHealthRecord;
  lastTrace: CycleTraceRecord | null;
  scopeCount: number;
}> {
  const siteRoot = resolveSiteRoot(siteId);
  const db = openCoordinatorDb(siteId);
  const coordinator = new SqliteSiteCoordinator(db);
  let scopeCount = 0;
  try {
    const health = coordinator.getHealth(siteId);
    const lastTrace = coordinator.getLastCycleTrace(siteId);
    // Count scopes from messages directory
    try {
      const messagesDir = join(siteRoot, "messages");
      if (existsSync(messagesDir)) {
        scopeCount = readdirSync(messagesDir).filter((name) => {
          try {
            return statSync(join(messagesDir, name)).isDirectory();
          } catch {
            return false;
          }
        }).length;
      }
    } catch {
      // ignore
    }
    return { siteId, siteRoot, health, lastTrace, scopeCount };
  } finally {
    coordinator.close();
  }
}

/**
 * Discover all macOS Sites on the local machine.
 *
 * Scans: ~/Library/Application Support/Narada/*
 *
 * A directory is considered a site if it contains a db/coordinator.db file.
 */
export function discoverMacosSites(): DiscoveredMacosSite[] {
  const sites: DiscoveredMacosSite[] = [];
  const naradaRoot = join(homedir(), "Library", "Application Support", "Narada");

  if (existsSync(naradaRoot)) {
    for (const entry of readdirSync(naradaRoot)) {
      const siteRoot = join(naradaRoot, entry);
      if (isSiteDir(siteRoot)) {
        sites.push({ siteId: entry, siteRoot });
      }
    }
  }

  return sites;
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
