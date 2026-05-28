import { operationalReadiness } from './readiness.mjs';
import { supervisorDoctor } from './supervisor.mjs';

const NARADA_NATIVE_DOCTOR_COMMAND_SCHEMA = 'narada.narada_native_carrier.doctor_command.v0';

function buildNaradaNativeDoctorCommand({
  siteRoot,
  carrierSessionId,
  format = 'json',
} = {}) {
  const doctor = supervisorDoctor(siteRoot, carrierSessionId);
  const readiness = operationalReadiness(siteRoot, carrierSessionId);
  const payload = compactDoctorPayload({ doctor, readiness, carrierSessionId });
  if (format === 'human') {
    return {
      status: 'success',
      format: 'human',
      output: renderNaradaNativeDoctorHuman(payload),
      raw_transcript_recorded: false,
      raw_prompt_recorded: false,
      raw_provider_output_recorded: false,
      raw_secret_values_recorded: false,
    };
  }
  return {
    status: 'success',
    format: 'json',
    result: payload,
    raw_transcript_recorded: false,
    raw_prompt_recorded: false,
    raw_provider_output_recorded: false,
    raw_secret_values_recorded: false,
  };
}

function compactDoctorPayload({ doctor, readiness, carrierSessionId }) {
  const consent = readiness.capability_consent_reconstruction ?? {};
  const latestEvidenceRefs = boundedEvidenceRefs(readiness.latest_evidence_refs);
  return {
    schema: NARADA_NATIVE_DOCTOR_COMMAND_SCHEMA,
    carrier_session_id: carrierSessionId,
    runtime_posture: doctor.runtime_state,
    provider_posture: doctor.provider_posture,
    data_posture: readiness.residual_blockers.length > 0 ? 'blocked' : 'ready',
    consent_posture: consentPosture(consent),
    adapter_posture: readiness.adapter_posture,
    capability_posture: readiness.capability_posture,
    blocked: doctor.blocked === true,
    blocked_reasons: boundedStringArray(doctor.residual_blockers),
    state_markers: stateMarkers({ doctor, readiness }),
    latest_evidence_refs: latestEvidenceRefs,
    reconstruction_status: {
      status: readiness.reconstruction ? 'available' : 'missing',
      launch_present: Boolean(readiness.reconstruction?.launch),
      adapter_present: Boolean(readiness.reconstruction?.adapter),
      proposal_present: Boolean(readiness.reconstruction?.proposal),
      closeout_present: Boolean(readiness.reconstruction?.closeout),
      handoff_artifact_count: readiness.handoff_artifacts?.length ?? 0,
      direct_sqlite_inspection_required: readiness.reconstruction?.direct_sqlite_inspection_required === true,
      direct_secret_store_inspection_required: readiness.reconstruction?.direct_secret_store_inspection_required === true,
    },
    next_diagnostic_command: doctor.next_diagnostic_command,
    authority_non_claims: boundedStringArray(doctor.authority_non_claims),
    automatic_repair_mutation: false,
    output_authority: 'bounded_projection_not_task_truth',
    raw_transcript_recorded: false,
    raw_prompt_recorded: false,
    raw_provider_output_recorded: false,
    raw_secret_values_recorded: false,
    values_omitted: true,
  };
}

function consentPosture(consent) {
  if (!consent || typeof consent !== 'object') return 'unknown';
  if (consent.projection_count > 0 && consent.projections?.some((projection) => projection.refusal_reason)) {
    return 'blocked';
  }
  if (consent.projection_count > 0) return 'projected';
  return 'not_projected';
}

function stateMarkers({ doctor, readiness }) {
  const markers = new Set([
    doctor.runtime_state,
    doctor.adapter_state,
    doctor.provider_posture,
    readiness.adapter_registration_readiness?.status,
  ].filter(Boolean));
  if (doctor.blocked) markers.add('blocked');
  if (doctor.runtime_state === 'running') markers.add('live_running');
  if (doctor.runtime_state === 'failed') markers.add('failed');
  if (doctor.runtime_state === 'stopped') markers.add('stopped');
  if (doctor.provider_posture === 'fixture_fallback') markers.add('fixture_only');
  if (doctor.provider_posture === 'provider_configured') {
    markers.add('provider_backed');
    markers.add('configured');
  }
  return [...markers].sort();
}

function renderNaradaNativeDoctorHuman(payload) {
  const refs = payload.latest_evidence_refs.map((ref) => `${ref.name}=${ref.ref}`).join(', ') || 'none';
  const blockers = payload.blocked_reasons.join(', ') || 'none';
  return [
    `session: ${payload.carrier_session_id}`,
    `runtime: ${payload.runtime_posture}`,
    `provider: ${payload.provider_posture}`,
    `data: ${payload.data_posture}`,
    `consent: ${payload.consent_posture}`,
    `blocked: ${payload.blocked}`,
    `blocked reasons: ${blockers}`,
    `reconstruction: ${payload.reconstruction_status.status}`,
    `latest evidence: ${refs}`,
    `next: ${payload.next_diagnostic_command}`,
    'authority: bounded_projection_not_task_truth',
  ].join('\n');
}

function boundedEvidenceRefs(refs) {
  if (!refs || typeof refs !== 'object' || Array.isArray(refs)) return [];
  return Object.entries(refs)
    .filter(([name, ref]) => typeof name === 'string' && typeof ref === 'string' && !SECRET_VALUE_PATTERN.test(ref))
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, 20)
    .map(([name, ref]) => ({
      name: name.slice(0, 120),
      ref: ref.slice(0, 300),
      values_omitted: true,
    }));
}

function boundedStringArray(values) {
  return Array.isArray(values)
    ? values.filter((value) => typeof value === 'string' && !SECRET_VALUE_PATTERN.test(value)).map((value) => value.slice(0, 200)).slice(0, 40)
    : [];
}

const SECRET_VALUE_PATTERN = /(-----BEGIN [A-Z ]*PRIVATE KEY-----|Bearer\s+[A-Za-z0-9._~+/=-]{12,}|sk-[A-Za-z0-9_-]{12,})/i;

export {
  NARADA_NATIVE_DOCTOR_COMMAND_SCHEMA,
  buildNaradaNativeDoctorCommand,
  compactDoctorPayload,
  renderNaradaNativeDoctorHuman,
};
