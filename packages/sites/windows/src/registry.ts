/**
 * Site Registry — Durable inventory and discovery for Narada Sites.
 *
 * Task 380 — Storage layer and discovery mechanism for local Windows and WSL Sites.
 *
 * The registry is advisory and caching. Deleting it does not affect any Site.
 * It does NOT read or write Site coordinator state directly.
 */

import { win32, posix } from "node:path";
import { homedir } from "node:os";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import type { Database } from "better-sqlite3";
import type { WindowsSiteVariant } from "./types.js";

function getPathLib(variant: WindowsSiteVariant) {
  return variant === "native" ? win32 : posix;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegisteredSite {
  siteId: string;
  variant: WindowsSiteVariant;
  siteRoot: string;
  substrate: string;
  aimJson: string | null;
  controlEndpoint: string | null;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface RegistryAuditRecord {
  requestId: string;
  siteId: string;
  actionType: string;
  targetId: string;
  routedAt: string;
  siteResponseStatus: "accepted" | "rejected" | "error";
  siteResponseDetail: string | null;
}

// ---------------------------------------------------------------------------
// Registry path resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the path to the registry SQLite database.
 *
 * Native Windows: %LOCALAPPDATA%\Narada\.registry\registry.db
 * WSL / POSIX: ~/.narada/registry.db
 */
export function resolveRegistryDbPath(): string {
  if (process.platform === "win32") {
    const localAppData =
      process.env.LOCALAPPDATA ??
      (process.env.USERPROFILE
        ? win32.join(process.env.USERPROFILE, "AppData", "Local")
        : undefined);
    if (!localAppData) {
      throw new Error(
        "Cannot resolve registry path: LOCALAPPDATA or USERPROFILE not set",
      );
    }
    return win32.join(localAppData, "Narada", ".registry", "registry.db");
  }
  return posix.join(homedir(), ".narada", "registry.db");
}

/**
 * Resolve the base directory that contains Site directories.
 *
 * Native Windows: %LOCALAPPDATA%\Narada
 * WSL: /var/lib/narada if writable, else ~/narada
 */
export function resolveSitesBaseDir(variant: WindowsSiteVariant): string {
  const override = process.env.NARADA_SITE_ROOT;
  if (override) return override;

  if (variant === "native") {
    const localAppData =
      process.env.LOCALAPPDATA ??
      (process.env.USERPROFILE
        ? win32.join(process.env.USERPROFILE, "AppData", "Local")
        : undefined);
    if (!localAppData) {
      throw new Error(
        "Cannot resolve sites base dir: LOCALAPPDATA or USERPROFILE not set",
      );
    }
    return win32.join(localAppData, "Narada");
  }

  // WSL: prefer /var/lib/narada if writable, fallback to ~/narada
  const varLibNarada = "/var/lib/narada";
  if (existsSync(varLibNarada)) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { accessSync, constants } = require("node:fs");
      accessSync(varLibNarada, constants.W_OK);
      return varLibNarada;
    } catch {
      // not writable, fall through
    }
  }
  return posix.join(homedir(), "narada");
}

// ---------------------------------------------------------------------------
// Site Registry
// ---------------------------------------------------------------------------

export class SiteRegistry {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS site_registry (
        site_id TEXT PRIMARY KEY,
        variant TEXT NOT NULL,
        site_root TEXT NOT NULL,
        substrate TEXT NOT NULL DEFAULT 'windows',
        aim_json TEXT,
        control_endpoint TEXT,
        last_seen_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS registry_audit_log (
        request_id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        routed_at TEXT NOT NULL,
        site_response_status TEXT NOT NULL,
        site_response_detail TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_registry_audit_site_id ON registry_audit_log(site_id);
      CREATE INDEX IF NOT EXISTS idx_registry_audit_routed_at ON registry_audit_log(routed_at);
    `);
  }

  // -------------------------------------------------------------------------
  // Discovery
  // -------------------------------------------------------------------------

  /**
   * Scan the filesystem for Sites and upsert them into the registry.
   *
   * Scans the canonical Sites base directory for the given variant,
   * looking for directories that contain a `config.json` file.
   */
  discoverSites(variant: WindowsSiteVariant): RegisteredSite[] {
    const baseDir = resolveSitesBaseDir(variant);
    if (!existsSync(baseDir)) {
      return [];
    }

    const discovered: RegisteredSite[] = [];
    const entries = readdirSync(baseDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;
      if (entry.name === "node_modules") continue;

      const pathLib = getPathLib(variant);
      const siteRoot = pathLib.join(baseDir, entry.name);
      const configPath = pathLib.join(siteRoot, "config.json");
      if (!existsSync(configPath)) continue;

      const site = this.upsertFromDiscovery(entry.name, variant, siteRoot);
      discovered.push(site);
    }

    return discovered;
  }

  private upsertFromDiscovery(
    siteId: string,
    variant: WindowsSiteVariant,
    siteRoot: string,
  ): RegisteredSite {
    const pathLib = getPathLib(variant);
    const configPath = pathLib.join(siteRoot, "config.json");
    let aimJson: string | null = null;
    let substrate = "windows";

    try {
      const configText = readFileSync(configPath, "utf8");
      const config = JSON.parse(configText) as {
        aim?: { name?: string; description?: string; vertical?: string };
        substrate?: string;
      };
      if (config.aim) {
        aimJson = JSON.stringify(config.aim);
      }
      if (config.substrate) {
        substrate = config.substrate;
      }
    } catch {
      // Config unreadable or invalid; still register the Site
    }

    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO site_registry (site_id, variant, site_root, substrate, aim_json, last_seen_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(site_id) DO UPDATE SET
           variant = excluded.variant,
           site_root = excluded.site_root,
           substrate = excluded.substrate,
           aim_json = excluded.aim_json,
           last_seen_at = excluded.last_seen_at`,
      )
      .run(siteId, variant, siteRoot, substrate, aimJson, now, now);

    // Return the canonical row from the database to ensure created_at is
    // accurate for both inserts and updates.
    const row = this.db
      .prepare(
        `SELECT site_id, variant, site_root, substrate, aim_json, control_endpoint, last_seen_at, created_at
         FROM site_registry WHERE site_id = ?`,
      )
      .get(siteId) as {
      site_id: string;
      variant: WindowsSiteVariant;
      site_root: string;
      substrate: string;
      aim_json: string | null;
      control_endpoint: string | null;
      last_seen_at: string | null;
      created_at: string;
    };

    return {
      siteId: row.site_id,
      variant: row.variant,
      siteRoot: row.site_root,
      substrate: row.substrate,
      aimJson: row.aim_json,
      controlEndpoint: row.control_endpoint,
      lastSeenAt: row.last_seen_at,
      createdAt: row.created_at,
    };
  }

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------

  /**
   * Re-read a Site's metadata from disk and update the registry.
   */
  refreshSite(siteId: string): RegisteredSite | null {
    const existing = this.getSite(siteId);
    if (!existing) return null;

    const pathLib = getPathLib(existing.variant);
    const configPath = pathLib.join(existing.siteRoot, "config.json");
    let aimJson: string | null = existing.aimJson;
    let substrate = existing.substrate;

    try {
      const configText = readFileSync(configPath, "utf8");
      const config = JSON.parse(configText) as {
        aim?: { name?: string; description?: string; vertical?: string };
        substrate?: string;
      };
      if (config.aim) {
        aimJson = JSON.stringify(config.aim);
      }
      if (config.substrate) {
        substrate = config.substrate;
      }
    } catch {
      // Keep existing values
    }

    const now = new Date().toISOString();

    this.db
      .prepare(
        `UPDATE site_registry
         SET aim_json = ?, substrate = ?, last_seen_at = ?
         WHERE site_id = ?`,
      )
      .run(aimJson, substrate, now, siteId);

    return {
      ...existing,
      aimJson,
      substrate,
      lastSeenAt: now,
    };
  }

  /**
   * Get a single Site from the registry.
   */
  getSite(siteId: string): RegisteredSite | null {
    const row = this.db
      .prepare(
        `SELECT site_id, variant, site_root, substrate, aim_json, control_endpoint, last_seen_at, created_at
         FROM site_registry WHERE site_id = ?`,
      )
      .get(siteId) as
      | {
          site_id: string;
          variant: WindowsSiteVariant;
          site_root: string;
          substrate: string;
          aim_json: string | null;
          control_endpoint: string | null;
          last_seen_at: string | null;
          created_at: string;
        }
      | undefined;

    if (!row) return null;

    return {
      siteId: row.site_id,
      variant: row.variant,
      siteRoot: row.site_root,
      substrate: row.substrate,
      aimJson: row.aim_json,
      controlEndpoint: row.control_endpoint,
      lastSeenAt: row.last_seen_at,
      createdAt: row.created_at,
    };
  }

  /**
   * List all Sites in the registry.
   */
  listSites(): RegisteredSite[] {
    const rows = this.db
      .prepare(
        `SELECT site_id, variant, site_root, substrate, aim_json, control_endpoint, last_seen_at, created_at
         FROM site_registry ORDER BY created_at ASC, site_id ASC`,
      )
      .all() as Array<{
      site_id: string;
      variant: WindowsSiteVariant;
      site_root: string;
      substrate: string;
      aim_json: string | null;
      control_endpoint: string | null;
      last_seen_at: string | null;
      created_at: string;
    }>;

    return rows.map((row) => ({
      siteId: row.site_id,
      variant: row.variant,
      siteRoot: row.site_root,
      substrate: row.substrate,
      aimJson: row.aim_json,
      controlEndpoint: row.control_endpoint,
      lastSeenAt: row.last_seen_at,
      createdAt: row.created_at,
    }));
  }

  /**
   * Register or update a Site directly in the registry.
   */
  registerSite(site: RegisteredSite): void {
    this.db
      .prepare(
        `INSERT INTO site_registry (site_id, variant, site_root, substrate, aim_json, control_endpoint, last_seen_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(site_id) DO UPDATE SET
           variant = excluded.variant,
           site_root = excluded.site_root,
           substrate = excluded.substrate,
           aim_json = excluded.aim_json,
           control_endpoint = excluded.control_endpoint,
           last_seen_at = excluded.last_seen_at`,
      )
      .run(
        site.siteId,
        site.variant,
        site.siteRoot,
        site.substrate,
        site.aimJson ?? null,
        site.controlEndpoint ?? null,
        site.lastSeenAt,
        site.createdAt,
      );
  }

  /**
   * Remove a Site from the registry. Does NOT delete the Site files.
   */
  removeSite(siteId: string): boolean {
    const result = this.db
      .prepare(`DELETE FROM site_registry WHERE site_id = ?`)
      .run(siteId);
    return (result as unknown as { changes: number }).changes > 0;
  }

  // -------------------------------------------------------------------------
  // Audit log
  // -------------------------------------------------------------------------

  /**
   * Record a routed control request in the audit log.
   */
  logAuditRecord(record: RegistryAuditRecord): void {
    this.db
      .prepare(
        `INSERT INTO registry_audit_log (request_id, site_id, action_type, target_id, routed_at, site_response_status, site_response_detail)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.requestId,
        record.siteId,
        record.actionType,
        record.targetId,
        record.routedAt,
        record.siteResponseStatus,
        record.siteResponseDetail ?? null,
      );
  }

  /**
   * Get audit records for a Site, newest first.
   */
  getAuditRecordsForSite(siteId: string, limit = 100): RegistryAuditRecord[] {
    const rows = this.db
      .prepare(
        `SELECT request_id, site_id, action_type, target_id, routed_at, site_response_status, site_response_detail
         FROM registry_audit_log WHERE site_id = ? ORDER BY routed_at DESC LIMIT ?`,
      )
      .all(siteId, limit) as Array<{
      request_id: string;
      site_id: string;
      action_type: string;
      target_id: string;
      routed_at: string;
      site_response_status: string;
      site_response_detail: string | null;
    }>;

    return rows.map((row) => ({
      requestId: row.request_id,
      siteId: row.site_id,
      actionType: row.action_type,
      targetId: row.target_id,
      routedAt: row.routed_at,
      siteResponseStatus: row.site_response_status as RegistryAuditRecord["siteResponseStatus"],
      siteResponseDetail: row.site_response_detail,
    }));
  }

  /**
   * Close the underlying database connection.
   */
  close(): void {
    this.db.close();
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Ensure the registry directory exists and open the database.
 */
export async function openRegistryDb(dbPath: string): Promise<Database> {
  const { dirname } = await import("node:path");
  await mkdir(dirname(dbPath), { recursive: true });
  const Database = (await import("better-sqlite3")).default;
  return new Database(dbPath);
}
