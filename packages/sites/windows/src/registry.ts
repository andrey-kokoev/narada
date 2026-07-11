/**
 * Site Registry — Durable inventory and discovery for Narada Sites.
 *
 * Task 380 — Storage layer and discovery mechanism for local Windows and WSL Sites.
 *
 * The registry is advisory and caching. Deleting it does not affect any Site.
 * It does NOT read or write Site coordinator state directly.
 */

import { randomUUID } from "node:crypto";
import { win32, posix } from "node:path";
import { homedir } from "node:os";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import type { Database } from "@narada2/control-plane";
import type { WindowsAuthorityLocus, WindowsSiteVariant, SiteVariant } from "./types.js";
import {
  classifySiteContinuityExchangePacket,
  createSiteContinuityPacketId,
  type SiteContinuityDecision,
  type SiteContinuityExchangePacket,
} from "@narada2/site-continuity";

function getPathLib(variant: WindowsSiteVariant) {
  return variant === "native" ? win32 : posix;
}

export interface SiteContinuityPacketRecord {
  packetId: string;
  siteId: string;
  relationId: string | null;
  sourceEmbodimentKind: string;
  targetEmbodimentKind: string;
  admissionAction: string;
  admissionReason: string;
  packetJson: string;
  importedAt: string;
}

export interface SiteContinuityPacketImportResult {
  ok: boolean;
  status: "imported" | "refused";
  decision: SiteContinuityDecision;
  packetRecord?: SiteContinuityPacketRecord;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegisteredSite {
  siteId: string;
  variant: SiteVariant;
  siteRoot: string;
  substrate: string;
  aimJson: string | null;
  controlEndpoint: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  lifecycleStatus?: RegistryLifecycleStatus;
  observationStatus?: RegistryObservationStatus;
  sources?: RegistrySourceObservation[];
  aliases?: RegistryAlias[];
  revision?: number;
  updatedAt?: string;
  retiredAt?: string | null;
  retireReason?: string | null;
}

export type RegistryLifecycleStatus = "active" | "retired";
export type RegistryObservationStatus =
  | "unverified"
  | "present"
  | "stale"
  | "missing"
  | "conflicted";

export interface RegistrySourceObservation {
  kind: string;
  ref: string;
  observedAt: string;
}

export interface RegistryAlias {
  value: string;
  source: string;
}

export interface RegistrySiteRecord extends RegisteredSite {
  lifecycleStatus: RegistryLifecycleStatus;
  observationStatus: RegistryObservationStatus;
  sources: RegistrySourceObservation[];
  aliases: RegistryAlias[];
  revision: number;
  updatedAt: string;
  retiredAt: string | null;
  retireReason: string | null;
}

export interface RegistryConflict {
  code: string;
  message: string;
  siteId?: string;
  siteRoot?: string;
}

export type RegistryManagementOperation =
  | "add"
  | "edit"
  | "retire"
  | "restore"
  | "purge";

export interface RegistryManagementRequest {
  operation: RegistryManagementOperation;
  siteId: string;
  actor: string;
  reason?: string;
  siteRoot?: string;
  variant?: SiteVariant;
  substrate?: string;
  aimJson?: string | null;
  controlEndpoint?: string | null;
  aliases?: RegistryAlias[];
  clearAimJson?: boolean;
  clearControlEndpoint?: boolean;
  clearAliases?: boolean;
  source?: RegistrySourceObservation;
  sources?: RegistrySourceObservation[];
  expectedRevision?: number;
  confirmSiteId?: string;
  reAdmit?: boolean;
  apply?: boolean;
}

export interface RegistryManagementResult {
  schema: "narada.site_registry.management.v0";
  status: "planned" | "applied" | "unchanged" | "refused";
  operation: RegistryManagementOperation;
  mutationPerformed: boolean;
  siteId: string;
  before: RegistrySiteRecord | null;
  after: RegistrySiteRecord | null;
  changes: string[];
  conflicts: RegistryConflict[];
  refusals: string[];
  auditRef: string | null;
}

export interface RegistryManagementAuditRecord {
  eventId: string;
  siteId: string;
  operation: RegistryManagementOperation;
  actor: string;
  reason: string | null;
  occurredAt: string;
  beforeJson: string | null;
  afterJson: string | null;
  status: "applied" | "refused";
}

interface RegistrySiteRow {
  site_id: string;
  variant: SiteVariant;
  site_root: string;
  substrate: string;
  aim_json: string | null;
  control_endpoint: string | null;
  last_seen_at: string | null;
  created_at: string;
  lifecycle_status?: string | null;
  observation_status?: string | null;
  sources_json?: string | null;
  aliases_json?: string | null;
  revision?: number | bigint | null;
  updated_at?: string | null;
  retired_at?: string | null;
  retire_reason?: string | null;
}

function normalizeRegistryRoot(root: string): string {
  return root.trim().replace(/[\\/]+$/, "").replaceAll("\\", "/").toLowerCase();
}

function rootsEqual(left: string, right: string): boolean {
  return normalizeRegistryRoot(left) === normalizeRegistryRoot(right);
}

function siteOwnsReference(site: RegistrySiteRecord, reference: string): boolean {
  const normalized = reference.trim().toLowerCase();
  return site.siteId.toLowerCase() === normalized
    || site.aliases.some((alias) => alias.value.toLowerCase() === normalized);
}

function parseJsonArray<T>(value: string | null | undefined, fallback: T[]): T[] {
  if (!value) return [...fallback];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : [...fallback];
  } catch {
    return [...fallback];
  }
}

function normalizeLifecycle(value: string | null | undefined): RegistryLifecycleStatus {
  return value === "retired" ? "retired" : "active";
}

function normalizeObservation(value: string | null | undefined): RegistryObservationStatus {
  if (value === "present" || value === "stale" || value === "missing" || value === "conflicted") {
    return value;
  }
  return "unverified";
}

function numberValue(value: number | bigint | null | undefined, fallback: number): number {
  if (typeof value === "bigint") return Number(value);
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function classifyRootObservation(siteRoot: string): RegistryObservationStatus {
  return existsSync(siteRoot) ? "present" : "missing";
}

function rowToRegistrySite(row: RegistrySiteRow): RegistrySiteRecord {
  const updatedAt = row.updated_at ?? row.created_at;
  return {
    siteId: row.site_id,
    variant: row.variant,
    siteRoot: row.site_root,
    substrate: row.substrate,
    aimJson: row.aim_json,
    controlEndpoint: row.control_endpoint,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    lifecycleStatus: normalizeLifecycle(row.lifecycle_status),
    observationStatus: normalizeObservation(row.observation_status),
    sources: parseJsonArray<RegistrySourceObservation>(row.sources_json, []),
    aliases: parseJsonArray<RegistryAlias>(row.aliases_json, []),
    revision: numberValue(row.revision, 1),
    updatedAt,
    retiredAt: row.retired_at ?? null,
    retireReason: row.retire_reason ?? null,
  };
}

function managedChanges(before: RegistrySiteRecord | null, after: RegistrySiteRecord | null): string[] {
  if (!before && after) return ["record_added"];
  if (before && !after) return ["record_purged"];
  if (!before || !after) return [];

  const fields: Array<[keyof RegistrySiteRecord, string]> = [
    ["siteRoot", "site_root"],
    ["variant", "variant"],
    ["substrate", "substrate"],
    ["aimJson", "aim_json"],
    ["controlEndpoint", "control_endpoint"],
    ["lifecycleStatus", "lifecycle_status"],
    ["observationStatus", "observation_status"],
    ["sources", "sources"],
    ["aliases", "aliases"],
    ["retiredAt", "retired_at"],
    ["retireReason", "retire_reason"],
  ];
  return fields
    .filter(([field]) => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
    .map(([, label]) => label);
}

function registrySiteToLegacy(site: RegistrySiteRecord): RegisteredSite {
  return site;
}

function asRegistrySiteRecord(site: RegisteredSite): RegistrySiteRecord {
  const now = site.updatedAt ?? site.createdAt;
  return {
    ...site,
    lifecycleStatus: site.lifecycleStatus ?? "active",
    observationStatus: site.observationStatus ?? classifyRootObservation(site.siteRoot),
    sources: site.sources ?? [],
    aliases: site.aliases ?? [],
    revision: site.revision ?? 1,
    updatedAt: now,
    retiredAt: site.retiredAt ?? null,
    retireReason: site.retireReason ?? null,
  };
}

function mergeSources(
  existing: RegistrySourceObservation[],
  incoming: RegistrySourceObservation[] | undefined,
): RegistrySourceObservation[] {
  if (!incoming || incoming.length === 0) return existing;
  const merged = [...existing];
  for (const source of incoming) {
    const key = `${source.kind}:${source.ref}`;
    const index = merged.findIndex((candidate) => `${candidate.kind}:${candidate.ref}` === key);
    if (index >= 0) merged[index] = source;
    else merged.push(source);
  }
  return merged;
}

function requestSources(request: RegistryManagementRequest): RegistrySourceObservation[] {
  return [
    ...(request.source ? [request.source] : []),
    ...(request.sources ?? []),
  ];
}

function mergeAliases(existing: RegistryAlias[], incoming: RegistryAlias[] | undefined): RegistryAlias[] {
  if (!incoming || incoming.length === 0) return existing;
  const merged = [...existing];
  for (const alias of incoming) {
    if (!alias.value.trim()) continue;
    const duplicate = merged.some((candidate) => candidate.value.toLowerCase() === alias.value.toLowerCase());
    if (!duplicate) merged.push({ value: alias.value.trim(), source: alias.source });
  }
  return merged;
}

function managementResult(
  operation: RegistryManagementOperation,
  siteId: string,
  before: RegistrySiteRecord | null,
  after: RegistrySiteRecord | null,
  changes: string[],
  conflicts: RegistryConflict[],
  refusals: string[],
  apply: boolean,
  auditRef: string | null = null,
): RegistryManagementResult {
  const refused = conflicts.length > 0 || refusals.length > 0;
  return {
    schema: "narada.site_registry.management.v0",
    status: refused ? "refused" : apply ? changes.length > 0 ? "applied" : "unchanged" : "planned",
    operation,
    mutationPerformed: apply && !refused && changes.length > 0,
    siteId,
    before,
    after,
    changes,
    conflicts,
    refusals,
    auditRef,
  };
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

export interface WindowsRegistryPathPolicy {
  variant?: WindowsSiteVariant;
  authorityLocus: WindowsAuthorityLocus;
}

/**
 * Resolve the registry database path using authority-locus policy.
 *
 * This is the explicit path for new Windows Site registries. The older
 * `resolveRegistryDbPath()` remains the legacy compatibility resolver.
 */
export function resolveRegistryDbPathByLocus(
  policy: WindowsRegistryPathPolicy,
): string {
  const variant = policy.variant ?? (process.platform === "win32" ? "native" : "wsl");

  if (variant === "native" && process.platform === "win32") {
    if (policy.authorityLocus === "user") {
      const configuredUserRoot = process.env.NARADA_USER_SITE_ROOT;
      if (configuredUserRoot?.startsWith("/")) {
        return posix.join(configuredUserRoot, "registry.db");
      }
      const userRoot = configuredUserRoot ?? (
        process.env.USERPROFILE ? win32.join(process.env.USERPROFILE, "Narada") : undefined
      );
      if (!userRoot) {
        throw new Error("Cannot resolve user-locus registry path: USERPROFILE not set");
      }
      return win32.join(userRoot, "registry.db");
    }

    const pcRoot =
      process.env.NARADA_PC_REGISTRY_ROOT ??
      process.env.ProgramData ??
      process.env.PROGRAMDATA ??
      "C:\\ProgramData";
    return win32.join(pcRoot, "Narada", "registry.db");
  }

  if (policy.authorityLocus === "user") {
    const userRoot = process.env.NARADA_USER_SITE_ROOT ?? posix.join(homedir(), "Narada");
    return posix.join(userRoot, "registry.db");
  }

  const varLibNarada = "/var/lib/narada";
  if (existsSync(varLibNarada)) {
    return posix.join(varLibNarada, "registry.db");
  }
  return posix.join(homedir(), "narada", "registry.db");
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
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        lifecycle_status TEXT NOT NULL DEFAULT 'active',
        observation_status TEXT NOT NULL DEFAULT 'unverified',
        sources_json TEXT NOT NULL DEFAULT '[]',
        aliases_json TEXT NOT NULL DEFAULT '[]',
        revision INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        retired_at TEXT,
        retire_reason TEXT
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

      CREATE TABLE IF NOT EXISTS registry_management_audit (
        event_id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        actor TEXT NOT NULL,
        reason TEXT,
        occurred_at TEXT NOT NULL,
        before_json TEXT,
        after_json TEXT,
        status TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_registry_management_site_id ON registry_management_audit(site_id, occurred_at);

      CREATE TABLE IF NOT EXISTS site_continuity_packets (
        packet_id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        relation_id TEXT,
        source_embodiment_kind TEXT NOT NULL,
        target_embodiment_kind TEXT NOT NULL,
        admission_action TEXT NOT NULL,
        admission_reason TEXT NOT NULL,
        packet_json TEXT NOT NULL,
        imported_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_site_continuity_packets_site_id ON site_continuity_packets(site_id, imported_at);
    `);

    const columns = new Set(
      (this.db.prepare("PRAGMA table_info(site_registry)").all() as Array<Record<string, unknown>>)
        .map((row) => String(row.name ?? "")),
    );
    const migrations: Array<[string, string]> = [
      ["lifecycle_status", "ALTER TABLE site_registry ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'active'"],
      ["observation_status", "ALTER TABLE site_registry ADD COLUMN observation_status TEXT NOT NULL DEFAULT 'unverified'"],
      ["sources_json", "ALTER TABLE site_registry ADD COLUMN sources_json TEXT NOT NULL DEFAULT '[]'"],
      ["aliases_json", "ALTER TABLE site_registry ADD COLUMN aliases_json TEXT NOT NULL DEFAULT '[]'"],
      ["revision", "ALTER TABLE site_registry ADD COLUMN revision INTEGER NOT NULL DEFAULT 1"],
      ["updated_at", "ALTER TABLE site_registry ADD COLUMN updated_at TEXT"],
      ["retired_at", "ALTER TABLE site_registry ADD COLUMN retired_at TEXT"],
      ["retire_reason", "ALTER TABLE site_registry ADD COLUMN retire_reason TEXT"],
    ];
    for (const [name, sql] of migrations) {
      if (!columns.has(name)) this.db.exec(sql);
    }
    this.db.exec(`
      UPDATE site_registry
      SET updated_at = COALESCE(updated_at, created_at),
          sources_json = COALESCE(sources_json, '[]'),
          aliases_json = COALESCE(aliases_json, '[]'),
          revision = COALESCE(revision, 1),
          lifecycle_status = COALESCE(lifecycle_status, 'active'),
          observation_status = COALESCE(observation_status, 'unverified')
    `);
  }

  // -------------------------------------------------------------------------
  // Discovery
  // -------------------------------------------------------------------------

  /**
   * Scan for Site candidates without changing the registry.
   *
   * This is the planning input for explicit registry discovery. The older
   * `discoverSites` method remains the compatibility scan-and-upsert path.
   */
  scanSites(variant: WindowsSiteVariant): RegistrySiteRecord[] {
    const baseDir = resolveSitesBaseDir(variant);
    if (!existsSync(baseDir)) return [];

    const pathLib = getPathLib(variant);
    const scanned: RegistrySiteRecord[] = [];
    for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const siteRoot = pathLib.join(baseDir, entry.name);
      const configPath = pathLib.join(siteRoot, "config.json");
      if (!existsSync(configPath)) continue;

      let aimJson: string | null = null;
      let substrate = "windows";
      try {
        const config = JSON.parse(readFileSync(configPath, "utf8")) as {
          aim?: { name?: string; description?: string; vertical?: string };
          substrate?: string;
        };
        aimJson = config.aim ? JSON.stringify(config.aim) : null;
        substrate = config.substrate ?? substrate;
      } catch {
        // The candidate remains visible as present but unverified metadata.
      }

      const observedAt = new Date().toISOString();
      scanned.push({
        siteId: entry.name,
        variant,
        siteRoot,
        substrate,
        aimJson,
        controlEndpoint: null,
        lastSeenAt: observedAt,
        createdAt: observedAt,
        lifecycleStatus: "active",
        observationStatus: "present",
        sources: [{ kind: "filesystem", ref: siteRoot, observedAt }],
        aliases: [],
        revision: 1,
        updatedAt: observedAt,
        retiredAt: null,
        retireReason: null,
      });
    }
    return scanned;
  }

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
        `SELECT site_id, variant, site_root, substrate, aim_json, control_endpoint, last_seen_at, created_at,
                lifecycle_status, observation_status, sources_json, aliases_json, revision, updated_at,
                retired_at, retire_reason
         FROM site_registry WHERE site_id = ?`,
      )
      .get(siteId) as RegistrySiteRow;

    return registrySiteToLegacy(rowToRegistrySite(row));
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

    const pathLib = getPathLib(existing.variant as WindowsSiteVariant);
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
        `SELECT site_id, variant, site_root, substrate, aim_json, control_endpoint, last_seen_at, created_at,
                lifecycle_status, observation_status, sources_json, aliases_json, revision, updated_at,
                retired_at, retire_reason
         FROM site_registry WHERE site_id = ?`,
      )
      .get(siteId) as
      | RegistrySiteRow
      | undefined;

    if (!row) return null;
    return registrySiteToLegacy(rowToRegistrySite(row));
  }

  /**
   * List all Sites in the registry.
   */
  listSites(): RegisteredSite[] {
    const rows = this.db
      .prepare(
        `SELECT site_id, variant, site_root, substrate, aim_json, control_endpoint, last_seen_at, created_at,
                lifecycle_status, observation_status, sources_json, aliases_json, revision, updated_at,
                retired_at, retire_reason
         FROM site_registry ORDER BY created_at ASC, site_id ASC`,
      )
      .all() as RegistrySiteRow[];

    return rows.map((row) => registrySiteToLegacy(rowToRegistrySite(row)));
  }

  /**
   * Resolve a canonical Site id or one of its recorded aliases.
   */
  getManagedSite(reference: string): RegistrySiteRecord | null {
    const exact = this.getSite(reference.trim());
    if (exact) return asRegistrySiteRecord(exact);
    const normalized = reference.trim().toLowerCase();
    if (!normalized) return null;
    for (const site of this.listSites()) {
      const managed = asRegistrySiteRecord(site);
      if (managed.aliases.some((alias) => alias.value.toLowerCase() === normalized)) {
        return managed;
      }
    }
    return null;
  }

  /**
   * List the management read model, including retired records.
   */
  listManagedSites(): RegistrySiteRecord[] {
    return this.listSites().map((site) => asRegistrySiteRecord(site));
  }

  /**
   * Execute or preview one explicit registry-management operation.
   *
   * Applying an operation re-evaluates the current row inside one SQLite
   * transaction before writing the row and its management audit event.
   */
  manageSite(request: RegistryManagementRequest): RegistryManagementResult {
    if (request.apply !== true) return this.evaluateManagement(request);

    return this.db.transaction(() => {
      const evaluation = this.evaluateManagement(request);
      if (evaluation.status === "refused") {
        const auditRef = this.recordManagementAudit({
          eventId: `registry-management-${randomUUID()}`,
          siteId: evaluation.siteId,
          operation: request.operation,
          actor: request.actor.trim(),
          reason: request.reason?.trim() || evaluation.refusals.join("; ") || evaluation.conflicts.map((conflict) => conflict.code).join("; "),
          occurredAt: new Date().toISOString(),
          beforeJson: evaluation.before ? JSON.stringify(evaluation.before) : null,
          afterJson: null,
          status: "refused",
        });
        return { ...evaluation, auditRef };
      }
      if (evaluation.changes.length === 0) {
        return {
          ...evaluation,
          status: "unchanged" as const,
          mutationPerformed: false,
        };
      }

      if (request.operation === "purge") {
        this.db.prepare("DELETE FROM site_registry WHERE site_id = ?").run(evaluation.siteId);
      } else if (evaluation.after) {
        this.writeManagedSite(evaluation.after);
      }

      const auditRef = this.recordManagementAudit({
        eventId: `registry-management-${randomUUID()}`,
        siteId: evaluation.siteId,
        operation: request.operation,
        actor: request.actor.trim(),
        reason: request.reason?.trim() || null,
        occurredAt: new Date().toISOString(),
        beforeJson: evaluation.before ? JSON.stringify(evaluation.before) : null,
        afterJson: evaluation.after ? JSON.stringify(evaluation.after) : null,
        status: "applied",
      });
      const after = request.operation === "purge"
        ? null
        : this.getManagedSite(evaluation.siteId);
      return {
        ...evaluation,
        status: "applied" as const,
        mutationPerformed: true,
        after,
        auditRef,
      };
    })();
  }

  private evaluateManagement(request: RegistryManagementRequest): RegistryManagementResult {
    const requestedSiteId = request.siteId.trim();
    const resolved = requestedSiteId ? this.getManagedSite(requestedSiteId) : null;
    const siteId = resolved?.siteId ?? requestedSiteId;
    const conflicts: RegistryConflict[] = [];
    const refusals: string[] = [];

    if (!siteId) refusals.push("site_id_required");
    if (!request.actor.trim()) refusals.push("actor_required");
    if (request.expectedRevision !== undefined && resolved && resolved.revision !== request.expectedRevision) {
      refusals.push(`revision_conflict: expected ${request.expectedRevision}, found ${resolved.revision}`);
    }

    const before = resolved;
    const now = new Date().toISOString();
    let after: RegistrySiteRecord | null = before;

    if (request.operation === "add") {
      if (!request.siteRoot?.trim()) refusals.push("site_root_required");
      const incomingSources = requestSources(request);
      if (incomingSources.length === 0) refusals.push("source_required");
      if (before?.lifecycleStatus === "retired" && request.reAdmit !== true) {
        refusals.push("retired_record_requires_restore_or_re_admit");
      }
      if (before?.lifecycleStatus === "retired" && request.reAdmit === true && !request.reason?.trim()) {
        refusals.push("reason_required_for_re_admit");
      }
      if (request.siteRoot) {
        const owner = this.listManagedSites().find((site) =>
          site.siteId !== before?.siteId && rootsEqual(site.siteRoot, request.siteRoot as string),
        );
        if (owner) {
          conflicts.push({
            code: "root_owned_by_other_site",
            message: `Root is already registered under ${owner.siteId}.`,
            siteId: owner.siteId,
            siteRoot: owner.siteRoot,
          });
        }
      }
      for (const alias of request.aliases ?? []) {
        if (alias.value.trim().toLowerCase() === siteId.toLowerCase()) {
          conflicts.push({
            code: "alias_matches_canonical_id",
            message: `Alias ${alias.value} is the canonical id for this Site.`,
            siteId,
          });
          continue;
        }
        const owner = this.listManagedSites().find((site) =>
          site.siteId !== before?.siteId && siteOwnsReference(site, alias.value),
        );
        if (owner) {
          conflicts.push({
            code: "alias_owned_by_other_site",
            message: `Alias ${alias.value} is already owned by ${owner.siteId}.`,
            siteId: owner.siteId,
            siteRoot: owner.siteRoot,
          });
        }
      }
      if (before && request.siteRoot && !rootsEqual(before.siteRoot, request.siteRoot)) {
        conflicts.push({
          code: "site_id_root_conflict",
          message: `Site id ${before.siteId} already points to ${before.siteRoot}.`,
          siteId: before.siteId,
          siteRoot: before.siteRoot,
        });
      }

      if (refusals.length === 0 && conflicts.length === 0) {
        const siteRoot = request.siteRoot as string;
        const observationStatus = classifyRootObservation(siteRoot);
        after = before
          ? {
              ...before,
              variant: request.variant ?? before.variant,
              siteRoot,
              substrate: request.substrate ?? before.substrate,
              aimJson: request.aimJson !== undefined ? request.aimJson : before.aimJson,
              controlEndpoint: request.controlEndpoint !== undefined ? request.controlEndpoint : before.controlEndpoint,
              lastSeenAt: observationStatus === "present" ? now : before.lastSeenAt,
              lifecycleStatus: "active",
              observationStatus,
              sources: mergeSources(before.sources, incomingSources),
              aliases: mergeAliases(before.aliases, request.aliases),
              revision: before.revision + 1,
              updatedAt: now,
              retiredAt: null,
              retireReason: null,
            }
          : {
              siteId,
              variant: request.variant ?? "native",
              siteRoot,
              substrate: request.substrate ?? "windows",
              aimJson: request.aimJson ?? null,
              controlEndpoint: request.controlEndpoint ?? null,
              lastSeenAt: observationStatus === "present" ? now : null,
              createdAt: now,
              lifecycleStatus: "active",
              observationStatus,
              sources: incomingSources,
              aliases: request.aliases ?? [],
              revision: 1,
              updatedAt: now,
              retiredAt: null,
              retireReason: null,
            };
      }
    } else if (request.operation === "edit") {
      if (!before) refusals.push("site_not_found");
      if (!request.reason?.trim()) refusals.push("reason_required");
      if (request.clearAimJson && request.aimJson !== undefined) refusals.push("clear_aim_json_with_value");
      if (request.clearControlEndpoint && request.controlEndpoint !== undefined) refusals.push("clear_control_endpoint_with_value");
      if (request.clearAliases && request.aliases !== undefined) refusals.push("clear_aliases_with_value");
      if (!request.siteRoot && request.variant === undefined && request.substrate === undefined
        && request.aimJson === undefined && request.controlEndpoint === undefined
        && !request.aliases && !request.clearAimJson && !request.clearControlEndpoint
        && !request.clearAliases && requestSources(request).length === 0) {
        refusals.push("edit_patch_required");
      }
      if (request.siteRoot) {
        const owner = this.listManagedSites().find((site) =>
          site.siteId !== before?.siteId && rootsEqual(site.siteRoot, request.siteRoot as string),
        );
        if (owner) {
          conflicts.push({
            code: "root_owned_by_other_site",
            message: `Root is already registered under ${owner.siteId}.`,
            siteId: owner.siteId,
            siteRoot: owner.siteRoot,
          });
        }
      }
      for (const alias of request.aliases ?? []) {
        if (alias.value.trim().toLowerCase() === siteId.toLowerCase()) {
          conflicts.push({
            code: "alias_matches_canonical_id",
            message: `Alias ${alias.value} is the canonical id for this Site.`,
            siteId,
          });
          continue;
        }
        const owner = this.listManagedSites().find((site) =>
          site.siteId !== before?.siteId && siteOwnsReference(site, alias.value),
        );
        if (owner) {
          conflicts.push({
            code: "alias_owned_by_other_site",
            message: `Alias ${alias.value} is already owned by ${owner.siteId}.`,
            siteId: owner.siteId,
            siteRoot: owner.siteRoot,
          });
        }
      }
      if (before && refusals.length === 0 && conflicts.length === 0) {
        const siteRoot = request.siteRoot ?? before.siteRoot;
        const rootChanged = !rootsEqual(before.siteRoot, siteRoot);
        const observationStatus = rootChanged ? classifyRootObservation(siteRoot) : before.observationStatus;
        after = {
          ...before,
          siteRoot,
          variant: request.variant ?? before.variant,
          substrate: request.substrate ?? before.substrate,
          aimJson: request.clearAimJson ? null : request.aimJson !== undefined ? request.aimJson : before.aimJson,
          controlEndpoint: request.clearControlEndpoint ? null : request.controlEndpoint !== undefined ? request.controlEndpoint : before.controlEndpoint,
          lastSeenAt: rootChanged && observationStatus === "present" ? now : before.lastSeenAt,
          observationStatus,
          sources: mergeSources(before.sources, requestSources(request)),
          aliases: request.clearAliases ? [] : request.aliases ? mergeAliases(before.aliases, request.aliases) : before.aliases,
          revision: before.revision + 1,
          updatedAt: now,
        };
      }
    } else if (request.operation === "retire") {
      if (!before) refusals.push("site_not_found");
      if (!request.reason?.trim()) refusals.push("reason_required");
      if (before && refusals.length === 0) {
        after = before.lifecycleStatus === "retired"
          ? before
          : {
              ...before,
              lifecycleStatus: "retired",
              retiredAt: now,
              retireReason: request.reason!.trim(),
              revision: before.revision + 1,
              updatedAt: now,
            };
      }
    } else if (request.operation === "restore") {
      if (!before) refusals.push("site_not_found");
      if (!request.reason?.trim()) refusals.push("reason_required");
      if (before && refusals.length === 0) {
        const observationStatus = classifyRootObservation(before.siteRoot);
        after = before.lifecycleStatus === "active"
          ? before
          : {
              ...before,
              lifecycleStatus: "active",
              observationStatus,
              retiredAt: null,
              retireReason: null,
              revision: before.revision + 1,
              updatedAt: now,
            };
      }
    } else if (request.operation === "purge") {
      if (!before) refusals.push("site_not_found");
      if (!request.reason?.trim()) refusals.push("reason_required");
      if (before && before.lifecycleStatus !== "retired") refusals.push("purge_requires_retired_site");
      if (request.apply === true && before && request.confirmSiteId !== before.siteId) {
        refusals.push("purge_confirmation_mismatch");
      }
      if (before && refusals.length === 0) after = null;
    }

    const changes = managedChanges(before, after);
    if (conflicts.length > 0 || refusals.length > 0) {
      return managementResult(request.operation, siteId, before, before, [], conflicts, refusals, false);
    }
    return managementResult(request.operation, siteId, before, after, changes, [], [], false);
  }

  private writeManagedSite(site: RegistrySiteRecord): void {
    this.db.prepare(
      `INSERT INTO site_registry (
         site_id, variant, site_root, substrate, aim_json, control_endpoint, last_seen_at,
         created_at, lifecycle_status, observation_status, sources_json, aliases_json,
         revision, updated_at, retired_at, retire_reason
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(site_id) DO UPDATE SET
         variant = excluded.variant,
         site_root = excluded.site_root,
         substrate = excluded.substrate,
         aim_json = excluded.aim_json,
         control_endpoint = excluded.control_endpoint,
         last_seen_at = excluded.last_seen_at,
         lifecycle_status = excluded.lifecycle_status,
         observation_status = excluded.observation_status,
         sources_json = excluded.sources_json,
         aliases_json = excluded.aliases_json,
         revision = excluded.revision,
         updated_at = excluded.updated_at,
         retired_at = excluded.retired_at,
         retire_reason = excluded.retire_reason`,
    ).run(
      site.siteId,
      site.variant,
      site.siteRoot,
      site.substrate,
      site.aimJson,
      site.controlEndpoint,
      site.lastSeenAt,
      site.createdAt,
      site.lifecycleStatus,
      site.observationStatus,
      JSON.stringify(site.sources),
      JSON.stringify(site.aliases),
      site.revision,
      site.updatedAt,
      site.retiredAt,
      site.retireReason,
    );
  }

  private recordManagementAudit(record: RegistryManagementAuditRecord): string {
    this.db.prepare(
      `INSERT INTO registry_management_audit (
         event_id, site_id, operation, actor, reason, occurred_at, before_json, after_json, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      record.eventId,
      record.siteId,
      record.operation,
      record.actor,
      record.reason,
      record.occurredAt,
      record.beforeJson,
      record.afterJson,
      record.status,
    );
    return record.eventId;
  }

  getManagementAuditRecords(siteId: string, limit = 100): RegistryManagementAuditRecord[] {
    const rows = this.db.prepare(
      `SELECT event_id, site_id, operation, actor, reason, occurred_at, before_json, after_json, status
       FROM registry_management_audit WHERE site_id = ? ORDER BY occurred_at DESC LIMIT ?`,
    ).all(siteId, limit) as Array<{
      event_id: string;
      site_id: string;
      operation: RegistryManagementOperation;
      actor: string;
      reason: string | null;
      occurred_at: string;
      before_json: string | null;
      after_json: string | null;
      status: "applied" | "refused";
    }>;
    return rows.map((row) => ({
      eventId: row.event_id,
      siteId: row.site_id,
      operation: row.operation,
      actor: row.actor,
      reason: row.reason,
      occurredAt: row.occurred_at,
      beforeJson: row.before_json,
      afterJson: row.after_json,
      status: row.status,
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

  importContinuityPacket(packet: SiteContinuityExchangePacket, options: { importedAt?: string } = {}): SiteContinuityPacketImportResult {
    const decision = classifySiteContinuityExchangePacket(packet);
    if (decision.action === "refuse") {
      return { ok: false, status: "refused", decision };
    }

    const siteId = packet.site_id;
    if (!siteId) {
      return { ok: false, status: "refused", decision: { ...decision, action: "refuse", reason: "site_continuity_packet_site_id_missing" } };
    }

    const importedAt = options.importedAt ?? new Date().toISOString();
    const packetId = packet.packet_id ?? createSiteContinuityPacketId(packet);
    const packetJson = JSON.stringify(packet);

    this.db
      .prepare(
        `INSERT INTO site_continuity_packets (
          packet_id, site_id, relation_id, source_embodiment_kind, target_embodiment_kind,
          admission_action, admission_reason, packet_json, imported_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(packet_id) DO UPDATE SET
          admission_action = excluded.admission_action,
          admission_reason = excluded.admission_reason,
          packet_json = excluded.packet_json,
          imported_at = excluded.imported_at`,
      )
      .run(
        packetId,
        siteId,
        packet.relation_id ?? null,
        packet.source_embodiment_kind,
        packet.target_embodiment_kind,
        decision.action,
        decision.reason,
        packetJson,
        importedAt,
      );

    return {
      ok: true,
      status: "imported",
      decision,
      packetRecord: {
        packetId,
        siteId,
        relationId: packet.relation_id ?? null,
        sourceEmbodimentKind: packet.source_embodiment_kind,
        targetEmbodimentKind: packet.target_embodiment_kind,
        admissionAction: decision.action,
        admissionReason: decision.reason,
        packetJson,
        importedAt,
      },
    };
  }

  listContinuityPackets(siteId: string, limit = 100): SiteContinuityPacketRecord[] {
    const rows = this.db
      .prepare(
        `SELECT packet_id, site_id, relation_id, source_embodiment_kind, target_embodiment_kind,
          admission_action, admission_reason, packet_json, imported_at
         FROM site_continuity_packets WHERE site_id = ? ORDER BY imported_at DESC LIMIT ?`,
      )
      .all(siteId, limit) as Array<{
      packet_id: string;
      site_id: string;
      relation_id: string | null;
      source_embodiment_kind: string;
      target_embodiment_kind: string;
      admission_action: string;
      admission_reason: string;
      packet_json: string;
      imported_at: string;
    }>;

    return rows.map((row) => ({
      packetId: row.packet_id,
      siteId: row.site_id,
      relationId: row.relation_id,
      sourceEmbodimentKind: row.source_embodiment_kind,
      targetEmbodimentKind: row.target_embodiment_kind,
      admissionAction: row.admission_action,
      admissionReason: row.admission_reason,
      packetJson: row.packet_json,
      importedAt: row.imported_at,
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
  const { Database: DatabaseCtor } = await import("@narada2/control-plane");
  return new DatabaseCtor(dbPath) as Database;
}
