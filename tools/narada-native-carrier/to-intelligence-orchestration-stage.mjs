import { fixtureAdapter, sanitizeAdapterOutput } from './adapter.mjs';

async function runToIntelligenceOrchestrationStage({
  registration = null,
  readiness = null,
  packets = [],
  providerExecutor = null,
  fixtureExecutor = fixtureAdapter,
  now = new Date().toISOString(),
}) {
  const route = selectIntelligenceRoute({ registration, readiness, providerExecutor });
  if (route.mode === 'fixture_fallback') {
    return buildStageResult({
      mode: 'fixture_fallback',
      status: 'completed',
      route,
      output: fixtureExecutor({ prompt: promptSummary(packets), context: { packet_count: packets.length } }),
      now,
    });
  }

  try {
    const providerOutput = await providerExecutor({ packets, registration, readiness, now });
    if (!providerOutput || typeof providerOutput !== 'object' || Array.isArray(providerOutput)) {
      return boundedProviderProblem('malformed_output', route, now);
    }
    if (providerOutput.status === 'refused') {
      return boundedProviderProblem('provider_refusal', route, now, providerOutput.refusal_output?.reason ?? providerOutput.reason ?? null);
    }
    return buildStageResult({
      mode: 'provider_backed',
      status: 'completed',
      route,
      output: normalizeProviderOutput(providerOutput),
      now,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return boundedProviderProblem(/timeout/i.test(message) ? 'provider_timeout' : 'provider_failure', route, now);
  }
}

function selectIntelligenceRoute({ registration, readiness, providerExecutor }) {
  const providerConfigured = registration?.provider_kind && registration.provider_kind !== 'fixture';
  const providerReady = readiness?.blocked !== true && readiness?.adapter_registration_readiness?.status !== 'refused';
  if (providerConfigured && providerExecutor && providerReady) {
    return {
      mode: 'provider_backed',
      provider_kind: registration.provider_kind,
      registration_status: 'configured_provider_adapter',
      fallback_reason: null,
    };
  }
  return {
    mode: 'fixture_fallback',
    provider_kind: registration?.provider_kind ?? 'fixture',
    registration_status: registration ? 'fixture_or_unavailable' : 'missing_registration',
    fallback_reason: providerConfigured ? 'provider_not_ready_or_executor_missing' : 'fixture_registration',
  };
}

function buildStageResult({ mode, status, route, output, now }) {
  const sanitized = sanitizeAdapterOutput(output);
  return {
    schema: 'narada.narada_native_carrier.to_intelligence_stage_result.v0',
    mode,
    status,
    route,
    proposed_action_packet: sanitized.proposed_action_packet ?? inertProposalFromOutput(sanitized),
    output_summary: {
      schema: sanitized.schema ?? null,
      adapter_id: sanitized.adapter_id ?? null,
      status: sanitized.status ?? null,
      text_output_summary: sanitized.text_output_summary ?? null,
      refusal_output: sanitized.refusal_output ?? null,
      raw_output_recorded: false,
      raw_secret_values_recorded: false,
      unbounded_transcript_recorded: false,
    },
    intelligence_output_is_inert: true,
    authority_decision_performed: false,
    raw_provider_output_recorded: false,
    raw_secret_values_recorded: false,
    unbounded_transcript_recorded: false,
    recorded_at: now,
  };
}

function boundedProviderProblem(kind, route, now, reason = null) {
  return {
    schema: 'narada.narada_native_carrier.to_intelligence_stage_result.v0',
    mode: 'provider_backed',
    status: kind,
    route,
    problem: { kind, reason },
    proposed_action_packet: {
      status: 'inert_proposal',
      action_type: 'provider_problem_observation',
      payload_summary: { shape: 'object', keys: ['kind', 'reason'], values_omitted: true },
      requires_canonical_admission: true,
    },
    output_summary: {
      raw_output_recorded: false,
      raw_secret_values_recorded: false,
      unbounded_transcript_recorded: false,
    },
    intelligence_output_is_inert: true,
    authority_decision_performed: false,
    raw_provider_output_recorded: false,
    raw_secret_values_recorded: false,
    unbounded_transcript_recorded: false,
    recorded_at: now,
  };
}

function normalizeProviderOutput(output) {
  return {
    schema: output.schema ?? 'narada.narada_native_carrier.adapter_output.v0',
    adapter_id: output.adapter_id ?? 'provider',
    status: output.status ?? 'proposed',
    text_output: typeof output.text_output === 'string' ? output.text_output : null,
    refusal_output: output.refusal_output ?? null,
    proposed_action_packet: output.proposed_action_packet ?? {
      status: 'inert_proposal',
      action_type: 'provider_observation',
      payload: { summary: typeof output.text_output === 'string' ? `provider output (${output.text_output.length} chars)` : 'provider output' },
      requires_canonical_admission: true,
    },
    closeout_summary: output.closeout_summary ?? 'provider_completed_without_authority_transfer',
  };
}

function inertProposalFromOutput(output) {
  return {
    status: 'inert_proposal',
    action_type: 'observation',
    payload_summary: { shape: 'object', keys: ['status'], values_omitted: true },
    requires_canonical_admission: true,
  };
}

function promptSummary(packets) {
  return `bounded to-data packet count: ${packets.length}`;
}

export {
  runToIntelligenceOrchestrationStage,
  selectIntelligenceRoute,
};
