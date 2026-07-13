import { randomUUID } from 'node:crypto';
import { assertConceptProtocolLifecycleTransition } from './concept-protocol-lifecycle-state.mjs';

export const CONCEPT_LIFECYCLE_OBJECT_TYPES = new Set([
  'concept',
  'protocol',
  'process_contract',
  'doctrine',
]);

export const CONCEPT_LIFECYCLE_EVENT_TYPES = new Set([
  'observed',
  'named',
  'doctrine_checked',
  'codified',
  'trialed',
  'promoted',
  'canonicalized',
  'deprecated',
  'rejected',
  'superseded',
  'corrected',
]);

export const CONCEPT_LIFECYCLE_STATES = new Set([
  'observed',
  'named',
  'doctrine_checked',
  'codified',
  'trialed',
  'promoted',
  'canonical',
  'deprecated',
  'rejected',
  'superseded',
]);

export function validateLifecycleEventInput({
  objectId,
  objectType,
  eventType,
  stateAfter,
  actorAgentId,
  authorityBasis,
  scope,
  artifactRefs,
  evidenceRefs,
}) {
  if (!objectId || !/^[a-z0-9][a-z0-9_.:-]*$/.test(objectId)) {
    throw new Error(`invalid_concept_lifecycle_object_id: ${objectId ?? ''}`);
  }
  if (!CONCEPT_LIFECYCLE_OBJECT_TYPES.has(objectType)) {
    throw new Error(`invalid_concept_lifecycle_object_type: ${objectType ?? ''}`);
  }
  if (!CONCEPT_LIFECYCLE_EVENT_TYPES.has(eventType)) {
    throw new Error(`invalid_concept_lifecycle_event_type: ${eventType ?? ''}`);
  }
  if (!CONCEPT_LIFECYCLE_STATES.has(stateAfter)) {
    throw new Error(`invalid_concept_lifecycle_state_after: ${stateAfter ?? ''}`);
  }
  if (!actorAgentId || !/^andrey-user\.[A-Za-z0-9_-]+$/.test(actorAgentId)) {
    throw new Error(`invalid_concept_lifecycle_actor_agent_id: ${actorAgentId ?? ''}`);
  }
  validateObject('authority_basis', authorityBasis, ['kind', 'summary']);
  validateObject('scope', scope, ['site', 'locus', 'applies_to']);
  validateRefArray('artifact_refs', artifactRefs);
  validateRefArray('evidence_refs', evidenceRefs);
}

function validateObject(label, value, requiredKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`invalid_concept_lifecycle_${label}`);
  }
  for (const key of requiredKeys) {
    if (typeof value[key] !== 'string' || value[key].trim().length === 0) {
      throw new Error(`invalid_concept_lifecycle_${label}_${key}`);
    }
  }
}

function validateRefArray(label, value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`invalid_concept_lifecycle_${label}`);
  }
  for (const ref of value) {
    if (typeof ref !== 'string' || ref.trim().length === 0) {
      throw new Error(`invalid_concept_lifecycle_${label}`);
    }
  }
}

export function buildLifecycleEventPayload({
  eventId,
  objectId,
  objectType,
  eventType,
  stateAfter,
  actorAgentId,
  authorityBasis,
  scope,
  artifactRefs,
  evidenceRefs,
  notes,
  previousState,
  createdAt,
}) {
  return {
    schema: 'narada.concept_protocol.lifecycle_event.v0',
    event_id: eventId,
    object_id: objectId,
    object_type: objectType,
    event_type: eventType,
    state_after: stateAfter,
    previous_state: previousState,
    actor_agent_id: actorAgentId,
    authority_basis: authorityBasis,
    scope,
    artifact_refs: artifactRefs,
    evidence_refs: evidenceRefs,
    notes: notes ?? null,
    created_at: createdAt,
    append_only_authority: true,
    adjacent_surfaces_are_evidence_only: true,
  };
}

export function buildCurrentStatePayload({ event }) {
  return {
    schema: 'narada.concept_protocol.current_state_projection.v0',
    object_id: event.object_id,
    object_type: event.object_type,
    state_after: event.state_after,
    previous_state: event.previous_state,
    last_event_id: event.event_id,
    last_event_type: event.event_type,
    actor_agent_id: event.actor_agent_id,
    authority_basis: event.authority_basis,
    scope: event.scope,
    artifact_refs: event.artifact_refs,
    evidence_refs: event.evidence_refs,
    notes: event.notes,
    last_event_at: event.created_at,
    projection_not_authority: true,
    authority: 'concept_protocol_lifecycle_events',
  };
}

export function parseLifecycleEventRow(row, parseJsonField, { includePayload = false } = {}) {
  const parsed = {
    event_id: row.event_id,
    object_id: row.object_id,
    object_type: row.object_type,
    event_type: row.event_type,
    state_after: row.state_after,
    actor_agent_id: row.actor_agent_id,
    authority_basis: parseJsonField(row.authority_basis_json, {}),
    scope: parseJsonField(row.scope_json, {}),
    artifact_refs: parseJsonField(row.artifact_refs_json, []),
    evidence_refs: parseJsonField(row.evidence_refs_json, []),
    notes: row.notes,
    created_at: row.created_at,
  };
  if (includePayload) parsed.payload = parseJsonField(row.payload_json, null);
  return parsed;
}

export function parseCurrentStateRow(row, parseJsonField, { includePayload = false } = {}) {
  const parsed = {
    object_id: row.object_id,
    object_type: row.object_type,
    state_after: row.state_after,
    last_event_id: row.last_event_id,
    last_event_type: row.last_event_type,
    last_event_at: row.last_event_at,
    actor_agent_id: row.actor_agent_id,
    authority_basis: parseJsonField(row.authority_basis_json, {}),
    scope: parseJsonField(row.scope_json, {}),
    artifact_refs: parseJsonField(row.artifact_refs_json, []),
    evidence_refs: parseJsonField(row.evidence_refs_json, []),
    notes: row.notes,
    projection_not_authority: true,
    authority: 'concept_protocol_lifecycle_events',
  };
  if (includePayload) parsed.payload = parseJsonField(row.payload_json, null);
  return parsed;
}

export function recordLifecycleEvent({ db, toolArgs, assertBoundIdentity = () => {} }) {
  assertDb(db);
  const objectId = requireString(toolArgs, 'object_id');
  const objectType = requireString(toolArgs, 'object_type');
  const eventType = requireString(toolArgs, 'event_type');
  const stateAfter = requireString(toolArgs, 'state_after');
  const actorAgentId = requireString(toolArgs, 'actor_agent_id');
  assertBoundIdentity(actorAgentId);
  const authorityBasis = objectField(toolArgs ?? {}, 'authority_basis');
  const scope = objectField(toolArgs ?? {}, 'scope');
  const artifactRefs = arrayField(toolArgs ?? {}, 'artifact_refs');
  const evidenceRefs = arrayField(toolArgs ?? {}, 'evidence_refs');
  const notes = stringField(toolArgs ?? {}, 'notes');

  validateLifecycleEventInput({
    objectId,
    objectType,
    eventType,
    stateAfter,
    actorAgentId,
    authorityBasis,
    scope,
    artifactRefs,
    evidenceRefs,
  });

  const currentStateRow = db.prepare(
    'SELECT state_after FROM concept_protocol_lifecycle_current_state WHERE object_id = ?',
  ).get(objectId);
  const previousState = currentStateRow ? String(currentStateRow.state_after) : null;
  assertConceptProtocolLifecycleTransition({
    previousState,
    nextState: stateAfter,
    eventType,
  });

  const now = new Date().toISOString();
  const eventId = `clife_${randomUUID().replace(/-/g, '')}`;
  const payload = buildLifecycleEventPayload({
    eventId,
    objectId,
    objectType,
    eventType,
    stateAfter,
    actorAgentId,
    authorityBasis,
    scope,
    artifactRefs,
    evidenceRefs,
    notes,
    previousState,
    createdAt: now,
  });
  const currentProjection = buildCurrentStatePayload({ event: payload });

  const insert = db.transaction(() => {
    db.prepare(`
      INSERT INTO concept_protocol_lifecycle_events (
        event_id, object_id, object_type, event_type, state_after, actor_agent_id,
        authority_basis_json, scope_json, artifact_refs_json, evidence_refs_json,
        notes, created_at, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      eventId,
      objectId,
      objectType,
      eventType,
      stateAfter,
      actorAgentId,
      JSON.stringify(authorityBasis),
      JSON.stringify(scope),
      JSON.stringify(artifactRefs),
      JSON.stringify(evidenceRefs),
      notes ?? null,
      now,
      JSON.stringify(payload)
    );
    db.prepare(`
      INSERT INTO concept_protocol_lifecycle_current_state (
        object_id, object_type, state_after, last_event_id, last_event_type,
        last_event_at, actor_agent_id, authority_basis_json, scope_json,
        artifact_refs_json, evidence_refs_json, notes, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(object_id) DO UPDATE SET
        object_type = excluded.object_type,
        state_after = excluded.state_after,
        last_event_id = excluded.last_event_id,
        last_event_type = excluded.last_event_type,
        last_event_at = excluded.last_event_at,
        actor_agent_id = excluded.actor_agent_id,
        authority_basis_json = excluded.authority_basis_json,
        scope_json = excluded.scope_json,
        artifact_refs_json = excluded.artifact_refs_json,
        evidence_refs_json = excluded.evidence_refs_json,
        notes = excluded.notes,
        payload_json = excluded.payload_json
    `).run(
      objectId,
      objectType,
      stateAfter,
      eventId,
      eventType,
      now,
      actorAgentId,
      JSON.stringify(authorityBasis),
      JSON.stringify(scope),
      JSON.stringify(artifactRefs),
      JSON.stringify(evidenceRefs),
      notes ?? null,
      JSON.stringify(currentProjection)
    );
  });
  insert();

  return {
    status: 'recorded',
    schema: 'narada.concept_protocol.lifecycle_event.record.v0',
    authority: 'agent_context_sqlite.concept_protocol_lifecycle_events',
    append_only_event_log: true,
    projection_not_authority: true,
    adjacent_surfaces_are_evidence_only: true,
    previous_state: previousState,
    lifecycle_transition: previousState === stateAfter
      ? null
      : { from: previousState, to: stateAfter, event_type: eventType },
    event: payload,
    current_state_projection: currentProjection,
  };
}

export function readLifecycleHistory({ db, toolArgs, parseJsonField }) {
  assertDb(db);
  const objectId = requireString(toolArgs, 'object_id');
  const limit = clampLimit(toolArgs?.limit, 50, 100);
  const rows = db.prepare(`
    SELECT * FROM concept_protocol_lifecycle_events
    WHERE object_id = ?
    ORDER BY created_at ASC
    LIMIT ?
  `).all(objectId, limit);
  return {
    status: rows.length > 0 ? 'ok' : 'not_found',
    schema: 'narada.concept_protocol.lifecycle_event.history.v0',
    authority: 'agent_context_sqlite.concept_protocol_lifecycle_events',
    append_only_event_log: true,
    projection_not_authority: true,
    object_id: objectId,
    count: rows.length,
    events: rows.map((row) => parseLifecycleEventRow(row, parseJsonField, { includePayload: true })),
  };
}

export function readCurrentLifecycleState({ db, toolArgs, parseJsonField }) {
  assertDb(db);
  const objectId = stringField(toolArgs ?? {}, 'object_id');
  if (objectId) {
    const row = db.prepare('SELECT * FROM concept_protocol_lifecycle_current_state WHERE object_id = ?').get(objectId);
    return {
      status: row ? 'ok' : 'not_found',
      schema: 'narada.concept_protocol.current_state.show.v0',
      authority: 'agent_context_sqlite.concept_protocol_lifecycle_events',
      projection_not_authority: true,
      object_id: objectId,
      current_state: row ? parseCurrentStateRow(row, parseJsonField, { includePayload: true }) : null,
    };
  }

  const objectType = stringField(toolArgs ?? {}, 'object_type');
  const stateAfter = stringField(toolArgs ?? {}, 'state_after');
  const limit = clampLimit(toolArgs?.limit, 50, 100);
  const where = [];
  const params = [];
  if (objectType) {
    if (!CONCEPT_LIFECYCLE_OBJECT_TYPES.has(objectType)) throw new Error(`invalid_concept_lifecycle_object_type: ${objectType}`);
    where.push('object_type = ?');
    params.push(objectType);
  }
  if (stateAfter) {
    if (!CONCEPT_LIFECYCLE_STATES.has(stateAfter)) throw new Error(`invalid_concept_lifecycle_state_after: ${stateAfter}`);
    where.push('state_after = ?');
    params.push(stateAfter);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT * FROM concept_protocol_lifecycle_current_state
    ${whereSql}
    ORDER BY last_event_at DESC
    LIMIT ?
  `).all(...params, limit);
  return {
    status: 'ok',
    schema: 'narada.concept_protocol.current_state.list.v0',
    authority: 'agent_context_sqlite.concept_protocol_lifecycle_events',
    projection_not_authority: true,
    count: rows.length,
    current_states: rows.map((row) => parseCurrentStateRow(row, parseJsonField)),
  };
}

function assertDb(db) {
  if (!db) throw new Error('agent_context_db_not_available');
}

function requireString(record, key) {
  const value = stringField(record ?? {}, key);
  if (!value) throw new Error(`${key}_required`);
  return value;
}

function stringField(record, key) {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function objectField(record, key) {
  const value = record[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

function arrayField(record, key) {
  const value = record[key];
  return Array.isArray(value) ? value : [];
}

function clampLimit(value, defaultValue, maxValue) {
  const parsed = parseInt(value ?? String(defaultValue), 10);
  if (Number.isNaN(parsed)) return defaultValue;
  return Math.min(Math.max(parsed, 1), maxValue);
}
