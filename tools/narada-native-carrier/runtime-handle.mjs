const RUNTIME_HANDLE_SCHEMA = 'narada.narada_native_carrier.runtime_handle.v0';

const RUNTIME_HANDLE_KINDS = Object.freeze([
  'fixture',
  'local_process',
  'mcp_session',
  'missing',
]);

const NO_RUNTIME_AUTHORITY_FLAGS = Object.freeze({
  task_lifecycle_authority_granted: false,
  inbox_authority_granted: false,
  outbox_authority_granted: false,
  effect_authority_granted: false,
  publication_authority_granted: false,
  identity_authority_granted: false,
  capability_authority_granted: false,
});

function buildRuntimeHandle({
  kind,
  handleId = null,
  processPid = null,
  sessionId = null,
  startedAt = null,
  heartbeatDueAt = null,
  reachability = {},
  evidenceRefs = [],
} = {}) {
  const normalizedKind = RUNTIME_HANDLE_KINDS.includes(kind) ? kind : 'missing';
  const normalizedHandleId = typeof handleId === 'string' && handleId.length > 0
    ? handleId
    : defaultHandleId({ kind: normalizedKind, processPid, sessionId });
  return {
    schema: RUNTIME_HANDLE_SCHEMA,
    kind: normalizedKind,
    handle_id: normalizedHandleId,
    handle_present: normalizedKind !== 'missing',
    process: {
      present: normalizedKind === 'local_process' && processPid !== null && processPid !== undefined,
      pid: normalizedKind === 'local_process' && processPid !== null && processPid !== undefined ? Number(processPid) : null,
    },
    session: {
      present: normalizedKind === 'mcp_session' && typeof sessionId === 'string' && sessionId.length > 0,
      session_id: normalizedKind === 'mcp_session' && typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : null,
    },
    started_at: startedAt,
    heartbeat_due_at: heartbeatDueAt,
    reachability_summary: {
      status: reachability.status ?? (normalizedKind === 'missing' ? 'missing' : 'unknown'),
      checked_at: reachability.checked_at ?? null,
      evidence_refs: Array.isArray(evidenceRefs) ? evidenceRefs.slice(0, 20) : [],
      values_omitted: true,
    },
    raw_transcript_recorded: false,
    raw_prompt_recorded: false,
    raw_provider_output_recorded: false,
    raw_secret_values_recorded: false,
    ...NO_RUNTIME_AUTHORITY_FLAGS,
  };
}

function buildFixtureRuntimeHandle({ handleId, startedAt = null, heartbeatDueAt = null, evidenceRefs = [] } = {}) {
  return buildRuntimeHandle({
    kind: 'fixture',
    handleId,
    startedAt,
    heartbeatDueAt,
    reachability: { status: 'fixture_reachable' },
    evidenceRefs,
  });
}

function buildLocalProcessRuntimeHandle({
  handleId,
  processPid,
  startedAt,
  heartbeatDueAt,
  reachable = true,
  checkedAt = null,
  evidenceRefs = [],
} = {}) {
  return buildRuntimeHandle({
    kind: 'local_process',
    handleId,
    processPid,
    startedAt,
    heartbeatDueAt,
    reachability: { status: reachable ? 'reachable' : 'unreachable', checked_at: checkedAt },
    evidenceRefs,
  });
}

function buildMcpSessionRuntimeHandle({
  handleId,
  sessionId,
  startedAt,
  heartbeatDueAt,
  reachable = true,
  checkedAt = null,
  evidenceRefs = [],
} = {}) {
  return buildRuntimeHandle({
    kind: 'mcp_session',
    handleId,
    sessionId,
    startedAt,
    heartbeatDueAt,
    reachability: { status: reachable ? 'reachable' : 'unreachable', checked_at: checkedAt },
    evidenceRefs,
  });
}

function buildMissingRuntimeHandle({ handleId = 'runtime:missing', checkedAt = null, evidenceRefs = [] } = {}) {
  return buildRuntimeHandle({
    kind: 'missing',
    handleId,
    reachability: { status: 'missing', checked_at: checkedAt },
    evidenceRefs,
  });
}

function validateRuntimeHandle(handle) {
  const errors = [];
  if (!handle || typeof handle !== 'object' || Array.isArray(handle)) return ['runtime_handle_must_be_object'];
  if (handle.schema !== RUNTIME_HANDLE_SCHEMA) errors.push('runtime_handle_schema_invalid');
  if (!RUNTIME_HANDLE_KINDS.includes(handle.kind)) errors.push('runtime_handle_kind_invalid');
  if (typeof handle.handle_id !== 'string' || handle.handle_id.length === 0) errors.push('runtime_handle_id_required');
  if (handle.kind === 'fixture' && handle.handle_present !== true) errors.push('fixture_handle_must_be_present');
  if (handle.kind === 'missing' && handle.handle_present !== false) errors.push('missing_handle_must_not_be_present');
  if (handle.kind === 'local_process' && handle.process?.present !== true) errors.push('local_process_presence_required');
  if (handle.kind === 'mcp_session' && handle.session?.present !== true) errors.push('mcp_session_presence_required');
  for (const flag of [
    'raw_transcript_recorded',
    'raw_prompt_recorded',
    'raw_provider_output_recorded',
    'raw_secret_values_recorded',
    ...Object.keys(NO_RUNTIME_AUTHORITY_FLAGS),
  ]) {
    if (handle[flag] !== false) errors.push(`${flag}_must_be_false`);
  }
  return errors;
}

function defaultHandleId({ kind, processPid, sessionId }) {
  if (kind === 'local_process' && processPid !== null && processPid !== undefined) return `runtime:local_process:${processPid}`;
  if (kind === 'mcp_session' && typeof sessionId === 'string' && sessionId.length > 0) return `runtime:mcp_session:${sessionId}`;
  return `runtime:${kind}`;
}

export {
  NO_RUNTIME_AUTHORITY_FLAGS,
  RUNTIME_HANDLE_KINDS,
  RUNTIME_HANDLE_SCHEMA,
  buildFixtureRuntimeHandle,
  buildLocalProcessRuntimeHandle,
  buildMcpSessionRuntimeHandle,
  buildMissingRuntimeHandle,
  buildRuntimeHandle,
  validateRuntimeHandle,
};
