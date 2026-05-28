import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sanitizeAdapterOutput } from './adapter.mjs';
import {
  inspectCapabilityMaterialForSecrets,
  resolveProviderCapabilityProjection,
} from './capability-projection.mjs';

function providerEvidencePath(siteRoot, carrierSessionId) {
  return join(siteRoot, '.narada', 'crew', 'narada-native-carrier-sessions', carrierSessionId, 'provider-adapter-invocation.json');
}

function textSummary(value) {
  return {
    present: typeof value === 'string' && value.length > 0,
    length: typeof value === 'string' ? value.length : 0,
    value_omitted: true,
  };
}

function requestSummary(input = {}) {
  return {
    prompt_summary: textSummary(input.prompt),
    context_keys: Object.keys(input.context ?? {}).sort(),
    raw_prompt_recorded: false,
    raw_secret_values_recorded: false,
    unbounded_transcript_recorded: false,
  };
}

function refusalOutput({ adapterId, reason, diagnostic }) {
  return {
    schema: 'narada.narada_native_carrier.adapter_output.v0',
    adapter_id: adapterId,
    status: 'refused',
    text_output: null,
    refusal_output: { reason, diagnostic },
    proposed_action_packet: null,
    closeout_summary: 'provider_adapter_refused_without_effect_authority',
  };
}

function normalizeProviderResponse({ adapterId, response }) {
  if (!response || typeof response !== 'object') {
    return refusalOutput({
      adapterId,
      reason: 'invalid_provider_response',
      diagnostic: 'Provider adapter returned no response object.',
    });
  }
  if (response.status === 'refused') {
    return refusalOutput({
      adapterId,
      reason: response.reason ?? response.refusal_output?.reason ?? 'provider_refused',
      diagnostic: response.diagnostic ?? null,
    });
  }
  const text = typeof response.text === 'string'
    ? response.text
    : (typeof response.text_output === 'string' ? response.text_output : '');
  return {
    schema: 'narada.narada_native_carrier.adapter_output.v0',
    adapter_id: adapterId,
    status: text ? 'proposed' : 'refused',
    text_output: text || null,
    refusal_output: text ? null : { reason: 'empty_provider_output' },
    proposed_action_packet: text
      ? {
          status: 'inert_proposal',
          action_type: response.action_type ?? 'observation',
          payload: response.proposed_payload ?? { summary: text },
          requires_canonical_admission: true,
        }
      : null,
    closeout_summary: response.closeout_summary ?? 'provider_adapter_completed_without_effect_authority',
  };
}

async function withTimeout(promise, timeoutMs) {
  if (!timeoutMs) return promise;
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('provider_adapter_timeout')), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

function makeProviderRegistry(entries = {}) {
  return new Map(Object.entries(entries));
}

async function executeProviderAdapter({
  siteRoot,
  carrierSessionId,
  registration,
  input,
  capabilityLookup,
  providerRegistry,
  timeoutMs = 30_000,
  now = new Date().toISOString(),
}) {
  const adapterId = registration?.adapter_id ?? 'provider_adapter';
  const providerKind = registration?.provider_kind ?? null;
  const capabilityRef = registration?.capability_ref ?? null;
  const registry = providerRegistry instanceof Map ? providerRegistry : makeProviderRegistry(providerRegistry ?? {});
  let output;
  let executionStatus = 'completed';
  const projectionLookup = await resolveProviderCapabilityProjection({
    registration,
    capabilityLookup,
    now,
  });

  if (!providerKind || providerKind === 'fixture') {
    output = refusalOutput({ adapterId, reason: 'provider_kind_not_configured', diagnostic: 'Provider adapter execution requires a provider_kind other than fixture.' });
    executionStatus = 'refused';
  } else {
    if (projectionLookup.status === 'refused') {
      output = refusalOutput({
        adapterId,
        reason: projectionLookup.refusal_reason,
        diagnostic: `Capability reference '${capabilityRef ?? '<missing>'}' is not invocation-admissible.`,
      });
      executionStatus = 'refused';
    } else if (!registry.has(providerKind)) {
      output = refusalOutput({ adapterId, reason: 'provider_adapter_not_registered', diagnostic: `No provider adapter registered for '${providerKind}'.` });
      executionStatus = 'refused';
    } else {
      try {
        const provider = registry.get(providerKind);
        const response = await withTimeout(Promise.resolve(provider({
          provider_kind: providerKind,
          capability_ref: capabilityRef,
          credential_ref: projectionLookup.capability_material?.credential_ref ?? null,
          credential_ref_present: projectionLookup.projection.credential_ref_present,
          capability: projectionLookup.capability_material,
          capability_projection: projectionLookup.projection,
          request: {
            prompt: input?.prompt,
            context: input?.context ?? {},
          },
        })), timeoutMs);
        output = normalizeProviderResponse({ adapterId, response });
      } catch (error) {
        const reason = error instanceof Error && error.message === 'provider_adapter_timeout'
          ? 'provider_timeout'
          : 'provider_failure';
        output = refusalOutput({ adapterId, reason, diagnostic: reason });
        executionStatus = 'refused';
      }
    }
  }

  const evidence = {
    schema: 'narada.narada_native_carrier.provider_adapter_invocation.v0',
    carrier_session_id: carrierSessionId,
    provider_kind: providerKind,
    adapter_id: adapterId,
    capability_ref: capabilityRef,
    capability_summary: {
      capability_ref: projectionLookup.projection.capability_ref,
      credential_ref_present: projectionLookup.projection.credential_ref_present,
      policy_refs: projectionLookup.projection.policy_refs ?? [],
      policy_ref_present: (projectionLookup.projection.policy_refs ?? []).length > 0,
      consent_refs: projectionLookup.projection.consent_refs ?? [],
      grant_freshness: projectionLookup.projection.grant_freshness,
      revocation_status: projectionLookup.projection.revocation_status,
      scope_summary: projectionLookup.projection.scope_summary,
      raw_capability_material_recorded: false,
    },
    capability_projection: projectionLookup.projection,
    capability_lookup_status: projectionLookup.status,
    capability_lookup_refusal_reason: projectionLookup.refusal_reason,
    request_summary: requestSummary(input),
    execution_status: executionStatus,
    timeout_ms: timeoutMs,
    output: sanitizeAdapterOutput(output),
    output_is_inert_until_admitted: true,
    canonical_admission_required: output.status === 'proposed',
    direct_task_lifecycle_mutation: false,
    direct_inbox_mutation: false,
    direct_outbox_mutation: false,
    direct_publication_mutation: false,
    credential_secret_recorded: false,
    raw_provider_output_recorded: false,
    raw_secret_values_recorded: false,
    unbounded_transcript_recorded: false,
    recorded_at: now,
  };
  const path = providerEvidencePath(siteRoot, carrierSessionId);
  mkdirSync(join(siteRoot, '.narada', 'crew', 'narada-native-carrier-sessions', carrierSessionId), { recursive: true });
  writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  return { evidence, evidence_path: path };
}

export {
  executeProviderAdapter,
  inspectCapabilityMaterialForSecrets,
  makeProviderRegistry,
  normalizeProviderResponse,
  providerEvidencePath,
  requestSummary,
};
