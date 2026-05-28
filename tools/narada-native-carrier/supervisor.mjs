import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { WITHHELD_AUTHORITIES } from './harness.mjs';
import { operationalReadiness, reconstruct } from './readiness.mjs';
import { readRegistration, registrationReadiness } from './adapter-registration.mjs';
import { buildFixtureRuntimeHandle } from './runtime-handle.mjs';
import { buildHeartbeatEvidence } from './heartbeat-evidence.mjs';

function sessionDir(siteRoot, carrierSessionId) {
  return join(siteRoot, '.narada', 'crew', 'narada-native-carrier-sessions', carrierSessionId);
}

function supervisorPath(siteRoot, carrierSessionId, phase) {
  return join(sessionDir(siteRoot, carrierSessionId), `supervisor-${phase}.json`);
}

function writeSupervisorEvidence(siteRoot, carrierSessionId, phase, record) {
  const path = supervisorPath(siteRoot, carrierSessionId, phase);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  return path;
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

function baseEvidence({ siteRoot, carrierSessionId, agentId, phase, state, now = new Date().toISOString(), runtimeHandle = null }) {
  const readiness = operationalReadiness(siteRoot, carrierSessionId);
  return {
    schema: 'narada.narada_native_carrier.supervisor_event.v0',
    phase,
    state,
    carrier_session_id: carrierSessionId,
    agent_id: agentId,
    recorded_at: now,
    runtime_handle: runtimeHandle,
    adapter_posture: readiness.adapter_posture,
    capability_posture: readiness.adapter_registration_readiness?.capability_posture ?? readiness.capability_posture,
    latest_evidence_refs: readiness.latest_evidence_refs,
    residual_blockers: readiness.residual_blockers,
    authority_non_claims: readiness.authority_non_claims,
    direct_task_lifecycle_mutation: false,
    direct_inbox_mutation: false,
    direct_outbox_mutation: false,
    direct_publication_mutation: false,
    credential_access: false,
    external_site_mutation: false,
    raw_transcript_recorded: false,
    raw_secret_values_recorded: false,
  };
}

function startSupervisedSession(options) {
  const runtimeHandle = options.runtimeHandle ?? buildFixtureRuntimeHandle({
    handleId: `runtime:fixture:${options.carrierSessionId}`,
    startedAt: options.now ?? null,
    evidenceRefs: [`session:${options.carrierSessionId}`],
  });
  const evidence = baseEvidence({
    ...options,
    phase: 'start',
    state: 'running',
    runtimeHandle,
  });
  evidence.heartbeat_required = true;
  evidence.capability_projection_statuses = summarizeCapabilityProjections(options.capabilityProjections);
  const path = writeSupervisorEvidence(options.siteRoot, options.carrierSessionId, 'start', evidence);
  return { evidence, evidence_path: path };
}

function heartbeatSupervisedSession(options) {
  const reconstructed = reconstruct(options.siteRoot, options.carrierSessionId);
  const runtimeHandle = options.runtimeHandle ?? buildFixtureRuntimeHandle({
    handleId: `runtime:fixture:${options.carrierSessionId}`,
    startedAt: options.now ?? null,
    heartbeatDueAt: options.heartbeatDueAt ?? null,
    evidenceRefs: [`session:${options.carrierSessionId}`],
  });
  const heartbeatSummary = buildHeartbeatEvidence({
    carrierSessionId: options.carrierSessionId,
    agentId: options.agentId,
    runtimeHandle,
    latestWorkPacketSummary: options.latestWorkPacketSummary,
    latestHandoffRef: reconstructed.evidence_refs?.['work-loop-handoff'] ?? null,
    toDataReachability: options.toDataReachability,
    registration: readRegistration(options.siteRoot),
    now: options.now,
  });
  const evidence = {
    ...baseEvidence({
      ...options,
      phase: 'heartbeat',
      state: 'running',
      runtimeHandle,
    }),
    latest_work_packet: heartbeatSummary.latest_work_packet_summary,
    heartbeat_summary: heartbeatSummary,
    wrapper_stage_summaries: Array.isArray(options.wrapperStageSummaries)
      ? options.wrapperStageSummaries.map(boundedWrapperStageSummary)
      : [],
    latest_handoff: reconstructed.proposal ? {
      status: reconstructed.proposal.status,
      evidence_ref: reconstructed.evidence_refs['work-loop-handoff'],
    } : null,
  };
  const path = writeSupervisorEvidence(options.siteRoot, options.carrierSessionId, 'heartbeat', evidence);
  return { evidence, evidence_path: path };
}

function boundedWrapperStageSummary(stage) {
  return {
    stage: typeof stage?.stage === 'string' ? stage.stage : null,
    status: typeof stage?.status === 'string' ? stage.status : null,
    mode: typeof stage?.mode === 'string' ? stage.mode : null,
    evidence_ref: typeof stage?.evidence_ref === 'string' ? stage.evidence_ref : null,
    raw_prompt_recorded: false,
    raw_provider_output_recorded: false,
    raw_transcript_recorded: false,
    raw_secret_values_recorded: false,
    values_omitted: true,
  };
}

function interruptSupervisedSession(options) {
  const interruptStatus = normalizeStatus(
    options.interruptStatus,
    ['requested', 'acknowledged', 'refused', 'unsupported'],
    'acknowledged',
  );
  const evidence = {
    ...baseEvidence({
      ...options,
      phase: 'interrupt',
      state: ['requested', 'acknowledged'].includes(interruptStatus) ? 'interrupted' : 'running',
    }),
    interrupt: {
      status: interruptStatus,
      supported: interruptStatus !== 'unsupported',
      acknowledgement_required: interruptStatus === 'requested',
      refused_reason_class: interruptStatus === 'refused' ? boundedReasonClass(options.refusedReasonClass ?? options.reason) : null,
      latest_evidence_refs: boundedEvidenceRefs(options.latestEvidenceRefs),
      raw_diagnostics_recorded: false,
      values_omitted: true,
    },
    interrupt_supported: interruptStatus !== 'unsupported',
    direct_effect_execution_attempted: false,
    unrelated_process_kill_attempted: false,
    authority_transfer: false,
  };
  const path = writeSupervisorEvidence(options.siteRoot, options.carrierSessionId, 'interrupt', evidence);
  return { evidence, evidence_path: path };
}

function closeSupervisedSession(options) {
  const closeStatus = normalizeStatus(options.closeStatus, ['stopped', 'unknown', 'stale'], 'stopped');
  const evidence = {
    ...baseEvidence({ ...options, phase: 'close', state: closeStatus }),
    closeout: {
      status: 'closed_with_supervisor_evidence',
      authority_transferred: false,
    },
    close: {
      status: closeStatus,
      authority_transfer: false,
      unrelated_process_kill_attempted: false,
      latest_evidence_refs: boundedEvidenceRefs(options.latestEvidenceRefs),
      raw_diagnostics_recorded: false,
      values_omitted: true,
    },
  };
  const path = writeSupervisorEvidence(options.siteRoot, options.carrierSessionId, 'close', evidence);
  return { evidence, evidence_path: path };
}

function failSupervisedSession(options) {
  const evidence = {
    ...baseEvidence({ ...options, phase: 'failure', state: 'failed' }),
    failure: {
      reason_class: boundedReasonClass(options.reasonClass ?? options.reason),
      terminal: options.terminal === true,
      diagnostics: boundedDiagnostics(options.diagnostics),
      latest_evidence_refs: boundedEvidenceRefs(options.latestEvidenceRefs),
      raw_stdout_recorded: false,
      raw_stderr_recorded: false,
      raw_transcript_recorded: false,
      raw_provider_output_recorded: false,
      raw_secret_values_recorded: false,
      values_omitted: true,
    },
    authority_transfer: false,
    unrelated_process_kill_attempted: false,
  };
  const path = writeSupervisorEvidence(options.siteRoot, options.carrierSessionId, 'failure', evidence);
  return { evidence, evidence_path: path };
}

function normalizeStatus(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function boundedReasonClass(reason) {
  if (typeof reason !== 'string' || reason.length === 0) return 'unspecified_failure';
  const normalized = reason.toLowerCase().replace(/[^a-z0-9_:-]+/g, '_').slice(0, 80);
  if (/secret|token|password|credential|authorization|api[_-]?key|sk-/.test(normalized)) return 'withheld_sensitive_reason';
  return normalized;
}

function boundedDiagnostics(diagnostics) {
  if (!diagnostics || typeof diagnostics !== 'object' || Array.isArray(diagnostics)) {
    return {
      codes: [],
      classes: [],
      evidence_refs: [],
      raw_values_recorded: false,
      values_omitted: true,
    };
  }
  const codes = Array.isArray(diagnostics.codes) ? diagnostics.codes.filter((code) => typeof code === 'string').slice(0, 20) : [];
  const classes = Array.isArray(diagnostics.classes) ? diagnostics.classes.filter((entry) => typeof entry === 'string').slice(0, 20) : [];
  return {
    codes,
    classes,
    evidence_refs: boundedEvidenceRefs(diagnostics.evidence_refs),
    raw_values_recorded: false,
    values_omitted: true,
  };
}

function boundedEvidenceRefs(refs) {
  if (!Array.isArray(refs)) return [];
  return refs.filter((ref) => typeof ref === 'string' && ref.length > 0).slice(0, 20);
}

function readSupervisorEvents(siteRoot, carrierSessionId) {
  const dir = sessionDir(siteRoot, carrierSessionId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.startsWith('supervisor-') && name.endsWith('.json'))
    .map((name) => {
      const path = join(dir, name);
      return { path, event: JSON.parse(readFileSync(path, 'utf8')) };
    })
    .sort((a, b) => a.event.recorded_at.localeCompare(b.event.recorded_at));
}

function supervisorDoctor(siteRoot, carrierSessionId) {
  const events = readSupervisorEvents(siteRoot, carrierSessionId);
  const latest = events[events.length - 1]?.event ?? null;
  const registration = registrationReadiness(readRegistration(siteRoot));
  const readiness = operationalReadiness(siteRoot, carrierSessionId);
  const blocked = readiness.residual_blockers.length > 0 || registration.status === 'refused';
  const runtime_state = doctorState({ latest, blocked, registration });
  const adapter_state = registration.status === 'configured_provider_adapter' ? 'provider_configured' : 'fixture_only';
  const projectionPosture = capabilityProjectionPosture({ events, readiness, registration });
  return {
    schema: 'narada.narada_native_carrier.supervisor_doctor.v0',
    carrier_session_id: carrierSessionId,
    runtime_state,
    doctor_state: runtime_state,
    adapter_state,
    doctor_states: [...new Set([adapter_state, runtime_state, blocked ? 'blocked' : null].filter(Boolean))],
    provider_posture: registration.status === 'configured_provider_adapter' ? 'provider_configured' : registration.status,
    capability_projection_posture: projectionPosture,
    blocked,
    residual_blockers: readiness.residual_blockers,
    handoff_artifacts: readiness.handoff_artifacts,
    next_diagnostic_command: `node tools\\narada-native-carrier\\supervisor-cli.mjs doctor --site-root <site-root> --carrier-session-id ${carrierSessionId}`,
    automatic_repair_mutation: false,
    latest_supervisor_event_path: events[events.length - 1]?.path ?? null,
    supervisor_event_paths: events.map((entry) => entry.path),
    reconstruction: reconstruct(siteRoot, carrierSessionId),
    withheld_authorities: WITHHELD_AUTHORITIES,
    authority_non_claims: [
      'task_lifecycle_mutation_authority',
      'inbox_mutation_authority',
      'outbox_transport_authority',
      'repository_publication_authority',
      'credential_access',
      'external_site_authority',
    ],
    raw_transcript_recorded: false,
    raw_secret_values_recorded: false,
  };
}

function doctorState({ latest, blocked, registration }) {
  if (latest?.phase === 'failure') return 'failed';
  if (latest?.phase === 'interrupt' && ['requested', 'acknowledged'].includes(latest.interrupt?.status)) return 'interrupted';
  if (latest?.phase === 'close' && latest.close?.status === 'stopped') return 'stopped';
  if (latest?.phase === 'heartbeat' && ['degraded', 'stale', 'missing'].includes(latest.heartbeat_summary?.runtime_posture)) return 'degraded';
  if (latest?.state === 'running' || latest?.state === 'interrupted') return 'running';
  if (registration.status === 'configured_provider_adapter') return 'provider_configured';
  if (blocked) return 'blocked';
  return 'fixture_only';
}

function capabilityProjectionPosture({ events, readiness, registration }) {
  const statuses = events.flatMap((entry) => entry.event.capability_projection_statuses ?? []);
  const refused = statuses.find((status) => status.status === 'refused' || status.refusal_reason);
  if (refused?.refusal_reason === 'missing_consent_record') return 'blocked_missing_consent';
  if (refused?.refusal_reason === 'revoked_capability' || refused?.revocation_status === 'revoked') return 'blocked_revoked';
  if (refused?.refusal_reason === 'stale_grant' || refused?.grant_freshness_posture === 'stale') return 'blocked_stale';
  if (registration.status === 'fixture_fallback') return 'fixture_only';
  if (registration.status === 'configured_provider_adapter') return 'configured';
  if (readiness.residual_blockers.includes('missing_adapter_evidence')) return 'blocked_missing_consent';
  return registration.status ?? 'fixture_only';
}

export {
  closeSupervisedSession,
  failSupervisedSession,
  heartbeatSupervisedSession,
  interruptSupervisedSession,
  readSupervisorEvents,
  startSupervisedSession,
  supervisorDoctor,
};
