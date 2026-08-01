import { mkdirSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join, posix, win32 } from 'node:path';
import Database from '@narada-core/sqlite';
import {
  HOST_FLEET_CREDENTIAL_ROLLBACK_RESULT_SCHEMA,
  HOST_FLEET_CREDENTIAL_ROTATION_RESULT_SCHEMA,
  HOST_FLEET_ENROLLMENT_RESULT_SCHEMA,
  HOST_FLEET_LAUNCH_RESULT_SCHEMA,
  HOST_FLEET_LIFECYCLE_RESULT_SCHEMA,
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
  preflightHostFleetCredentialRotationIntent,
  preflightHostFleetCredentialRollbackIntent,
  preflightHostFleetLaunchIntent,
  preflightHostFleetEnrollmentIntent,
  preflightHostFleetLifecycleIntent,
  validateHostFleetCredentialRotationIntent,
  validateHostFleetCredentialRollbackIntent,
  validateHostFleetLaunchIntent,
  validateHostFleetEnrollmentIntent,
  validateHostFleetLifecycleIntent,
  type HostFleetCredentialRotationIntent,
  type HostFleetCredentialRotationResult,
  type HostFleetCredentialRollbackIntent,
  type HostFleetCredentialRollbackResult,
  type HostFleetEnrollmentIntent,
  type HostFleetEnrollmentResult,
  type HostFleetLaunchIntent,
  type HostFleetLaunchResult,
  type HostFleetLifecycleIntent,
  type HostFleetLifecycleResult,
} from './contract.js';
import type { HostGatewayRequestObservation } from './gateway.js';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/u;

export interface HostFleetRegistryResult {
  status: 'registered' | 'updated' | 'unchanged' | 'retired' | 'revoked' | 'refused';
  mutation_performed: boolean;
  host: HostRecord | null;
  reason: string | null;
}

export interface HostFleetAuditEntry {
  schema: 'narada.host_fleet.audit.v1';
  audit_id: string;
  operation: 'register' | 'reenrollment_retire' | 'health_update' | 'revoke' | 'retire' | 'launch' | 'credential_rotate' | 'credential_rollback';
  status: 'applied' | 'unchanged' | 'refused';
  host: HostKey;
  revision: number | null;
  request_id: string | null;
  actor: string | null;
  reason: string | null;
  recorded_at: string;
}

export interface HostFleetCredentialHistoryEntry {
  schema: 'narada.host_fleet.credential_history.v1';
  host: HostKey;
  revision: number;
  credential_ref: string;
  credential: HostRecord['gateway']['credential'];
  request_id: string | null;
  recorded_at: string;
}

export interface HostFleetGatewayObservation extends HostGatewayRequestObservation {}

export interface HostFleetRegistryOptions {
  allow_reenrollment?: boolean;
  actor?: string;
  request_id?: string;
  now?: Date;
}

export interface HostFleetMutationOptions {
  actor?: string;
}

interface HostRow {
  host_id: string;
  host_instance_id: string;
  record_json: string;
}

interface IntentResultRow {
  request_id: string;
  intent_hash: string;
  result_json: string;
}

function intentHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function actorName(value: string | undefined): string {
  const actor = value?.trim() || 'operator-console';
  if (actor.length > 128) throw new Error('host_fleet_actor_invalid');
  return actor;
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
        request_id TEXT,
        actor TEXT,
        reason TEXT,
        recorded_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_host_fleet_audit_host
        ON host_fleet_audit(host_id, host_instance_id, recorded_at);
      CREATE TABLE IF NOT EXISTS host_fleet_gateway_observation (
        request_id TEXT PRIMARY KEY,
        host_id TEXT NOT NULL,
        host_instance_id TEXT NOT NULL,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        status INTEGER,
        outcome TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        reason TEXT,
        observed_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_host_fleet_gateway_observation_host
        ON host_fleet_gateway_observation(host_id, host_instance_id, observed_at);
      CREATE TABLE IF NOT EXISTS host_fleet_intent_result (
        request_id TEXT PRIMARY KEY,
        intent_hash TEXT NOT NULL,
        result_json TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS host_fleet_credential_history (
        host_id TEXT NOT NULL,
        host_instance_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        credential_ref TEXT NOT NULL,
        credential_json TEXT NOT NULL,
        request_id TEXT,
        recorded_at TEXT NOT NULL,
        PRIMARY KEY (host_id, host_instance_id, revision)
      );
      CREATE INDEX IF NOT EXISTS idx_host_fleet_credential_history_host
        ON host_fleet_credential_history(host_id, host_instance_id, revision);
    `);
    // Existing User Site registries predate actor/request correlation. Keep
    // those databases readable while making new audit rows fully attributable.
    for (const column of ['request_id TEXT', 'actor TEXT']) {
      try { this.db.exec(`ALTER TABLE host_fleet_audit ADD COLUMN ${column}`); } catch { /* already migrated */ }
    }
    this.seedCredentialHistory();
  }

  private seedCredentialHistory(): void {
    const rows = this.db.prepare('SELECT host_id, host_instance_id, record_json FROM host_registry').all() as HostRow[];
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO host_fleet_credential_history
        (host_id, host_instance_id, revision, credential_ref, credential_json, request_id, recorded_at)
      VALUES (?, ?, ?, ?, ?, NULL, ?)
    `);
    for (const row of rows) {
      const host = parseHostRow(row);
      insert.run(
        host.host_id,
        host.host_instance_id,
        host.revision,
        host.credential_ref,
        JSON.stringify(host.gateway.credential),
        host.updated_at,
      );
    }
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
          SELECT audit_id, operation, status, host_id, host_instance_id, revision, request_id, actor, reason, recorded_at
          FROM host_fleet_audit
          WHERE host_id = ? AND host_instance_id = ?
          ORDER BY recorded_at DESC LIMIT ?
        `).all(host.host_id, host.host_instance_id, limit)
      : this.db.prepare(`
          SELECT audit_id, operation, status, host_id, host_instance_id, revision, request_id, actor, reason, recorded_at
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
      request_id: row.request_id == null ? null : String(row.request_id),
      actor: row.actor == null ? null : String(row.actor),
      reason: row.reason == null ? null : String(row.reason),
      recorded_at: String(row.recorded_at),
    }));
  }

  recordGatewayObservation(observation: HostGatewayRequestObservation): void {
    const host = validateHostKey(observation.host);
    if (observation.schema !== 'narada.host_fleet.gateway_request_observation.v1') throw new Error('host_gateway_observation_schema_invalid');
    if (!REQUEST_ID_PATTERN.test(observation.request_id)) throw new Error('host_gateway_observation_request_id_invalid');
    if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(observation.method)) throw new Error('host_gateway_observation_method_invalid');
    if (!observation.path.startsWith('/') || observation.path.length > 2_048 || observation.path.includes('..') || observation.path.includes('?') || observation.path.includes('\\')) {
      throw new Error('host_gateway_observation_path_invalid');
    }
    if (observation.status !== null && (!Number.isInteger(observation.status) || observation.status < 100 || observation.status > 599)) {
      throw new Error('host_gateway_observation_status_invalid');
    }
    if (!['success', 'refused', 'error'].includes(observation.outcome)) throw new Error('host_gateway_observation_outcome_invalid');
    if (!Number.isInteger(observation.duration_ms) || observation.duration_ms < 0 || observation.duration_ms > 120_000) throw new Error('host_gateway_observation_duration_invalid');
    if (Number.isNaN(Date.parse(observation.observed_at))) throw new Error('host_gateway_observation_timestamp_invalid');
    this.db.prepare(`
      INSERT OR REPLACE INTO host_fleet_gateway_observation
        (request_id, host_id, host_instance_id, method, path, status, outcome, duration_ms, reason, observed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      observation.request_id,
      host.host_id,
      host.host_instance_id,
      observation.method,
      observation.path,
      observation.status,
      observation.outcome,
      observation.duration_ms,
      observation.reason?.slice(0, 512) ?? null,
      observation.observed_at,
    );
    this.db.prepare(`
      DELETE FROM host_fleet_gateway_observation
      WHERE request_id NOT IN (
        SELECT request_id FROM host_fleet_gateway_observation
        ORDER BY observed_at DESC LIMIT 5000
      )
    `).run();
  }

  listGatewayObservations(options: { host?: HostKey; limit?: number } = {}): HostFleetGatewayObservation[] {
    const limit = options.limit ?? 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) throw new Error('host_gateway_observation_limit_invalid');
    const host = options.host ? validateHostKey(options.host) : null;
    const rows = host
      ? this.db.prepare(`
          SELECT request_id, host_id, host_instance_id, method, path, status, outcome, duration_ms, reason, observed_at
          FROM host_fleet_gateway_observation
          WHERE host_id = ? AND host_instance_id = ?
          ORDER BY observed_at DESC LIMIT ?
        `).all(host.host_id, host.host_instance_id, limit)
      : this.db.prepare(`
          SELECT request_id, host_id, host_instance_id, method, path, status, outcome, duration_ms, reason, observed_at
          FROM host_fleet_gateway_observation
          ORDER BY observed_at DESC LIMIT ?
        `).all(limit);
    return (rows as Array<Record<string, unknown>>).map((row) => ({
      schema: 'narada.host_fleet.gateway_request_observation.v1' as const,
      request_id: String(row.request_id),
      host: validateHostKey({ host_id: row.host_id, host_instance_id: row.host_instance_id }),
      method: String(row.method),
      path: String(row.path),
      status: row.status == null ? null : Number(row.status),
      outcome: String(row.outcome) as HostFleetGatewayObservation['outcome'],
      duration_ms: Number(row.duration_ms),
      reason: row.reason == null ? null : String(row.reason),
      observed_at: String(row.observed_at),
    }));
  }

  registerHost(input: HostRecordInput, options: HostFleetRegistryOptions = {}): HostFleetRegistryResult {
    return this.db.transaction(() => this.registerHostInTransaction(input, options))();
  }

  private registerHostInTransaction(input: HostRecordInput, options: HostFleetRegistryOptions = {}): HostFleetRegistryResult {
    const now = options.now ?? new Date();
    const candidate = createHostRecord(input, now);
      const exact = this.getHost(candidate);
      const sibling = this.listHosts({ includeRetired: true }).find((record) =>
        record.host_id === candidate.host_id && !hostKeysEqual(record, candidate) && activeLifecycle(record.lifecycle_state));

      if (sibling && options.allow_reenrollment !== true) {
        this.writeAudit({
          operation: 'register',
          status: 'refused',
          host: candidate,
          revision: null,
          requestId: options.request_id ?? null,
          actor: options.actor ?? null,
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
          requestId: options.request_id ?? null,
          actor: options.actor ?? null,
          reason: 'replaced_by_explicit_reenrollment',
          recordedAt: now,
        });
      }

      if (!exact) {
        this.writeHost(candidate);
        this.recordCredentialHistory(candidate, options.request_id ?? null, now);
        this.writeAudit({
          operation: 'register',
          status: 'applied',
          host: candidate,
          revision: candidate.revision,
          requestId: options.request_id ?? null,
          actor: options.actor ?? null,
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
          requestId: options.request_id ?? null,
          actor: options.actor ?? null,
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
          requestId: options.request_id ?? null,
          actor: options.actor ?? null,
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
      this.recordCredentialHistory(updated, options.request_id ?? null, now);
      this.writeAudit({
        operation: 'register',
        status: 'applied',
        host: updated,
        revision: updated.revision,
        requestId: options.request_id ?? null,
        actor: options.actor ?? null,
        reason: null,
        recordedAt: now,
      });
      return { status: 'updated', mutation_performed: true, host: updated, reason: null } satisfies HostFleetRegistryResult;
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

  applyLifecycleIntent(value: unknown, options: HostFleetMutationOptions = {}): HostFleetLifecycleResult {
    let intent: HostFleetLifecycleIntent;
    try {
      intent = validateHostFleetLifecycleIntent(value);
    } catch (error) {
      return {
        schema: HOST_FLEET_LIFECYCLE_RESULT_SCHEMA,
        status: 'refused',
        mutation_performed: false,
        request_id: '',
        operation: null,
        host: null,
        lifecycle_state: null,
        revision: null,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
    const actor = actorName(options.actor);
    return this.db.transaction(() => {
      const hash = intentHash(intent);
      const prior = this.readIntentResult(intent.request_id);
      if (prior) {
        if (prior.intent_hash !== hash) {
          return this.lifecycleResult(intent, 'refused', false, null, null, 'intent_request_id_conflict');
        }
        const replayed = this.parseStoredResult<HostFleetLifecycleResult>(prior.result_json);
        return { ...replayed, status: 'replayed' as const, mutation_performed: false };
      }
      const current = this.getHost(intent.host);
      const preflight = preflightHostFleetLifecycleIntent(intent, current);
      if (preflight.status !== 'ready' || !preflight.intent) {
        const result = this.lifecycleResult(
          intent,
          'refused',
          false,
          current,
          current?.lifecycle_state ?? null,
          preflight.refusals.join(',') || 'host_lifecycle_intent_refused',
        );
        this.storeIntentResult(intent.request_id, hash, result);
        this.writeAudit({
          operation: intent.operation,
          status: 'refused',
          host: current ?? intent.host,
          revision: current?.revision ?? null,
          requestId: intent.request_id,
          actor,
          reason: result.reason,
          recordedAt: new Date(),
        });
        return result;
      }
      const registryResult = this.transitionHostInTransaction(
        intent.host,
        intent.operation === 'revoke' ? 'revoked' : 'retired',
        'revoked',
        intent.reason ?? (intent.operation === 'revoke' ? 'operator_revoked' : 'operator_retired'),
        { actor, requestId: intent.request_id },
      );
      const status: HostFleetLifecycleResult['status'] = registryResult.mutation_performed
        ? 'applied'
        : registryResult.status === 'refused' ? 'refused' : 'unchanged';
      const result = this.lifecycleResult(
        intent,
        status,
        registryResult.mutation_performed,
        registryResult.host,
        registryResult.host?.lifecycle_state ?? null,
        registryResult.reason,
      );
      this.storeIntentResult(intent.request_id, hash, result);
      return result;
    })();
  }

  applyEnrollmentIntent(value: unknown, options: HostFleetMutationOptions = {}): HostFleetEnrollmentResult {
    let intent: HostFleetEnrollmentIntent;
    try {
      intent = validateHostFleetEnrollmentIntent(value);
    } catch (error) {
      return {
        schema: HOST_FLEET_ENROLLMENT_RESULT_SCHEMA,
        status: 'refused',
        mutation_performed: false,
        request_id: '',
        host: null,
        lifecycle_state: null,
        revision: null,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
    const actor = actorName(options.actor);
    return this.db.transaction(() => {
      const hash = intentHash(intent);
      const prior = this.readIntentResult(intent.request_id);
      if (prior) {
        if (prior.intent_hash !== hash) {
          return this.enrollmentResult(intent, 'refused', false, null, null, null, 'intent_request_id_conflict');
        }
        const replayed = this.parseStoredResult<HostFleetEnrollmentResult>(prior.result_json);
        return { ...replayed, status: 'replayed' as const, mutation_performed: false };
      }
      const current = this.getHost(intent.host);
      const preflight = preflightHostFleetEnrollmentIntent(intent, current);
      if (preflight.status !== 'ready' || !preflight.intent) {
        const result = this.enrollmentResult(
          intent,
          'refused',
          false,
          current,
          current?.lifecycle_state ?? null,
          current?.revision ?? null,
          preflight.refusals.join(',') || 'host_enrollment_intent_refused',
        );
        this.storeIntentResult(intent.request_id, hash, result);
        this.writeAudit({
          operation: 'register',
          status: 'refused',
          host: current ?? intent.host,
          revision: current?.revision ?? null,
          requestId: intent.request_id,
          actor,
          reason: result.reason,
          recordedAt: new Date(),
        });
        return result;
      }
      const registryResult = this.registerHostInTransaction(intent.host, {
        allow_reenrollment: intent.allow_reenrollment,
        actor,
        request_id: intent.request_id,
      });
      const status: HostFleetEnrollmentResult['status'] = registryResult.mutation_performed
        ? 'applied'
        : registryResult.status === 'refused' ? 'refused' : 'unchanged';
      const result = this.enrollmentResult(
        intent,
        status,
        registryResult.mutation_performed,
        registryResult.host,
        registryResult.host?.lifecycle_state ?? null,
        registryResult.host?.revision ?? null,
        registryResult.reason,
      );
      this.storeIntentResult(intent.request_id, hash, result);
      return result;
    })();
  }

  applyCredentialRotationIntent(value: unknown, options: HostFleetMutationOptions = {}): HostFleetCredentialRotationResult {
    let intent: HostFleetCredentialRotationIntent;
    try {
      intent = validateHostFleetCredentialRotationIntent(value);
    } catch (error) {
      return {
        schema: HOST_FLEET_CREDENTIAL_ROTATION_RESULT_SCHEMA,
        status: 'refused',
        mutation_performed: false,
        request_id: '',
        host: null,
        revision: null,
        credential_class: null,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
    const actor = actorName(options.actor);
    return this.db.transaction(() => {
      const hash = intentHash(intent);
      const prior = this.readIntentResult(intent.request_id);
      if (prior) {
        if (prior.intent_hash !== hash) return this.credentialRotationResult(intent, 'refused', false, null, null, 'intent_request_id_conflict');
        const replayed = this.parseStoredResult<HostFleetCredentialRotationResult>(prior.result_json);
        return { ...replayed, status: 'replayed' as const, mutation_performed: false };
      }
      const current = this.getHost(intent.host);
      const preflight = preflightHostFleetCredentialRotationIntent(intent, current);
      if (preflight.status !== 'ready' || !preflight.intent) {
        const result = this.credentialRotationResult(
          intent,
          'refused',
          false,
          current,
          current?.revision ?? null,
          preflight.refusals.join(',') || 'host_credential_rotation_refused',
        );
        this.storeIntentResult(intent.request_id, hash, result);
        this.writeAudit({
          operation: 'credential_rotate',
          status: 'refused',
          host: current ?? intent.host,
          revision: current?.revision ?? null,
          requestId: intent.request_id,
          actor,
          reason: result.reason,
          recordedAt: new Date(),
        });
        return result;
      }
      if (!current) {
        const result = this.credentialRotationResult(intent, 'refused', false, null, null, 'host_not_registered');
        this.storeIntentResult(intent.request_id, hash, result);
        return result;
      }
      if (current.credential_ref === intent.credential_ref
        && JSON.stringify(current.gateway.credential) === JSON.stringify(intent.credential)) {
        const result = this.credentialRotationResult(intent, 'unchanged', false, current, current.revision, null);
        this.storeIntentResult(intent.request_id, hash, result);
        this.writeAudit({
          operation: 'credential_rotate',
          status: 'unchanged',
          host: current,
          revision: current.revision,
          requestId: intent.request_id,
          actor,
          reason: null,
          recordedAt: new Date(),
        });
        return result;
      }
      const now = new Date();
      const updated = withRevision({
        ...current,
        credential_ref: intent.credential_ref,
        gateway: { ...current.gateway, credential: intent.credential },
      }, current.revision + 1, now);
      this.writeHost(updated);
      this.recordCredentialHistory(updated, intent.request_id, now);
      this.writeAudit({
        operation: 'credential_rotate',
        status: 'applied',
        host: updated,
        revision: updated.revision,
        requestId: intent.request_id,
        actor,
        reason: null,
        recordedAt: now,
      });
      const result = this.credentialRotationResult(intent, 'applied', true, updated, updated.revision, null);
      this.storeIntentResult(intent.request_id, hash, result);
      return result;
    })();
  }

  listCredentialHistory(key: HostKey): HostFleetCredentialHistoryEntry[] {
    const host = validateHostKey(key);
    const rows = this.db.prepare(`
      SELECT host_id, host_instance_id, revision, credential_ref, credential_json, request_id, recorded_at
      FROM host_fleet_credential_history
      WHERE host_id = ? AND host_instance_id = ?
      ORDER BY revision DESC
    `).all(host.host_id, host.host_instance_id) as Array<Record<string, unknown>>;
    return rows.map((row) => {
      let credential: unknown;
      try { credential = JSON.parse(String(row.credential_json)); } catch { throw new Error('host_credential_history_corrupt'); }
      return {
        schema: 'narada.host_fleet.credential_history.v1' as const,
        host: validateHostKey({ host_id: row.host_id, host_instance_id: row.host_instance_id }),
        revision: Number(row.revision),
        credential_ref: String(row.credential_ref),
        credential: credential as HostRecord['gateway']['credential'],
        request_id: row.request_id == null ? null : String(row.request_id),
        recorded_at: String(row.recorded_at),
      };
    });
  }

  applyCredentialRollbackIntent(value: unknown, options: HostFleetMutationOptions = {}): HostFleetCredentialRollbackResult {
    let intent: HostFleetCredentialRollbackIntent;
    try {
      intent = validateHostFleetCredentialRollbackIntent(value);
    } catch (error) {
      return {
        schema: HOST_FLEET_CREDENTIAL_ROLLBACK_RESULT_SCHEMA,
        status: 'refused',
        mutation_performed: false,
        request_id: '',
        host: null,
        revision: null,
        restored_from_revision: null,
        credential_class: null,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
    const actor = actorName(options.actor);
    return this.db.transaction(() => {
      const hash = intentHash(intent);
      const prior = this.readIntentResult(intent.request_id);
      if (prior) {
        if (prior.intent_hash !== hash) return this.credentialRollbackResult(intent, 'refused', false, null, null, null, 'intent_request_id_conflict');
        const replayed = this.parseStoredResult<HostFleetCredentialRollbackResult>(prior.result_json);
        return { ...replayed, status: 'replayed' as const, mutation_performed: false };
      }
      const current = this.getHost(intent.host);
      const history = this.listCredentialHistory(intent.host);
      const preflight = preflightHostFleetCredentialRollbackIntent(intent, current, history.map((entry) => entry.revision));
      const target = history.find((entry) => entry.revision === intent.rollback_to_revision) ?? null;
      if (preflight.status !== 'ready' || !current || !target) {
        const result = this.credentialRollbackResult(
          intent,
          'refused',
          false,
          current,
          null,
          target?.revision ?? null,
          preflight.refusals.join(',') || 'host_credential_rollback_refused',
        );
        this.storeIntentResult(intent.request_id, hash, result);
        this.writeAudit({
          operation: 'credential_rollback',
          status: 'refused',
          host: current ?? intent.host,
          revision: current?.revision ?? null,
          requestId: intent.request_id,
          actor,
          reason: result.reason,
          recordedAt: new Date(),
        });
        return result;
      }
      const now = new Date();
      const updated = withRevision({
        ...current,
        credential_ref: target.credential_ref,
        gateway: { ...current.gateway, credential: target.credential },
      }, current.revision + 1, now);
      this.writeHost(updated);
      this.recordCredentialHistory(updated, intent.request_id, now);
      this.writeAudit({
        operation: 'credential_rollback',
        status: 'applied',
        host: updated,
        revision: updated.revision,
        requestId: intent.request_id,
        actor,
        reason: `restored_credential_revision_${target.revision}`,
        recordedAt: now,
      });
      const result = this.credentialRollbackResult(intent, 'applied', true, updated, updated.revision, target.revision, null);
      this.storeIntentResult(intent.request_id, hash, result);
      return result;
    })();
  }

  /** Return a durable launch result before contacting the Host Gateway. */
  getLaunchIntentResult(value: unknown): HostFleetLaunchResult | null {
    let intent: HostFleetLaunchIntent;
    try { intent = validateHostFleetLaunchIntent(value); } catch { return null; }
    const prior = this.readIntentResult(intent.request_id);
    if (!prior) return null;
    if (prior.intent_hash !== intentHash(intent)) return this.launchResult(intent, 'refused', false, null, 'intent_request_id_conflict');
    const replayed = this.parseStoredResult<HostFleetLaunchResult>(prior.result_json);
    return { ...replayed, status: 'replayed', mutation_performed: false };
  }

  /** Persist the Host Gateway result and make it part of the User Site audit. */
  recordLaunchIntentResult(value: unknown, result: HostFleetLaunchResult, options: HostFleetMutationOptions = {}): HostFleetLaunchResult {
    const intent = validateHostFleetLaunchIntent(value);
    const actor = actorName(options.actor);
    return this.db.transaction(() => {
      const hash = intentHash(intent);
      const prior = this.readIntentResult(intent.request_id);
      if (prior) {
        if (prior.intent_hash !== hash) return this.launchResult(intent, 'refused', false, null, 'intent_request_id_conflict');
        const replayed = this.parseStoredResult<HostFleetLaunchResult>(prior.result_json);
        return { ...replayed, status: 'replayed' as const, mutation_performed: false };
      }
      const current = this.getHost(intent.host);
      const preflight = preflightHostFleetLaunchIntent(intent, current);
      if (preflight.status !== 'ready' || !preflight.intent || !current) {
        const refused = this.launchResult(intent, 'refused', false, null, preflight.refusals.join(',') || 'host_launch_refused');
        this.storeIntentResult(intent.request_id, hash, refused);
        this.writeAudit({
          operation: 'launch',
          status: 'refused',
          host: current ?? intent.host,
          revision: current?.revision ?? null,
          requestId: intent.request_id,
          actor,
          reason: refused.reason,
          recordedAt: new Date(),
        });
        return refused;
      }
      const normalized: HostFleetLaunchResult = {
        schema: HOST_FLEET_LAUNCH_RESULT_SCHEMA,
        status: result.status,
        mutation_performed: result.mutation_performed,
        request_id: intent.request_id,
        host: result.host ?? intent.host,
        site_id: result.site_id ?? intent.site_id,
        agent_id: result.agent_id ?? intent.agent_id,
        operator_surface: result.operator_surface ?? intent.operator_surface,
        session_id: result.session_id ?? null,
        reason: result.reason ?? null,
      };
      this.storeIntentResult(intent.request_id, hash, normalized);
      this.writeAudit({
        operation: 'launch',
        status: normalized.status === 'refused' ? 'refused' : normalized.status === 'reused' ? 'unchanged' : 'applied',
        host: current,
        revision: current.revision,
        requestId: intent.request_id,
        actor,
        reason: normalized.reason,
        recordedAt: new Date(),
      });
      return normalized;
    })();
  }

  revokeHost(key: HostKey, reason = 'operator_revoked'): HostFleetRegistryResult {
    return this.transitionHost(key, 'revoked', 'revoked', reason);
  }

  retireHost(key: HostKey, reason = 'operator_retired'): HostFleetRegistryResult {
    return this.transitionHost(key, 'retired', 'revoked', reason);
  }

  private transitionHost(key: HostKey, lifecycleState: 'revoked' | 'retired', healthStatus: HostHealthStatus, reason: string): HostFleetRegistryResult {
    return this.db.transaction(() => this.transitionHostInTransaction(key, lifecycleState, healthStatus, reason))();
  }

  private transitionHostInTransaction(
    key: HostKey,
    lifecycleState: 'revoked' | 'retired',
    healthStatus: HostHealthStatus,
    reason: string,
    correlation: { actor?: string; requestId?: string } = {},
  ): HostFleetRegistryResult {
    const existing = this.getHost(key);
    const normalized = validateHostKey(key);
    const operation = lifecycleState === 'revoked' ? 'revoke' : 'retire';
    if (!existing) {
      this.writeAudit({ operation, status: 'refused', host: normalized, revision: null, requestId: correlation.requestId ?? null, actor: correlation.actor ?? null, reason: 'host_not_registered', recordedAt: new Date() });
      return { status: 'refused', mutation_performed: false, host: null, reason: 'host_not_registered' };
    }
    if (existing.lifecycle_state === lifecycleState) {
      this.writeAudit({ operation, status: 'unchanged', host: existing, revision: existing.revision, requestId: correlation.requestId ?? null, actor: correlation.actor ?? null, reason: null, recordedAt: new Date() });
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
    this.writeAudit({ operation, status: 'applied', host: updated, revision: updated.revision, requestId: correlation.requestId ?? null, actor: correlation.actor ?? null, reason, recordedAt: now });
    return { status: lifecycleState, mutation_performed: true, host: updated, reason: null };
  }

  private readIntentResult(requestId: string): IntentResultRow | null {
    const row = this.db.prepare(
      'SELECT request_id, intent_hash, result_json FROM host_fleet_intent_result WHERE request_id = ?',
    ).get(requestId) as IntentResultRow | undefined;
    return row ?? null;
  }

  private parseStoredResult<T>(value: string): T {
    try {
      return JSON.parse(value) as T;
    } catch {
      throw new Error('host_fleet_intent_result_corrupt');
    }
  }

  private storeIntentResult(requestId: string, hash: string, result: unknown): void {
    this.db.prepare(`
      INSERT INTO host_fleet_intent_result (request_id, intent_hash, result_json, recorded_at)
      VALUES (?, ?, ?, ?)
    `).run(requestId, hash, JSON.stringify(result), new Date().toISOString());
  }

  private lifecycleResult(
    intent: HostFleetLifecycleIntent,
    status: HostFleetLifecycleResult['status'],
    mutationPerformed: boolean,
    host: HostRecord | null,
    lifecycleState: HostFleetLifecycleResult['lifecycle_state'],
    reason: string | null,
  ): HostFleetLifecycleResult {
    return {
      schema: HOST_FLEET_LIFECYCLE_RESULT_SCHEMA,
      status,
      mutation_performed: mutationPerformed,
      request_id: intent.request_id,
      operation: intent.operation,
      host: host ? { host_id: host.host_id, host_instance_id: host.host_instance_id } : intent.host,
      lifecycle_state: lifecycleState,
      revision: host?.revision ?? null,
      reason,
    };
  }

  private enrollmentResult(
    intent: HostFleetEnrollmentIntent,
    status: HostFleetEnrollmentResult['status'],
    mutationPerformed: boolean,
    host: HostRecord | null,
    lifecycleState: HostFleetEnrollmentResult['lifecycle_state'],
    revision: number | null,
    reason: string | null,
  ): HostFleetEnrollmentResult {
    return {
      schema: HOST_FLEET_ENROLLMENT_RESULT_SCHEMA,
      status,
      mutation_performed: mutationPerformed,
      request_id: intent.request_id,
      host: host ? { host_id: host.host_id, host_instance_id: host.host_instance_id } : {
        host_id: intent.host.host_id,
        host_instance_id: intent.host.host_instance_id,
      },
      lifecycle_state: lifecycleState,
      revision: host?.revision ?? revision,
      reason,
    };
  }

  private credentialRotationResult(
    intent: HostFleetCredentialRotationIntent,
    status: HostFleetCredentialRotationResult['status'],
    mutationPerformed: boolean,
    host: HostRecord | null,
    revision: number | null,
    reason: string | null,
  ): HostFleetCredentialRotationResult {
    return {
      schema: HOST_FLEET_CREDENTIAL_ROTATION_RESULT_SCHEMA,
      status,
      mutation_performed: mutationPerformed,
      request_id: intent.request_id,
      host: host ? { host_id: host.host_id, host_instance_id: host.host_instance_id } : intent.host,
      revision: host?.revision ?? revision,
      credential_class: intent.credential.class,
      reason,
    };
  }

  private credentialRollbackResult(
    intent: HostFleetCredentialRollbackIntent,
    status: HostFleetCredentialRollbackResult['status'],
    mutationPerformed: boolean,
    host: HostRecord | null,
    revision: number | null,
    restoredFromRevision: number | null,
    reason: string | null,
  ): HostFleetCredentialRollbackResult {
    return {
      schema: HOST_FLEET_CREDENTIAL_ROLLBACK_RESULT_SCHEMA,
      status,
      mutation_performed: mutationPerformed,
      request_id: intent.request_id,
      host: host ? { host_id: host.host_id, host_instance_id: host.host_instance_id } : intent.host,
      revision: host?.revision ?? revision,
      restored_from_revision: restoredFromRevision,
      credential_class: host?.gateway.credential.class ?? null,
      reason,
    };
  }

  private launchResult(
    intent: HostFleetLaunchIntent,
    status: HostFleetLaunchResult['status'],
    mutationPerformed: boolean,
    sessionId: string | null,
    reason: string | null,
    host: HostKey | null = intent.host,
  ): HostFleetLaunchResult {
    return {
      schema: HOST_FLEET_LAUNCH_RESULT_SCHEMA,
      status,
      mutation_performed: mutationPerformed,
      request_id: intent.request_id,
      host,
      site_id: intent.site_id,
      agent_id: intent.agent_id,
      operator_surface: intent.operator_surface,
      session_id: sessionId,
      reason,
    };
  }

  private writeAudit(input: {
    operation: HostFleetAuditEntry['operation'];
    status: HostFleetAuditEntry['status'];
    host: HostKey;
    revision: number | null;
    requestId?: string | null;
    actor?: string | null;
    reason: string | null;
    recordedAt: Date;
  }): void {
    const host = validateHostKey(input.host);
    this.db.prepare(`
      INSERT INTO host_fleet_audit
        (audit_id, operation, status, host_id, host_instance_id, revision, request_id, actor, reason, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      input.operation,
      input.status,
      host.host_id,
      host.host_instance_id,
      input.revision,
      input.requestId ?? null,
      input.actor ?? null,
      input.reason,
      input.recordedAt.toISOString(),
    );
  }

  private recordCredentialHistory(host: HostRecord, requestId: string | null, recordedAt: Date): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO host_fleet_credential_history
        (host_id, host_instance_id, revision, credential_ref, credential_json, request_id, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      host.host_id,
      host.host_instance_id,
      host.revision,
      host.credential_ref,
      JSON.stringify(host.gateway.credential),
      requestId,
      recordedAt.toISOString(),
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
