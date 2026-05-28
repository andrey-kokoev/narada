#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const WITHHELD_AUTHORITIES = [
  'task_lifecycle_mutation_authority',
  'inbox_mutation_authority',
  'outbox_transport_authority',
  'repository_publication_authority',
  'site_mutation_authority',
  'credential_access',
  'native_shell_authority',
  'external_site_authority',
];

function evidenceDir(siteRoot, carrierSessionId) {
  return join(siteRoot, '.narada', 'crew', 'narada-native-carrier-sessions', carrierSessionId);
}

function writeEvidence(siteRoot, carrierSessionId, phase, record) {
  const dir = evidenceDir(siteRoot, carrierSessionId);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${phase}.json`);
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  return path;
}

function baseSession({ siteRoot, agentId, carrierSessionId, agentStartEventId, now }) {
  return {
    schema: 'narada.narada_native_carrier.session.v0',
    agent_id: agentId,
    carrier_session_id: carrierSessionId,
    agent_start_event_id: agentStartEventId,
    site_root: siteRoot,
    created_at: now,
    authority_posture: {
      capability_posture: 'facade_only',
      effect_authority_admitted: false,
      withheld_authorities: WITHHELD_AUTHORITIES,
    },
  };
}

function summarizeCapabilityProjections(projections = []) {
  return projections.map((projection) => ({
    capability_ref: projection?.capability_ref ?? null,
    capability_kind: projection?.capability_kind ?? null,
    status: projection?.status ?? projection?.projection_status ?? null,
    refusal_reason: projection?.refusal_reason ?? null,
    credential_ref_present: projection?.credential_ref_present === true,
    consent_ref_present: Boolean(projection?.consent_ref ?? projection?.consent_refs?.length),
    grant_freshness_posture: projection?.grant_freshness?.posture ?? null,
    revocation_status: projection?.revocation_status ?? null,
    raw_secret_values_recorded: false,
    values_omitted: true,
  }));
}

function startSession(options) {
  const now = options.now ?? new Date().toISOString();
  const session = {
    ...baseSession({ ...options, now }),
    lifecycle_state: 'materialized',
    capability_projection_statuses: summarizeCapabilityProjections(options.capabilityProjections),
    startup_command: {
      name: 'agent_context_startup_sequence',
      arguments: {},
    },
  };
  return {
    session,
    evidence_path: writeEvidence(options.siteRoot, options.carrierSessionId, 'start', {
      schema: 'narada.narada_native_carrier.lifecycle_event.v0',
      phase: 'start',
    state: 'materialized',
    recorded_at: now,
    session,
    capability_projection_statuses: session.capability_projection_statuses,
  }),
  };
}

function hydrateSession(session, options = {}) {
  const now = options.now ?? new Date().toISOString();
  return writeEvidence(session.site_root, session.carrier_session_id, 'hydrate', {
    schema: 'narada.narada_native_carrier.lifecycle_event.v0',
    phase: 'hydrate',
    state: 'materialized',
    recorded_at: now,
    startup_command: session.startup_command,
    hydration_result: {
      status: 'planned_hydration_recorded',
      target_local_mcp: 'narada-proper',
      direct_sqlite_inspection_required: false,
    },
  });
}

function projectCapabilities(session, options = {}) {
  const now = options.now ?? new Date().toISOString();
  return writeEvidence(session.site_root, session.carrier_session_id, 'capabilities', {
    schema: 'narada.narada_native_carrier.capability_projection.v0',
    phase: 'project_capabilities',
    state: 'materialized',
    recorded_at: now,
    capability_posture: 'facade_only',
    projected_capabilities_are_not_grants: true,
    withheld_authorities: WITHHELD_AUTHORITIES,
  });
}

function heartbeat(session, options = {}) {
  const now = options.now ?? new Date().toISOString();
  return writeEvidence(session.site_root, session.carrier_session_id, 'heartbeat', {
    schema: 'narada.narada_native_carrier.readback.v0',
    phase: 'heartbeat',
    state: 'running',
    recorded_at: now,
    direct_sqlite_inspection_required: false,
    effect_authority_admitted: false,
    withheld_authorities: WITHHELD_AUTHORITIES,
  });
}

function closeSession(session, options = {}) {
  const now = options.now ?? new Date().toISOString();
  return writeEvidence(session.site_root, session.carrier_session_id, 'close', {
    schema: 'narada.narada_native_carrier.closeout.v0',
    phase: 'close',
    state: 'stopped',
    recorded_at: now,
    effect_execution_attempted: false,
    terminal_claim: 'carrier_session_closed_without_authority_transfer',
    withheld_authorities: WITHHELD_AUTHORITIES,
  });
}

function materializeAndClose(options) {
  const started = startSession(options);
  const session = started.session;
  return {
    schema: 'narada.narada_native_carrier.materialize_and_close_result.v0',
    carrier_session_id: session.carrier_session_id,
    state: 'stopped',
    evidence_paths: {
      start: started.evidence_path,
      hydrate: hydrateSession(session, options),
      capabilities: projectCapabilities(session, options),
      heartbeat: heartbeat(session, options),
      close: closeSession(session, options),
    },
    withheld_authorities: WITHHELD_AUTHORITIES,
  };
}

function readiness(options) {
  const state = options.state ?? 'planned';
  return {
    schema: 'narada.narada_native_carrier.readiness.v0',
    readiness_state: state,
    runtime_boundary_ref: 'docs/product/narada-native-carrier-runtime-boundary.v0.json',
    direct_sqlite_inspection_required: false,
    latest_session_evidence_path: options.latestSessionEvidencePath ?? null,
    lifecycle_state: state,
    capability_posture: 'facade_only',
    effect_execution_attempted: options.effectExecutionAttempted === true,
    effect_owners: {
      task_lifecycle: 'task_governance_service',
      inbox: 'canonical_inbox_service',
      outbox: 'canonical_outbox_service',
      command_execution: 'command_execution_intent_service',
      repository_publication: 'repository_publication_intent_service',
      law: 'law_receipt_service',
      roster: 'agent_roster_service',
      capability_consent: 'canonical_capability_consent_registry',
    },
    withheld_authorities: WITHHELD_AUTHORITIES,
    smoke_proof_commands: [
      'node --test tools\\narada-native-carrier\\harness.test.mjs',
    ],
  };
}

function smokeProof(options) {
  const closed = materializeAndClose(options);
  return {
    schema: 'narada.narada_native_carrier.smoke_proof.v0',
    planned: readiness({ state: 'planned' }),
    materialized: readiness({
      state: 'materialized',
      latestSessionEvidencePath: closed.evidence_paths.start,
    }),
    running: readiness({
      state: 'running',
      latestSessionEvidencePath: closed.evidence_paths.heartbeat,
    }),
    closed: readiness({
      state: 'stopped',
      latestSessionEvidencePath: closed.evidence_paths.close,
    }),
    evidence_paths: closed.evidence_paths,
    effect_execution_attempted: false,
    withheld_authorities: WITHHELD_AUTHORITIES,
  };
}

export {
  WITHHELD_AUTHORITIES,
  closeSession,
  heartbeat,
  hydrateSession,
  materializeAndClose,
  projectCapabilities,
  readiness,
  smokeProof,
  startSession,
};
