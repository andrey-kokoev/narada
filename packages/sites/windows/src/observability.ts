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
import type {
  SiteObservationApi,
  StuckWorkItem,
  PendingOutboundCommand,
  PendingDraft,
  CredentialRequirement,
} from "./site-observation.js";

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
 * Read-only observation API implementation for a single Windows Site.
 *
 * Queries the Site's coordinator SQLite directly. Never mutates Site state.
 */
export class WindowsSiteObservationApi implements SiteObservationApi {
  private siteId: string;
  private variant: WindowsSiteVariant;

  constructor(siteId: string, variant: WindowsSiteVariant) {
    this.siteId = siteId;
    this.variant = variant;
  }

  async getHealth(): Promise<SiteHealthRecord> {
    return getSiteHealth(this.siteId, this.variant);
  }

  async getStuckWorkItems(): Promise<StuckWorkItem[]> {
    const db = await openCoordinatorDb(this.siteId, this.variant);
    try {
      // Schema may not exist yet on a freshly created site
      const tableCheck = db.prepare(
        `select 1 from sqlite_master where type = 'table' and name = 'work_items'`
      ).get() as { "1": number } | undefined;
      if (!tableCheck) return [];

      const rows = db.prepare(
        `select
           work_item_id,
           scope_id,
           status,
           context_id,
           updated_at as last_updated_at,
           coalesce(error_message, status) as summary
         from work_items
         where status in ('failed_retryable', 'leased', 'executing')
           and (
             (status = 'leased' and updated_at < datetime('now', '-120 minutes'))
             or (status = 'executing' and updated_at < datetime('now', '-30 minutes'))
             or (status = 'failed_retryable')
           )
         order by priority desc, updated_at asc`
      ).all() as Array<{
        work_item_id: string;
        scope_id: string;
        status: string;
        context_id: string;
        last_updated_at: string;
        summary: string;
      }>;

      return rows.map((r) => ({
        work_item_id: r.work_item_id,
        scope_id: r.scope_id,
        status: r.status as StuckWorkItem["status"],
        context_id: r.context_id,
        last_updated_at: r.last_updated_at,
        summary: r.summary,
      }));
    } finally {
      db.close();
    }
  }

  async getPendingOutboundCommands(): Promise<PendingOutboundCommand[]> {
    const db = await openCoordinatorDb(this.siteId, this.variant);
    try {
      const tableCheck = db.prepare(
        `select 1 from sqlite_master where type = 'table' and name = 'outbound_handoffs'`
      ).get() as { "1": number } | undefined;
      if (!tableCheck) return [];

      const rows = db.prepare(
        `select
           outbound_id,
           scope_id,
           context_id,
           action_type,
           status,
           created_at,
           action_type || ' — ' || status as summary
         from outbound_handoffs
         where status in ('pending', 'draft_creating', 'sending')
           and (
             (status = 'pending' and created_at < datetime('now', '-15 minutes'))
             or (status = 'draft_creating' and created_at < datetime('now', '-10 minutes'))
             or (status = 'sending' and created_at < datetime('now', '-5 minutes'))
           )
         order by created_at asc`
      ).all() as Array<{
        outbound_id: string;
        scope_id: string;
        context_id: string;
        action_type: string;
        status: string;
        created_at: string;
        summary: string;
      }>;

      return rows.map((r) => ({
        outbound_id: r.outbound_id,
        scope_id: r.scope_id,
        context_id: r.context_id,
        action_type: r.action_type,
        status: r.status,
        created_at: r.created_at,
        summary: r.summary,
      }));
    } finally {
      db.close();
    }
  }

  async getPendingDrafts(): Promise<PendingDraft[]> {
    const db = await openCoordinatorDb(this.siteId, this.variant);
    try {
      const tableCheck = db.prepare(
        `select 1 from sqlite_master where type = 'table' and name = 'outbound_handoffs'`
      ).get() as { "1": number } | undefined;
      if (!tableCheck) return [];

      const rows = db.prepare(
        `select
           outbound_id as draft_id,
           scope_id,
           context_id,
           status,
           created_at,
           action_type || ' draft' as summary
         from outbound_handoffs
         where status = 'draft_ready'
         order by created_at asc`
      ).all() as Array<{
        draft_id: string;
        scope_id: string;
        context_id: string;
        status: string;
        created_at: string;
        summary: string;
      }>;

      return rows.map((r) => ({
        draft_id: r.draft_id,
        scope_id: r.scope_id,
        context_id: r.context_id,
        status: r.status as PendingDraft["status"],
        created_at: r.created_at,
        summary: r.summary,
      }));
    } finally {
      db.close();
    }
  }

  async getCredentialRequirements(): Promise<CredentialRequirement[]> {
    const db = await openCoordinatorDb(this.siteId, this.variant);
    try {
      const tableCheck = db.prepare(
        `select 1 from sqlite_master where type = 'table' and name = 'site_health'`
      ).get() as { "1": number } | undefined;
      if (!tableCheck) return [];

      const row = db.prepare(
        `select status, message, updated_at from site_health where site_id = ?`
      ).get(this.siteId) as
        | { status: string; message: string; updated_at: string }
        | undefined;

      if (row && row.status === "auth_failed") {
        return [
          {
            requirement_id: `auth:${this.siteId}`,
            scope_id: this.siteId,
            subtype: "interactive_auth_required",
            summary: row.message,
            remediation_command: "narada auth --site <site-id>",
            remediation_description:
              "Re-authenticate the Site's source connection (e.g., az login)",
            requested_at: row.updated_at,
          },
        ];
      }

      return [];
    } finally {
      db.close();
    }
  }
}

/**
 * Factory that creates a WindowsSiteObservationApi for a given site.
 */
export function createWindowsSiteObservationApi(
  siteId: string,
  variant: WindowsSiteVariant,
): SiteObservationApi {
  return new WindowsSiteObservationApi(siteId, variant);
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
