import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const originalEmitWarning = process.emitWarning;
process.emitWarning = (warning, ...args) => {
  if (args[0] === 'ExperimentalWarning' && String(warning).includes('SQLite')) return;
  return originalEmitWarning.call(process, warning, ...args);
};
const { DatabaseSync } = await import('node:sqlite');
process.emitWarning = originalEmitWarning;

export const SESSION_AUTHORITY_SCHEMA = 'narada.nars.session_authority.v1';
export const SESSION_AUTHORITY_PRINCIPAL_SCHEMA = 'narada.nars.session_principal.v1';
export const SESSION_AUTHORITY_STATES = Object.freeze({
  STARTING: 'starting',
  ACTIVE: 'active',
  STOPPING: 'stopping',
  FAILED: 'failed',
  CLOSED: 'closed',
});
export const SESSION_AUTHORITY_REFUSAL_CODES = Object.freeze({
  ALREADY_ACTIVE: 'session_authority_already_active',
  STARTING: 'session_authority_starting',
  STOPPING: 'session_authority_stopping',
  RECONCILIATION_REQUIRED: 'session_authority_reconciliation_required',
  FENCED: 'session_authority_fenced',
  TOKEN_REQUIRED: 'session_authority_token_required',
  PROCESS_ALIVE: 'session_authority_process_alive',
  KEEP_SESSION_REQUIRED: 'session_authority_keep_session_required',
  KEEP_SESSION_NOT_FOUND: 'session_authority_keep_session_not_found',
  LEGACY_DUPLICATE: 'session_authority_legacy_duplicate',
});

export class SessionAuthorityError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'SessionAuthorityError';
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

function requiredString(value, name) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${name}_required`);
  return normalized;
}

function canonicalSiteId(value) {
  return requiredString(value, 'site_id').replace(/^site:/i, '');
}

function canonicalLocalAgentId(value, siteId) {
  const normalized = requiredString(value, 'local_agent_id');
  const sitePrefix = `${siteId}.`;
  return normalized.startsWith(sitePrefix) ? normalized.slice(sitePrefix.length) : normalized;
}

function isoNow(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError('valid_now_required');
  return date.toISOString();
}

function json(value) {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

function parseJson(value, fallback = null) {
  if (typeof value !== 'string' || value.length === 0) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function principalKey({ authorityScope, siteId, localAgentId }) {
  return `${authorityScope}:${siteId}:${localAgentId}`;
}

export function normalizeSessionPrincipal({
  siteId,
  localAgentId,
  identityRef = null,
  authorityScope = 'local',
} = {}) {
  const scope = requiredString(authorityScope, 'authority_scope');
  const site = canonicalSiteId(siteId);
  const local = canonicalLocalAgentId(localAgentId, site);
  return {
    schema: SESSION_AUTHORITY_PRINCIPAL_SCHEMA,
    authority_scope: scope,
    site_id: site,
    local_agent_id: local,
    principal_key: principalKey({ authorityScope: scope, siteId: site, localAgentId: local }),
    identity_ref: identityRef ?? null,
  };
}

export function defaultSessionAuthorityDbPath(siteRoot) {
  return join(requiredString(siteRoot, 'site_root'), '.ai', 'runtime', 'session-authority.sqlite');
}

function defaultProcessProbe(pid) {
  const value = Number(pid);
  if (!Number.isInteger(value) || value <= 0) return false;
  try {
    process.kill(value, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function rowToRecord(row) {
  if (!row) return null;
  return {
    schema: SESSION_AUTHORITY_SCHEMA,
    principal_key: row.principal_key,
    authority_scope: row.authority_scope,
    site_id: row.site_id,
    local_agent_id: row.local_agent_id,
    state: row.state,
    session_id: row.session_id,
    launch_session_id: row.launch_session_id,
    runtime_kind: row.runtime_kind,
    operator_surface_kind: row.operator_surface_kind,
    authority_host: row.authority_host,
    authority_epoch: Number(row.authority_epoch),
    pid: row.pid === null || row.pid === undefined ? null : Number(row.pid),
    started_at: row.started_at,
    activated_at: row.activated_at,
    last_heartbeat_at: row.last_heartbeat_at,
    lease_expires_at: row.lease_expires_at,
    closed_at: row.closed_at,
    terminal_reason: row.terminal_reason,
    attach: parseJson(row.attach_json, null),
    evidence: parseJson(row.evidence_json, {}),
    owner_token: row.owner_token,
    updated_at: row.updated_at,
  };
}

function publicRecord(record) {
  if (!record) return null;
  const { owner_token: _ownerToken, ...safe } = record;
  return safe;
}

function withImmediate(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}

function writeEvent(db, {
  principalKey: key,
  event,
  sessionId = null,
  state = null,
  at,
  details = {},
}) {
  db.prepare(`
    INSERT INTO session_authority_events
      (principal_key, event, session_id, state, occurred_at, details_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(key, event, sessionId, state, at, json(details));
}

function leaseExpired(record, nowMs) {
  const expiry = record?.lease_expires_at ? Date.parse(record.lease_expires_at) : Number.NaN;
  return Number.isFinite(expiry) && expiry <= nowMs;
}

function activeState(state) {
  return state === SESSION_AUTHORITY_STATES.STARTING
    || state === SESSION_AUTHORITY_STATES.ACTIVE
    || state === SESSION_AUTHORITY_STATES.STOPPING;
}

function attachHandoff({ sessionId, principal, siteRoot = null, operatorSurfaceKind = 'agent-cli' }) {
  const siteArg = siteRoot ? ` --site-root "${siteRoot}"` : '';
  return {
    session_id: sessionId,
    principal_key: principal.principal_key,
    command: `narada nars attach-command --session ${sessionId} --agent ${principal.local_agent_id} --surface ${operatorSurfaceKind}${siteArg}`,
    web_ui_command: `narada agent-web-ui attach --session ${sessionId}${siteArg}`,
  };
}

function conflictError(record, principal, siteRoot, operatorSurfaceKind) {
  const code = record.state === SESSION_AUTHORITY_STATES.STARTING
    ? SESSION_AUTHORITY_REFUSAL_CODES.STARTING
    : record.state === SESSION_AUTHORITY_STATES.STOPPING
      ? SESSION_AUTHORITY_REFUSAL_CODES.STOPPING
      : SESSION_AUTHORITY_REFUSAL_CODES.ALREADY_ACTIVE;
  const handoff = attachHandoff({
    sessionId: record.session_id,
    principal,
    siteRoot,
    operatorSurfaceKind,
  });
  return new SessionAuthorityError(
    code,
    `The principal ${principal.principal_key} already has a ${record.state} NARS session.`,
    {
      schema: 'narada.nars.session_authority_refusal.v1',
      reason_code: code,
      principal,
      session_id: record.session_id,
      authority_epoch: record.authority_epoch,
      state: record.state,
      attach: handoff,
      required_next_step: 'Attach to the existing session or reconcile it explicitly before starting another session.',
    },
  );
}

function prepareSchema(db) {
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_authority (
      principal_key TEXT PRIMARY KEY,
      authority_scope TEXT NOT NULL,
      site_id TEXT NOT NULL,
      local_agent_id TEXT NOT NULL,
      state TEXT NOT NULL,
      session_id TEXT,
      launch_session_id TEXT,
      runtime_kind TEXT NOT NULL,
      operator_surface_kind TEXT NOT NULL,
      authority_host TEXT NOT NULL,
      authority_epoch INTEGER NOT NULL,
      owner_token TEXT NOT NULL,
      pid INTEGER,
      started_at TEXT NOT NULL,
      activated_at TEXT,
      last_heartbeat_at TEXT,
      lease_expires_at TEXT,
      closed_at TEXT,
      terminal_reason TEXT,
      attach_json TEXT,
      evidence_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS session_authority_session_idx
      ON session_authority(session_id);
    CREATE TABLE IF NOT EXISTS session_authority_events (
      event_id INTEGER PRIMARY KEY AUTOINCREMENT,
      principal_key TEXT NOT NULL,
      event TEXT NOT NULL,
      session_id TEXT,
      state TEXT,
      occurred_at TEXT NOT NULL,
      details_json TEXT
    );
    CREATE TABLE IF NOT EXISTS session_authority_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  db.prepare(`
    INSERT INTO session_authority_meta (key, value)
    VALUES ('schema', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(SESSION_AUTHORITY_SCHEMA);
}

export function openLocalSessionAuthority({
  dbPath,
  busyTimeoutMs = 5000,
} = {}) {
  const path = requiredString(dbPath, 'db_path');
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  const timeout = Number(busyTimeoutMs);
  if (Number.isFinite(timeout) && timeout >= 0) db.exec(`PRAGMA busy_timeout = ${Math.trunc(timeout)}`);
  prepareSchema(db);

  const getRow = (key) => db.prepare(
    'SELECT * FROM session_authority WHERE principal_key = ?',
  ).get(key);

  const inspectSession = ({ principal } = {}) => {
    const normalized = principal?.principal_key ? principal : normalizeSessionPrincipal(principal);
    return publicRecord(rowToRecord(getRow(normalized.principal_key)));
  };

  const admitSession = ({
    principal,
    sessionId,
    launchSessionId = null,
    runtimeKind = 'narada-agent-runtime-server',
    operatorSurfaceKind = 'agent-cli',
    authorityHost = 'local',
    siteRoot = null,
    leaseMs = 30000,
    now = new Date(),
    pid = null,
    evidence = {},
    replaceAbandoned = false,
    processProbe = defaultProcessProbe,
    recoveryReason = 'explicit_operator_recovery',
  } = {}) => {
    const normalized = principal?.principal_key ? principal : normalizeSessionPrincipal(principal);
    const session = requiredString(sessionId, 'session_id');
    const at = isoNow(now);
    const lease = Number(leaseMs);
    const leaseExpires = new Date(Date.parse(at) + (Number.isFinite(lease) && lease > 0 ? lease : 30000)).toISOString();
    return withImmediate(db, () => {
      let existing = rowToRecord(getRow(normalized.principal_key));
      if (existing && activeState(existing.state)) {
        const nowMs = Date.parse(at);
        const processAlive = existing.pid ? processProbe(existing.pid) : false;
        if (replaceAbandoned) {
          if (processAlive) {
            throw new SessionAuthorityError(
              SESSION_AUTHORITY_REFUSAL_CODES.PROCESS_ALIVE,
              `The session process ${existing.pid} is still alive; explicit recovery is refused.`,
              {
                principal: normalized,
                session_id: existing.session_id,
                pid: existing.pid,
                recovery_reason: recoveryReason,
                required_next_step: 'Stop the existing process or attach to it before retrying explicit recovery.',
              },
            );
          }
          const replacedAt = at;
          db.prepare(`
            UPDATE session_authority
               SET state = ?, terminal_reason = ?, closed_at = ?, updated_at = ?,
                   lease_expires_at = ?, last_heartbeat_at = ?
             WHERE principal_key = ?
          `).run(
            SESSION_AUTHORITY_STATES.FAILED,
            'explicit_abandoned_session_replaced',
            replacedAt,
            replacedAt,
            replacedAt,
            replacedAt,
            normalized.principal_key,
          );
          writeEvent(db, {
            principalKey: normalized.principal_key,
            event: 'session_replaced',
            sessionId: existing.session_id,
            state: SESSION_AUTHORITY_STATES.FAILED,
            at: replacedAt,
            details: {
              reason: recoveryReason,
              replacement_session_id: session,
              process_absent: true,
            },
          });
          existing = { ...existing, state: SESSION_AUTHORITY_STATES.FAILED };
        } else if (leaseExpired(existing, nowMs) && !processAlive) {
          const reclaimedAt = at;
          db.prepare(`
            UPDATE session_authority
               SET state = ?, terminal_reason = ?, closed_at = ?, updated_at = ?,
                   lease_expires_at = ?, last_heartbeat_at = ?
             WHERE principal_key = ?
          `).run(
            SESSION_AUTHORITY_STATES.FAILED,
            'abandoned_session_reclaimed_before_admission',
            reclaimedAt,
            reclaimedAt,
            reclaimedAt,
            reclaimedAt,
            normalized.principal_key,
          );
          writeEvent(db, {
            principalKey: normalized.principal_key,
            event: 'session_reclaimed',
            sessionId: existing.session_id,
            state: SESSION_AUTHORITY_STATES.FAILED,
            at: reclaimedAt,
            details: { reason: 'lease_expired_and_process_absent' },
          });
          existing = null;
        } else {
          throw conflictError(existing, normalized, siteRoot, operatorSurfaceKind);
        }
      }
      if (existing && ![SESSION_AUTHORITY_STATES.FAILED, SESSION_AUTHORITY_STATES.CLOSED].includes(existing.state)) {
        throw new SessionAuthorityError(
          SESSION_AUTHORITY_REFUSAL_CODES.RECONCILIATION_REQUIRED,
          `Session authority row for ${normalized.principal_key} is not startable: ${existing.state}.`,
          {
            schema: 'narada.nars.session_authority_refusal.v1',
            reason_code: SESSION_AUTHORITY_REFUSAL_CODES.RECONCILIATION_REQUIRED,
            principal: normalized,
            state: existing.state,
            session_id: existing.session_id,
            required_next_step: 'Run explicit NARS session reconciliation before retrying the launch.',
          },
        );
      }
      const epoch = existing ? Number(existing.authority_epoch) + 1 : 1;
      const ownerToken = randomUUID();
      const attach = attachHandoff({ sessionId: session, principal: normalized, siteRoot, operatorSurfaceKind });
      const values = [
        normalized.principal_key,
        normalized.authority_scope,
        normalized.site_id,
        normalized.local_agent_id,
        SESSION_AUTHORITY_STATES.STARTING,
        session,
        launchSessionId,
        runtimeKind,
        operatorSurfaceKind,
        authorityHost,
        epoch,
        ownerToken,
        pid,
        at,
        null,
        at,
        leaseExpires,
        null,
        null,
        json(attach),
        json(evidence) ?? '{}',
        at,
      ];
      db.prepare(`
        INSERT INTO session_authority (
          principal_key, authority_scope, site_id, local_agent_id, state,
          session_id, launch_session_id, runtime_kind, operator_surface_kind,
          authority_host, authority_epoch, owner_token, pid, started_at,
          activated_at, last_heartbeat_at, lease_expires_at, closed_at,
          terminal_reason, attach_json, evidence_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(principal_key) DO UPDATE SET
          authority_scope = excluded.authority_scope,
          site_id = excluded.site_id,
          local_agent_id = excluded.local_agent_id,
          state = excluded.state,
          session_id = excluded.session_id,
          launch_session_id = excluded.launch_session_id,
          runtime_kind = excluded.runtime_kind,
          operator_surface_kind = excluded.operator_surface_kind,
          authority_host = excluded.authority_host,
          authority_epoch = excluded.authority_epoch,
          owner_token = excluded.owner_token,
          pid = excluded.pid,
          started_at = excluded.started_at,
          activated_at = excluded.activated_at,
          last_heartbeat_at = excluded.last_heartbeat_at,
          lease_expires_at = excluded.lease_expires_at,
          closed_at = excluded.closed_at,
          terminal_reason = excluded.terminal_reason,
          attach_json = excluded.attach_json,
          evidence_json = excluded.evidence_json,
          updated_at = excluded.updated_at
      `).run(...values);
      writeEvent(db, {
        principalKey: normalized.principal_key,
        event: 'session_admitted',
        sessionId: session,
        state: SESSION_AUTHORITY_STATES.STARTING,
        at,
        details: { authority_epoch: epoch, runtime_kind: runtimeKind, operator_surface_kind: operatorSurfaceKind },
      });
      return {
        schema: SESSION_AUTHORITY_SCHEMA,
        status: 'admitted',
        principal: normalized,
        session_id: session,
        launch_session_id: launchSessionId,
        authority_epoch: epoch,
        owner_token: ownerToken,
        db_path: path,
        lease_expires_at: leaseExpires,
        attach,
      };
    });
  };

  const assertOwner = ({ principal, sessionId, ownerToken, authorityEpoch } = {}) => {
    const normalized = principal?.principal_key ? principal : normalizeSessionPrincipal(principal);
    const session = requiredString(sessionId, 'session_id');
    const token = requiredString(ownerToken, 'owner_token');
    const record = rowToRecord(getRow(normalized.principal_key));
    if (!record || record.session_id !== session
      || record.owner_token !== token
      || (authorityEpoch !== undefined && Number(record.authority_epoch) !== Number(authorityEpoch))) {
      throw new SessionAuthorityError(
        SESSION_AUTHORITY_REFUSAL_CODES.FENCED,
        `Session authority ownership was fenced for ${normalized.principal_key}.`,
        {
          schema: 'narada.nars.session_authority_refusal.v1',
          reason_code: SESSION_AUTHORITY_REFUSAL_CODES.FENCED,
          principal: normalized,
          session_id: session,
          authority_epoch: authorityEpoch ?? null,
          current: publicRecord(record),
          required_next_step: 'Stop the runtime and attach to the current authority session.',
        },
      );
    }
    return { normalized, record };
  };

  const updateOwned = ({
    principal,
    sessionId,
    ownerToken,
    authorityEpoch,
    state,
    now = new Date(),
    pid = undefined,
    terminalReason = undefined,
    evidence = undefined,
  } = {}) => {
    const { normalized, record } = assertOwner({ principal, sessionId, ownerToken, authorityEpoch });
    const at = isoNow(now);
    const nextLease = new Date(Date.parse(at) + 30000).toISOString();
    const nextPid = pid === undefined ? record.pid : pid;
    const nextEvidence = evidence === undefined ? record.evidence : { ...record.evidence, ...evidence };
    const closed = state === SESSION_AUTHORITY_STATES.CLOSED || state === SESSION_AUTHORITY_STATES.FAILED;
    return withImmediate(db, () => {
      const current = rowToRecord(getRow(normalized.principal_key));
      if (!current || current.owner_token !== ownerToken || Number(current.authority_epoch) !== Number(authorityEpoch)) {
        throw new SessionAuthorityError(
          SESSION_AUTHORITY_REFUSAL_CODES.FENCED,
          `Session authority ownership was fenced for ${normalized.principal_key}.`,
          { principal: normalized, session_id: session, current: publicRecord(current) },
        );
      }
      db.prepare(`
        UPDATE session_authority
           SET state = ?,
               pid = ?,
               activated_at = CASE WHEN ? = 'active' AND activated_at IS NULL THEN ? ELSE activated_at END,
               last_heartbeat_at = ?,
               lease_expires_at = ?,
               closed_at = CASE WHEN ? IN ('closed', 'failed') THEN ? ELSE closed_at END,
               terminal_reason = CASE WHEN ? IN ('closed', 'failed') THEN ? ELSE terminal_reason END,
               evidence_json = ?,
               updated_at = ?
         WHERE principal_key = ?
      `).run(
        state,
        nextPid,
        state,
        at,
        at,
        nextLease,
        state,
        closed ? at : record.closed_at,
        state,
        closed ? (terminalReason ?? null) : record.terminal_reason,
        json(nextEvidence) ?? '{}',
        at,
        normalized.principal_key,
      );
      writeEvent(db, {
        principalKey: normalized.principal_key,
        event: `session_${state}`,
        sessionId: sessionId,
        state,
        at,
        details: { terminal_reason: terminalReason ?? null },
      });
      return publicRecord(rowToRecord(getRow(normalized.principal_key)));
    });
  };

  const activateSession = (options = {}) => updateOwned({
    ...options,
    state: SESSION_AUTHORITY_STATES.ACTIVE,
  });
  const heartbeatSession = (options = {}) => updateOwned({
    ...options,
    state: options.state ?? SESSION_AUTHORITY_STATES.ACTIVE,
  });
  const closeSession = (options = {}) => updateOwned({
    ...options,
    state: SESSION_AUTHORITY_STATES.CLOSED,
  });
  const failSession = (options = {}) => updateOwned({
    ...options,
    state: SESSION_AUTHORITY_STATES.FAILED,
  });

  const reclaimSession = ({
    principal,
    now = new Date(),
    processProbe = defaultProcessProbe,
  } = {}) => {
    const normalized = principal?.principal_key ? principal : normalizeSessionPrincipal(principal);
    const at = isoNow(now);
    return withImmediate(db, () => {
      const record = rowToRecord(getRow(normalized.principal_key));
      if (!record || !activeState(record.state)) return { status: 'not_reclaimable', record: publicRecord(record) };
      if (!leaseExpired(record, Date.parse(at))) return { status: 'lease_fresh', record: publicRecord(record) };
      if (record.pid && processProbe(record.pid)) {
        throw new SessionAuthorityError(
          SESSION_AUTHORITY_REFUSAL_CODES.PROCESS_ALIVE,
          `The expired session process ${record.pid} is still alive.`,
          { principal: normalized, session_id: record.session_id, pid: record.pid, required_next_step: 'Stop the process or perform explicit graceful replacement.' },
        );
      }
      db.prepare(`
        UPDATE session_authority
           SET state = ?, terminal_reason = ?, closed_at = ?, last_heartbeat_at = ?, updated_at = ?
         WHERE principal_key = ?
      `).run(
        SESSION_AUTHORITY_STATES.FAILED,
        'abandoned_session_reclaimed',
        at,
        at,
        at,
        normalized.principal_key,
      );
      writeEvent(db, {
        principalKey: normalized.principal_key,
        event: 'session_reclaimed',
        sessionId: record.session_id,
        state: SESSION_AUTHORITY_STATES.FAILED,
        at,
        details: { reason: 'lease_expired_and_process_absent' },
      });
      return { status: 'reclaimed', record: publicRecord(rowToRecord(getRow(normalized.principal_key))) };
    });
  };

  const reconcileSession = ({
    principal,
    keepSessionId,
    sessions = [],
    now = new Date(),
  } = {}) => {
    const normalized = principal?.principal_key ? principal : normalizeSessionPrincipal(principal);
    const keep = requiredString(keepSessionId, 'keep_session_id');
    const matches = findLegacySessionConflicts({ sessions, principal: normalized, includeInactive: true });
    const keepRecord = sessions.find((item) => String(item?.session_id ?? '') === keep) ?? null;
    if (!keepRecord) {
      throw new SessionAuthorityError(
        SESSION_AUTHORITY_REFUSAL_CODES.KEEP_SESSION_NOT_FOUND,
        `The requested keep session ${keep} is not present in the session index.`,
        { principal: normalized, keep_session_id: keep, matching_sessions: matches },
      );
    }
    const activeOthers = matches.filter((item) => item.session_id !== keep && isSessionLive(item));
    return {
      schema: 'narada.nars.session_authority_reconciliation.v1',
      status: activeOthers.length > 0 ? 'refused' : 'ready',
      mutation_performed: false,
      principal: normalized,
      keep_session_id: keep,
      matching_sessions: matches,
      active_other_sessions: activeOthers,
      recommended_next_action: activeOthers.length > 0
        ? 'Close all non-keep sessions explicitly, then rerun reconciliation.'
        : 'Admit or bind the keep session through the authority runtime.',
      generated_at: isoNow(now),
    };
  };

  return Object.freeze({
    db_path: path,
    inspectSession,
    admitSession,
    activateSession,
    heartbeatSession,
    closeSession,
    failSession,
    reclaimSession,
    reconcileSession,
    close: () => db.close(),
  });
}

export function isSessionLive(session) {
  if (!session || session.terminal_state === 'closed') return false;
  if (['active', 'starting_or_degraded'].includes(session.display_state)) return true;
  if (session.heartbeat_fresh === true) return true;
  return false;
}

export function findLegacySessionConflicts({
  sessions = [],
  principal,
  includeInactive = false,
} = {}) {
  const normalized = principal?.principal_key ? principal : normalizeSessionPrincipal(principal);
  return sessions
    .filter((session) => {
      const site = session.site_id ?? session.record?.site_id ?? null;
      const candidateId = session.agent_id
        ?? session.record?.agent_id
        ?? session.record?.identity
        ?? null;
      if (!site || canonicalSiteId(site) !== normalized.site_id || !candidateId) return false;
      let candidate;
      try {
        candidate = normalizeSessionPrincipal({
          siteId: normalized.site_id,
          localAgentId: candidateId,
          authorityScope: normalized.authority_scope,
        });
      } catch {
        return false;
      }
      if (candidate.local_agent_id !== normalized.local_agent_id) return false;
      return includeInactive || isSessionLive(session);
    })
    .map((session) => ({
      session_id: session.session_id ?? null,
      site_id: session.site_id ?? session.record?.site_id ?? normalized.site_id,
      agent_id: session.agent_id ?? session.record?.agent_id ?? null,
      display_state: session.display_state ?? null,
      health_status: session.health_status ?? null,
      heartbeat_fresh: session.heartbeat_fresh ?? false,
      started_at: session.started_at ?? session.record?.started_at ?? null,
      terminal_state: session.terminal_state ?? session.record?.terminal_state ?? null,
      attach: attachHandoff({
        sessionId: session.session_id,
        principal: normalized,
        siteRoot: session.site_root ?? null,
      }),
    }));
}

export function buildSessionAuthorityEnvironment(admission) {
  if (!admission || admission.status !== 'admitted') throw new TypeError('session_authority_admission_required');
  return {
    NARADA_SESSION_AUTHORITY_REQUIRED: '1',
    NARADA_SESSION_AUTHORITY_DB: admission.db_path,
    NARADA_SESSION_AUTHORITY_TOKEN: admission.owner_token,
    NARADA_SESSION_AUTHORITY_PRINCIPAL_KEY: admission.principal.principal_key,
    NARADA_SESSION_AUTHORITY_SESSION_ID: admission.session_id,
    NARADA_SESSION_AUTHORITY_EPOCH: String(admission.authority_epoch),
  };
}

export function createSessionAuthorityRuntimeBinding({
  env = process.env,
  runtimeContext = {},
} = {}) {
  const required = String(env.NARADA_SESSION_AUTHORITY_REQUIRED ?? '') === '1';
  const dbPath = String(env.NARADA_SESSION_AUTHORITY_DB ?? '').trim();
  const token = String(env.NARADA_SESSION_AUTHORITY_TOKEN ?? '').trim();
  const sessionId = String(env.NARADA_SESSION_AUTHORITY_SESSION_ID ?? runtimeContext.session ?? '').trim();
  const principalKey = String(env.NARADA_SESSION_AUTHORITY_PRINCIPAL_KEY ?? '').trim();
  const epoch = Number(env.NARADA_SESSION_AUTHORITY_EPOCH);
  if (!dbPath || !token || !sessionId || !principalKey || !Number.isInteger(epoch)) {
    if (required) {
      throw new SessionAuthorityError(
        SESSION_AUTHORITY_REFUSAL_CODES.TOKEN_REQUIRED,
        'NARS runtime authority admission is required but the authority token is incomplete.',
        { required_environment: ['NARADA_SESSION_AUTHORITY_DB', 'NARADA_SESSION_AUTHORITY_TOKEN', 'NARADA_SESSION_AUTHORITY_SESSION_ID', 'NARADA_SESSION_AUTHORITY_PRINCIPAL_KEY', 'NARADA_SESSION_AUTHORITY_EPOCH'] },
      );
    }
    return null;
  }
  const authority = openLocalSessionAuthority({ dbPath });
  const siteId = runtimeContext.siteId ?? env.NARADA_SITE_ID;
  const localAgentId = runtimeContext.identity ?? env.NARADA_AGENT_ID;
  const principal = normalizeSessionPrincipal({ siteId, localAgentId });
  if (principal.principal_key !== principalKey) {
    authority.close();
    throw new SessionAuthorityError(
      SESSION_AUTHORITY_REFUSAL_CODES.FENCED,
      'Runtime principal does not match the admitted authority principal.',
      { expected_principal_key: principalKey, actual_principal_key: principal.principal_key, session_id: sessionId },
    );
  }
  return Object.freeze({
    principal,
    session_id: sessionId,
    authority_epoch: epoch,
    activate: ({ pid = process.pid, now = new Date(), evidence = {} } = {}) => authority.activateSession({ principal, sessionId, ownerToken: token, authorityEpoch: epoch, pid, now, evidence }),
    heartbeat: ({ pid = process.pid, now = new Date(), evidence = {} } = {}) => authority.heartbeatSession({ principal, sessionId, ownerToken: token, authorityEpoch: epoch, pid, now, evidence }),
    close: ({ reason = 'runtime_closed', now = new Date(), evidence = {} } = {}) => authority.closeSession({ principal, sessionId, ownerToken: token, authorityEpoch: epoch, now, terminalReason: reason, evidence }),
    fail: ({ reason = 'runtime_failed', now = new Date(), evidence = {} } = {}) => authority.failSession({ principal, sessionId, ownerToken: token, authorityEpoch: epoch, now, terminalReason: reason, evidence }),
    dispose: () => authority.close(),
  });
}
