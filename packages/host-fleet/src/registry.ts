import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join, posix, win32 } from 'node:path';
import Database from '@narada2/sqlite';
import {
  createHostRecord,
  hostKey,
  hostKeysEqual,
  validateHostKey,
  validateHostRecord,
  type HostHealthSnapshot,
  type HostKey,
  type HostLifecycleState,
  type HostRecord,
  type HostRecordInput,
  type HostHealthStatus,
} from './contract.js';

export interface HostFleetRegistryResult {
  status: 'registered' | 'updated' | 'unchanged' | 'retired' | 'revoked' | 'refused';
  mutation_performed: boolean;
  host: HostRecord | null;
  reason: string | null;
}

export interface HostFleetAuditEntry {
  schema: 'narada.host_fleet.audit.v1';
  audit_id: string;
  operation: 'register' | 'reenrollment_retire' | 'health_update' | 'revoke' | 'retire';
  status: 'applied' | 'unchanged' | 'refused';
  host: HostKey;
  revision: number | null;
  reason: string | null;
  recorded_at: string;
}

export interface HostFleetRegistryOptions {
  allow_reenrollment?: boolean;
  now?: Date;
}

interface HostRow {
  host_id: string;
  host_instance_id: string;
  record_json: string;
}

function configuredUserSiteRoot(): string {
  const configured = process.env.NARADA_USER_SITE_ROOT?.trim();
  if (configured) return configured;
  if (process.platform === 'win32') {
    const profile = process.env.USERPROFILE?.trim();
    if (profile) return win32.join(profile, 'Narada');
  }
  return posix.join(process.env.HOME?.trim() || homedir(), 'Narada');
}

export function resolveHostFleetRegistryDbPath(): string {
  const explicit = process.env.NARADA_HOST_FLEET_REGISTRY_PATH?.trim();
  if (explicit) return explicit;
  const root = configuredUserSiteRoot();
  return process.platform === 'win32'
    ? win32.join(root, '.narada', 'host-fleet', 'registry.db')
    : posix.join(root, '.narada', 'host-fleet', 'registry.db');
}

export function openHostFleetRegistry(path = resolveHostFleetRegistryDbPath()): HostFleetRegistry {
  mkdirSync(dirname(path), { recursive: true });
  return new HostFleetRegistry(new Database(path));
}

function parseHostRow(row: HostRow): HostRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.record_json);
  } catch {
    throw new Error(`host_registry_record_invalid:${row.host_id}@${row.host_instance_id}`);
  }
  return validateHostRecord(parsed);
}

function activeLifecycle(state: HostLifecycleState): boolean {
  return state === 'pending' || state === 'active';
}

function sameMutableRecord(left: HostRecord, right: HostRecord): boolean {
  return JSON.stringify({
    host_id: left.host_id,
    host_instance_id: left.host_instance_id,
    display_name: left.display_name,
    platform: left.platform,
    narada_version: left.narada_version,
    gateway: left.gateway,
    capabilities: left.capabilities,
    admitted_sites: left.admitted_sites,
    credential_ref: left.credential_ref,
    lifecycle_state: left.lifecycle_state,
  }) === JSON.stringify({
    host_id: right.host_id,
    host_instance_id: right.host_instance_id,
    display_name: right.display_name,
    platform: right.platform,
    narada_version: right.narada_version,
    gateway: right.gateway,
    capabilities: right.capabilities,
    admitted_sites: right.admitted_sites,
    credential_ref: right.credential_ref,
    lifecycle_state: right.lifecycle_state,
  });
}

function withRevision(record: HostRecord, revision: number, now: Date): HostRecord {
  return {
    ...record,
    updated_at: now.toISOString(),
    revision,
  };
}

export class HostFleetRegistry {
  constructor(private readonly db: Database) {
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS host_registry (
        host_id TEXT NOT NULL,
        host_instance_id TEXT NOT NULL,
        record_json TEXT NOT NULL,
        lifecycle_state TEXT NOT NULL,
        revision INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (host_id, host_instance_id)
      );
      CREATE INDEX IF NOT EXISTS idx_host_registry_host_id ON host_registry(host_id);
      CREATE INDEX IF NOT EXISTS idx_host_registry_lifecycle ON host_registry(lifecycle_state);
      CREATE TABLE IF NOT EXISTS host_fleet_audit (
        audit_id TEXT PRIMARY KEY,
        operation TEXT NOT NULL,
        status TEXT NOT NULL,
        host_id TEXT NOT NULL,
        host_instance_id TEXT NOT NULL,
        revision INTEGER,
        reason TEXT,
        recorded_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_host_fleet_audit_host
        ON host_fleet_audit(host_id, host_instance_id, recorded_at);
    `);
  }

  getHost(key: HostKey): HostRecord | null {
    const normalized = validateHostKey(key);
    const row = this.db.prepare(
      'SELECT host_id, host_instance_id, record_json FROM host_registry WHERE host_id = ? AND host_instance_id = ?',
    ).get(normalized.host_id, normalized.host_instance_id) as HostRow | undefined;
    return row ? parseHostRow(row) : null;
  }

  listHosts(options: { includeRetired?: boolean } = {}): HostRecord[] {
    const rows = (options.includeRetired === true
      ? this.db.prepare('SELECT host_id, host_instance_id, record_json FROM host_registry ORDER BY host_id ASC, host_instance_id ASC').all()
      : this.db.prepare("SELECT host_id, host_instance_id, record_json FROM host_registry WHERE lifecycle_state != 'retired' ORDER BY host_id ASC, host_instance_id ASC").all()) as HostRow[];
    return rows.map(parseHostRow);
  }

  listAudit(options: { host?: HostKey; limit?: number } = {}): HostFleetAuditEntry[] {
    const limit = options.limit ?? 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) throw new Error('host_audit_limit_invalid');
    const host = options.host ? validateHostKey(options.host) : null;
    const rows = host
      ? this.db.prepare(`
          SELECT audit_id, operation, status, host_id, host_instance_id, revision, reason, recorded_at
          FROM host_fleet_audit
          WHERE host_id = ? AND host_instance_id = ?
          ORDER BY recorded_at DESC LIMIT ?
        `).all(host.host_id, host.host_instance_id, limit)
      : this.db.prepare(`
          SELECT audit_id, operation, status, host_id, host_instance_id, revision, reason, recorded_at
          FROM host_fleet_audit
          ORDER BY recorded_at DESC LIMIT ?
        `).all(limit);
    return (rows as Array<Record<string, unknown>>).map((row) => ({
      schema: 'narada.host_fleet.audit.v1',
      audit_id: String(row.audit_id),
      operation: String(row.operation) as HostFleetAuditEntry['operation'],
      status: String(row.status) as HostFleetAuditEntry['status'],
      host: validateHostKey({ host_id: row.host_id, host_instance_id: row.host_instance_id }),
      revision: row.revision == null ? null : Number(row.revision),
      reason: row.reason == null ? null : String(row.reason),
      recorded_at: String(row.recorded_at),
    }));
  }

  registerHost(input: HostRecordInput, options: HostFleetRegistryOptions = {}): HostFleetRegistryResult {
    const now = options.now ?? new Date();
    const candidate = createHostRecord(input, now);
    return this.db.transaction(() => {
      const exact = this.getHost(candidate);
      const sibling = this.listHosts({ includeRetired: true }).find((record) =>
        record.host_id === candidate.host_id && !hostKeysEqual(record, candidate) && activeLifecycle(record.lifecycle_state));

      if (sibling && options.allow_reenrollment !== true) {
        this.writeAudit({
          operation: 'register',
          status: 'refused',
          host: candidate,
          revision: null,
          reason: 'host_instance_conflict_requires_explicit_reenrollment',
          recordedAt: now,
        });
        return {
          status: 'refused',
          mutation_performed: false,
          host: sibling,
          reason: 'host_instance_conflict_requires_explicit_reenrollment',
        } satisfies HostFleetRegistryResult;
      }

      if (sibling && options.allow_reenrollment === true) {
        const retired = {
          ...sibling,
          lifecycle_state: 'retired' as const,
          health: {
            ...sibling.health,
            status: 'revoked' as const,
            detail: 'replaced_by_explicit_reenrollment',
            observed_at: now.toISOString(),
          },
        } satisfies HostRecord;
        this.writeHost(withRevision(retired, sibling.revision + 1, now));
        this.writeAudit({
          operation: 'reenrollment_retire',
          status: 'applied',
          host: retired,
          revision: sibling.revision + 1,
          reason: 'replaced_by_explicit_reenrollment',
          recordedAt: now,
        });
      }

      if (!exact) {
        this.writeHost(candidate);
        this.writeAudit({
          operation: 'register',
          status: 'applied',
          host: candidate,
          revision: candidate.revision,
          reason: null,
          recordedAt: now,
        });
        return { status: 'registered', mutation_performed: true, host: candidate, reason: null } satisfies HostFleetRegistryResult;
      }
      if (exact.lifecycle_state === 'revoked' && options.allow_reenrollment !== true) {
        this.writeAudit({
          operation: 'register',
          status: 'refused',
          host: exact,
          revision: exact.revision,
          reason: 'host_revoked_requires_explicit_reenrollment',
          recordedAt: now,
        });
        return {
          status: 'refused',
          mutation_performed: false,
          host: exact,
          reason: 'host_revoked_requires_explicit_reenrollment',
        } satisfies HostFleetRegistryResult;
      }
      if (sameMutableRecord(exact, candidate)) {
        this.writeAudit({
          operation: 'register',
          status: 'unchanged',
          host: exact,
          revision: exact.revision,
          reason: null,
          recordedAt: now,
        });
        return { status: 'unchanged', mutation_performed: false, host: exact, reason: null } satisfies HostFleetRegistryResult;
      }
      const updated = withRevision({
        ...candidate,
        created_at: exact.created_at,
        lifecycle_state: exact.lifecycle_state === 'retired' ? 'pending' : candidate.lifecycle_state,
        health: exact.health,
        last_seen_at: exact.last_seen_at,
        revision: exact.revision,
      }, exact.revision + 1, now);
      this.writeHost(updated);
      this.writeAudit({
        operation: 'register',
        status: 'applied',
        host: updated,
        revision: updated.revision,
        reason: null,
        recordedAt: now,
      });
      return { status: 'updated', mutation_performed: true, host: updated, reason: null } satisfies HostFleetRegistryResult;
    })();
  }

  updateHealth(key: HostKey, health: HostHealthSnapshot): HostFleetRegistryResult {
    const normalized = validateHostKey(key);
    const existing = this.getHost(normalized);
    if (!existing) {
      this.writeAudit({
        operation: 'health_update',
        status: 'refused',
        host: normalized,
        revision: null,
        reason: 'host_not_registered',
        recordedAt: new Date(),
      });
      return { status: 'refused', mutation_performed: false, host: null, reason: 'host_not_registered' };
    }
    if (existing.lifecycle_state === 'retired' || existing.lifecycle_state === 'revoked') {
      this.writeAudit({
        operation: 'health_update',
        status: 'refused',
        host: existing,
        revision: existing.revision,
        reason: `host_${existing.lifecycle_state}`,
        recordedAt: new Date(),
      });
      return { status: 'refused', mutation_performed: false, host: existing, reason: `host_${existing.lifecycle_state}` };
    }
    const updatedAt = new Date(health.observed_at ?? Date.now()).toISOString();
    const updated: HostRecord = {
      ...existing,
      updated_at: updatedAt,
      last_seen_at: health.status === 'online' || health.status === 'degraded' ? updatedAt : existing.last_seen_at,
      health,
      revision: existing.revision + 1,
    };
    this.writeHost(updated);
    this.writeAudit({
      operation: 'health_update',
      status: 'applied',
      host: updated,
      revision: updated.revision,
      reason: null,
      recordedAt: new Date(updatedAt),
    });
    return { status: 'updated', mutation_performed: true, host: updated, reason: null };
  }

  revokeHost(key: HostKey, reason = 'operator_revoked'): HostFleetRegistryResult {
    return this.transitionHost(key, 'revoked', 'revoked', reason);
  }

  retireHost(key: HostKey, reason = 'operator_retired'): HostFleetRegistryResult {
    return this.transitionHost(key, 'retired', 'revoked', reason);
  }

  private transitionHost(key: HostKey, lifecycleState: 'revoked' | 'retired', healthStatus: HostHealthStatus, reason: string): HostFleetRegistryResult {
    const existing = this.getHost(key);
    const normalized = validateHostKey(key);
    const operation = lifecycleState === 'revoked' ? 'revoke' : 'retire';
    if (!existing) {
      this.writeAudit({ operation, status: 'refused', host: normalized, revision: null, reason: 'host_not_registered', recordedAt: new Date() });
      return { status: 'refused', mutation_performed: false, host: null, reason: 'host_not_registered' };
    }
    if (existing.lifecycle_state === lifecycleState) {
      this.writeAudit({ operation, status: 'unchanged', host: existing, revision: existing.revision, reason: null, recordedAt: new Date() });
      return { status: lifecycleState, mutation_performed: false, host: existing, reason: null };
    }
    const now = new Date();
    const updated: HostRecord = {
      ...existing,
      lifecycle_state: lifecycleState,
      updated_at: now.toISOString(),
      health: { ...existing.health, status: healthStatus, observed_at: now.toISOString(), detail: reason },
      revision: existing.revision + 1,
    };
    this.writeHost(updated);
    this.writeAudit({ operation, status: 'applied', host: updated, revision: updated.revision, reason, recordedAt: now });
    return { status: lifecycleState, mutation_performed: true, host: updated, reason: null };
  }

  private writeAudit(input: {
    operation: HostFleetAuditEntry['operation'];
    status: HostFleetAuditEntry['status'];
    host: HostKey;
    revision: number | null;
    reason: string | null;
    recordedAt: Date;
  }): void {
    const host = validateHostKey(input.host);
    this.db.prepare(`
      INSERT INTO host_fleet_audit
        (audit_id, operation, status, host_id, host_instance_id, revision, reason, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      input.operation,
      input.status,
      host.host_id,
      host.host_instance_id,
      input.revision,
      input.reason,
      input.recordedAt.toISOString(),
    );
  }

  private writeHost(record: HostRecord): void {
    const normalized = validateHostRecord(record);
    this.db.prepare(`
      INSERT INTO host_registry (host_id, host_instance_id, record_json, lifecycle_state, revision, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(host_id, host_instance_id) DO UPDATE SET
        record_json = excluded.record_json,
        lifecycle_state = excluded.lifecycle_state,
        revision = excluded.revision,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
    `).run(
      normalized.host_id,
      normalized.host_instance_id,
      JSON.stringify(normalized),
      normalized.lifecycle_state,
      normalized.revision,
      normalized.created_at,
      normalized.updated_at,
    );
  }

  close(): void {
    this.db.close();
  }
}

export { hostKey };
