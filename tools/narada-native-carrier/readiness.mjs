import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readRegistration, registrationReadiness } from './adapter-registration.mjs';

function sessionDir(siteRoot, carrierSessionId) {
  return join(siteRoot, '.narada', 'crew', 'narada-native-carrier-sessions', carrierSessionId);
}

function readIfExists(path) {
  if (typeof path !== 'string' || path.length === 0) return null;
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

function reconstruct(siteRoot, carrierSessionId) {
  const dir = sessionDir(siteRoot, carrierSessionId);
  const files = existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith('.json')) : [];
  const refs = Object.fromEntries(files.map((name) => [name.replace(/\.json$/, ''), join(dir, name)]));
  const orderedEvents = orderedSessionEvents(refs);
  return {
    schema: 'narada.narada_native_carrier.reconstruction.v0',
    carrier_session_id: carrierSessionId,
    evidence_refs: refs,
    event_order: orderedEvents.map((event) => event.evidence_ref),
    ordered_events: orderedEvents,
    latest_posture_summary: latestPostureSummary(orderedEvents),
    wrapper_evidence_refs: wrapperEvidenceRefs(refs),
    wrapper_evidence_summaries: wrapperEvidenceSummaries(refs),
    handoff_artifacts: reconstructHandoffArtifacts(refs),
    launch: readIfExists(refs.start ?? refs['supervisor-start']),
    supervisor_events: orderedEvents.filter((event) => event.name.startsWith('supervisor-')),
    adapter: readIfExists(refs['adapter-invocation'] ?? refs['provider-adapter-invocation']),
    proposal: readIfExists(refs['work-loop-handoff']),
    interrupt: readIfExists(refs['work-loop-interrupt'] ?? refs['supervisor-interrupt']),
    closeout: readIfExists(refs['work-loop-closeout'] ?? refs.close ?? refs['supervisor-close']),
    failure: readIfExists(refs['supervisor-failure']),
    supervisor_control: supervisorControlReconstruction(refs),
    capability_consent_reconstruction: capabilityConsentReconstruction(refs),
    direct_sqlite_inspection_required: false,
    direct_secret_store_inspection_required: false,
  };
}

function orderedSessionEvents(refs) {
  return Object.entries(refs)
    .map(([name, path]) => {
      const record = readIfExists(path);
      return {
        name,
        evidence_ref: path,
        schema: record?.schema ?? null,
        phase: record?.phase ?? null,
        state: record?.state ?? null,
        recorded_at: record?.recorded_at ?? record?.session?.created_at ?? null,
        runtime_posture: record?.heartbeat_summary?.runtime_posture ?? null,
        control_status: record?.interrupt?.status ?? record?.close?.status ?? record?.failure?.reason_class ?? null,
        raw_prompt_recorded: false,
        raw_provider_output_recorded: false,
        raw_transcript_recorded: false,
        raw_secret_values_recorded: false,
        values_omitted: true,
      };
    })
    .sort((a, b) => {
      const timeCompare = comparableTime(a.recorded_at).localeCompare(comparableTime(b.recorded_at));
      return timeCompare === 0 ? a.name.localeCompare(b.name) : timeCompare;
    });
}

function comparableTime(value) {
  return typeof value === 'string' && value.length > 0 ? value : '9999-12-31T23:59:59.999Z';
}

function latestPostureSummary(orderedEvents) {
  const latest = [...orderedEvents].reverse().find((event) => event.recorded_at) ?? orderedEvents[orderedEvents.length - 1] ?? null;
  if (!latest) {
    return {
      status: 'missing',
      latest_event_ref: null,
      latest_phase: null,
      latest_state: null,
      runtime_posture: null,
      values_omitted: true,
    };
  }
  return {
    status: latest.runtime_posture ?? latest.state ?? latest.control_status ?? 'unknown',
    latest_event_ref: latest.evidence_ref,
    latest_phase: latest.phase,
    latest_state: latest.state,
    runtime_posture: latest.runtime_posture,
    control_status: latest.control_status,
    values_omitted: true,
  };
}

function supervisorControlReconstruction(refs) {
  const interrupt = readIfExists(refs['supervisor-interrupt']);
  const close = readIfExists(refs['supervisor-close']);
  const failure = readIfExists(refs['supervisor-failure']);
  return {
    schema: 'narada.narada_native_carrier.supervisor_control_reconstruction.v0',
    interrupt: interrupt ? {
      status: interrupt.interrupt?.status ?? null,
      state: interrupt.state ?? null,
      evidence_ref: refs['supervisor-interrupt'],
      raw_diagnostics_recorded: false,
      values_omitted: true,
    } : null,
    close: close ? {
      status: close.close?.status ?? close.state ?? null,
      authority_transfer: false,
      evidence_ref: refs['supervisor-close'],
      raw_diagnostics_recorded: false,
      values_omitted: true,
    } : null,
    failure: failure ? {
      reason_class: failure.failure?.reason_class ?? null,
      terminal: failure.failure?.terminal === true,
      evidence_ref: refs['supervisor-failure'],
      raw_stdout_recorded: false,
      raw_stderr_recorded: false,
      raw_transcript_recorded: false,
      raw_provider_output_recorded: false,
      raw_secret_values_recorded: false,
      values_omitted: true,
    } : null,
    authority_transfer: false,
  };
}

function wrapperEvidenceRefs(refs) {
  return Object.fromEntries(Object.entries(refs).filter(([name]) => (
    name.includes('canonical-task-report-draft')
    || name.includes('to-data-stage')
    || name.includes('to-intelligence-stage')
    || name.includes('orchestration')
    || name.startsWith('supervisor-')
  )));
}

function wrapperEvidenceSummaries(refs) {
  return Object.entries(wrapperEvidenceRefs(refs)).map(([name, path]) => {
    const record = readIfExists(path);
    return {
      name,
      path,
      schema: record?.schema ?? null,
      status: record?.status ?? null,
      mode: record?.mode ?? null,
      stage_statuses_present: Boolean(record?.stage_statuses),
      raw_prompt_recorded: false,
      raw_provider_output_recorded: false,
      raw_transcript_recorded: false,
      raw_secret_values_recorded: false,
      values_omitted: true,
    };
  });
}

function capabilityConsentReconstruction(refs) {
  const launch = readIfExists(refs.start);
  const adapter = readIfExists(refs['provider-adapter-invocation']);
  const projectionStatuses = launch?.session?.capability_projection_statuses
    ?? launch?.capability_projection_statuses
    ?? [];
  const adapterProjection = adapter?.capability_projection ? [adapter.capability_projection] : [];
  const projections = [...projectionStatuses, ...adapterProjection].map((projection) => ({
    capability_ref: projection.capability_ref ?? null,
    capability_kind: projection.capability_kind ?? null,
    status: projection.status ?? projection.projection_state ?? adapter?.capability_lookup_status ?? null,
    refusal_reason: projection.refusal_reason ?? null,
    credential_ref_present: projection.credential_ref_present === true,
    consent_ref_present: projection.consent_ref_present === true
      || Boolean(projection.consent_ref)
      || (Array.isArray(projection.consent_refs) && projection.consent_refs.length > 0),
    grant_freshness_posture: projection.grant_freshness_posture ?? projection.grant_freshness?.posture ?? null,
    revocation_status: projection.revocation_status ?? null,
    raw_secret_values_recorded: false,
    values_omitted: true,
  }));
  return {
    schema: 'narada.narada_native_carrier.capability_consent_reconstruction.v0',
    projection_count: projections.length,
    projections,
    direct_secret_store_inspection_required: false,
    raw_secret_values_recorded: false,
    residuals: [
      {
        owner: 'canonical_capability_governed_secret_management',
        residual: 'credential_secret_resolution_and_rotation_not_reconstructed_by_carrier',
      },
    ],
  };
}

function adapterEvidenceResiduals(adapterEvidence) {
  if (!adapterEvidence) {
    return ['missing_adapter_evidence'];
  }
  const output = adapterEvidence.output ?? {};
  const input = adapterEvidence.input_summary ?? {};
  const residuals = [];
  if (input.raw_secret_values_recorded || output.raw_secret_values_recorded) {
    residuals.push('adapter_evidence_records_raw_secret_values');
  }
  if (input.unbounded_transcript_recorded || output.unbounded_transcript_recorded) {
    residuals.push('adapter_evidence_records_unbounded_transcript');
  }
  if (output.raw_output_recorded) {
    residuals.push('adapter_evidence_records_raw_output');
  }
  return residuals;
}

function operationalReadiness(siteRoot, carrierSessionId) {
  const reconstructed = reconstruct(siteRoot, carrierSessionId);
  const adapterRegistration = registrationReadiness(readRegistration(siteRoot));
  const residualBlockers = [
    ...adapterEvidenceResiduals(reconstructed.adapter),
    ...(adapterRegistration.status === 'refused' ? [`adapter_registration_${adapterRegistration.capability_posture}`] : []),
    ...(reconstructed.closeout ? [] : ['missing_closeout_evidence']),
  ];
  return {
    schema: 'narada.narada_native_carrier.operational_readiness.v0',
    carrier_session_id: carrierSessionId,
    runtime_boundary_ref: 'docs/product/narada-native-carrier-runtime-boundary.v0.json',
    adapter_posture: reconstructed.adapter
      ? (reconstructed.adapter.schema === 'narada.narada_native_carrier.provider_adapter_invocation.v0'
          ? 'provider_adapter_invoked'
          : 'fixture_adapter_invoked')
      : 'missing_adapter_evidence',
    capability_posture: 'facade_only',
    adapter_registration_readiness: adapterRegistration,
    latest_evidence_refs: reconstructed.evidence_refs,
    residual_blockers: residualBlockers,
    authority_non_claims: [
      'task_lifecycle_mutation_authority',
      'inbox_mutation_authority',
      'outbox_transport_authority',
      'repository_publication_authority',
      'credential_access',
      'native_shell_authority',
    ],
    commands: {
      launch: 'node tools\\narada-native-carrier\\harness.test.mjs',
      inspect: 'node --test tools\\narada-native-carrier\\readiness.test.mjs',
      interrupt: 'inspect work-loop-interrupt.json evidence',
      close: 'inspect work-loop-closeout.json evidence',
      reconstruct: 'reconstruct(siteRoot, carrierSessionId)',
    },
    reconstruction: reconstructed,
    handoff_artifacts: reconstructed.handoff_artifacts,
    capability_consent_reconstruction: reconstructed.capability_consent_reconstruction,
  };
}

function reconstructHandoffArtifacts(refs) {
  return Object.entries(refs)
    .filter(([name]) => name.endsWith('-handoff-payload'))
    .map(([name, path]) => {
      const payload = readIfExists(path);
      const family = handoffFamilyFromName(name);
      return {
        artifact_id: `handoff:${family}:${name}`,
        family,
        status: payload?.status ?? null,
        payload_ref: path,
        task_number: typeof payload?.task_number === 'number' ? payload.task_number : null,
        envelope_kind: typeof payload?.envelope_kind === 'string' ? payload.envelope_kind : null,
        side_effect_class: typeof payload?.side_effect_class === 'string' ? payload.side_effect_class : null,
        requires_canonical_admission: true,
        direct_mutation_performed: payload?.direct_mutation_performed === true
          || payload?.direct_task_lifecycle_mutation === true
          || payload?.direct_inbox_database_write === true
          || payload?.process_spawned === true
          ? true
          : false,
        raw_transcript_recorded: false,
        raw_prompt_recorded: false,
        raw_provider_output_recorded: false,
        raw_secret_values_recorded: false,
        values_omitted: true,
      };
    })
    .sort((a, b) => a.family.localeCompare(b.family));
}

function handoffFamilyFromName(name) {
  if (name.startsWith('task-report-')) return 'task_report';
  if (name.startsWith('inbox-')) return 'inbox';
  if (name.startsWith('command-intent-')) return 'command_intent';
  if (name.startsWith('outbox-intent-')) return 'outbox_intent';
  if (name.startsWith('repository-publication-')) return 'repository_publication';
  return 'unknown';
}

export { adapterEvidenceResiduals, operationalReadiness, reconstruct };
