import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { SiteRegistryRelationTransitionInput } from '@narada2/site-registry-cloudflare';
import type { ExitCode } from '../lib/exit-codes.js';
import { ExitCode as Code } from '../lib/exit-codes.js';

export interface SiteRegistryRelationPlanTransitionOptions {
  payloadFile?: string;
  registryUrl?: string;
  credentialRef?: string;
}

export async function siteRegistryRelationPlanTransitionCommand(
  options: SiteRegistryRelationPlanTransitionOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  if (!options.payloadFile) {
    return failure('site_registry_relation_plan_payload_missing', ['payload_file_required']);
  }

  const payload = readJsonFile<Partial<SiteRegistryRelationTransitionInput> & {
    credential_ref?: string;
    registry_url?: string;
  }>(options.payloadFile);
  const registryUrl = options.registryUrl ?? payload.registry_url ?? null;
  const credentialRef = options.credentialRef ?? payload.credential_ref ?? null;
  const validation = validateRelationTransitionPayload(payload);
  const refusals = validation.ok ? [] : [...validation.refusals];

  if (containsRawSecretMarker(payload) || containsRawSecretMarker(credentialRef)) {
    refusals.push('site_registry_relation_plan_contains_raw_secret_marker');
  }
  if (!registryUrl) refusals.push('site_registry_relation_registry_url_required');
  if (!credentialRef) refusals.push('site_registry_relation_credential_ref_required_for_live_publish');

  const transitionPayload = validation.ok ? validation.value : payload;
  const payloadDigest = createHash('sha256').update(stableJson(transitionPayload)).digest('hex');

  return {
    exitCode: refusals.length === 0 ? Code.SUCCESS : Code.GENERAL_ERROR,
    result: {
      schema: 'narada.site_registry.relation_transition_plan.v0',
      status: refusals.length === 0 ? 'planned' : 'refused',
      mutation_performed: false,
      dry_run: true,
      live_network_performed: false,
      credential_resolution: {
        credential_ref: credentialRef,
        resolved: false,
        posture: 'not_resolved_in_dry_run',
        raw_secret_values_recorded: false,
      },
      registry_url: registryUrl,
      transition_payload_digest: `sha256:${payloadDigest}`,
      transition_preview: validation.ok ? {
        event_id: validation.value.event_id,
        idempotency_key: validation.value.idempotency_key,
        registry_id: validation.value.registry_id,
        relation_id: validation.value.relation_id,
        site_id: validation.value.site_id,
        subject_site_id: validation.value.subject_site_id ?? validation.value.site_id,
        relation_kind: validation.value.relation_kind,
        transition: validation.value.transition,
        from_state: validation.value.from_state ?? null,
        to_state: validation.value.to_state,
        from_visibility: validation.value.from_visibility ?? null,
        to_visibility: validation.value.to_visibility,
        actor: validation.value.actor,
        capability_ref: validation.value.capability_ref,
        evidence_refs: validation.value.evidence_refs,
      } : null,
      capability_ref: typeof payload.capability_ref === 'string' ? payload.capability_ref : null,
      authority_limits: [
        'relation_transition_is_registry_projection_state',
        'transition_does_not_mutate_site_authority',
        'transition_does_not_grant_capability',
        'dry_run_does_not_resolve_raw_secret',
        'live_publish_requires_registry_owner_capability',
      ],
      refusals,
      required_live_command: refusals.length === 0
        ? 'narada site-registry relation publish-transition --live --payload-file <file>'
        : null,
    },
  };
}

function failure(error: string, reasons: string[]): { exitCode: ExitCode; result: unknown } {
  return {
    exitCode: Code.GENERAL_ERROR,
    result: {
      schema: 'narada.site_registry.relation_transition_plan.v0',
      status: 'refused',
      error,
      refusals: reasons,
      mutation_performed: false,
      live_network_performed: false,
      raw_secret_values_recorded: false,
    },
  };
}

function readJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function containsRawSecretMarker(value: unknown): boolean {
  if (typeof value === 'string') {
    return /(bearer\s+[a-z0-9._-]+|token\s*[:=]\s*['"]?[a-z0-9._-]{8,}|secret\s*[:=]\s*['"]?[a-z0-9._-]{8,})/i.test(value);
  }
  if (Array.isArray(value)) return value.some(containsRawSecretMarker);
  if (value && typeof value === 'object') return Object.values(value).some(containsRawSecretMarker);
  return false;
}

function validateRelationTransitionPayload(
  payload: Partial<SiteRegistryRelationTransitionInput> & { transition?: string; to_state?: string; to_visibility?: string },
): { ok: true; value: SiteRegistryRelationTransitionInput } | { ok: false; refusals: string[] } {
  const refusals: string[] = [];
  const transitionValue = String(payload.transition ?? 'missing');
  const stateValue = String(payload.to_state ?? 'missing');
  const visibilityValue = String(payload.to_visibility ?? 'missing');
  const actor = payload.actor as { kind?: unknown; site_id?: unknown } | undefined;
  const transitionAllowed = ['activate', 'withdraw', 'retire', 'suppress', 'unsuppress', 'reject', 'reactivate'].includes(transitionValue);

  if (!payload.event_id) refusals.push('site_registry_relation_event_id_required');
  if (!payload.idempotency_key) refusals.push('site_registry_relation_idempotency_key_required');
  if (!payload.registry_id) refusals.push('site_registry_relation_registry_id_required');
  if (!payload.relation_id) refusals.push('site_registry_relation_id_required');
  if (!payload.site_id) refusals.push('site_registry_relation_site_id_required');
  if (!payload.relation_kind) refusals.push('site_registry_relation_kind_required');
  if (!transitionAllowed) refusals.push(`site_registry_relation_transition_unsupported:${transitionValue}`);
  if (transitionValue === 'purge' || transitionValue === 'delete') refusals.push('site_registry_relation_purge_not_supported');
  if (!['candidate', 'active', 'withdrawn', 'retired', 'rejected', 'superseded'].includes(stateValue)) {
    refusals.push(`site_registry_relation_to_state_invalid:${stateValue}`);
  }
  if (!['public', 'private', 'suppressed'].includes(visibilityValue)) {
    refusals.push(`site_registry_relation_to_visibility_invalid:${visibilityValue}`);
  }
  if (!actor || typeof actor !== 'object') refusals.push('site_registry_relation_actor_required');
  if (actor && !['site', 'registry_owner', 'operator', 'system'].includes(String(actor.kind))) {
    refusals.push(`site_registry_relation_actor_kind_invalid:${String(actor.kind ?? 'missing')}`);
  }
  if (!payload.capability_ref) refusals.push('site_registry_relation_capability_ref_required');
  if (!payload.occurred_at) refusals.push('site_registry_relation_occurred_at_required');
  if (!Array.isArray(payload.reason_codes) || payload.reason_codes.length === 0) {
    refusals.push('site_registry_relation_reason_codes_required');
  }
  if (!Array.isArray(payload.evidence_refs) || payload.evidence_refs.length === 0) {
    refusals.push('site_registry_relation_evidence_refs_required');
  }
  if (containsRawSecretMarker(payload.reason_codes) || containsRawSecretMarker(payload.evidence_refs)) {
    refusals.push('site_registry_relation_payload_contains_raw_secret_marker');
  }
  if (payload.transition === 'withdraw' && (actor?.kind !== 'site' || actor.site_id !== payload.site_id)) {
    refusals.push('site_registry_relation_withdraw_requires_matching_site_actor');
  }
  if (['activate', 'retire', 'suppress', 'unsuppress', 'reject', 'reactivate'].includes(String(payload.transition))
    && !['registry_owner', 'operator'].includes(String(actor?.kind))) {
    refusals.push('site_registry_relation_admin_transition_requires_registry_owner_actor');
  }

  if (refusals.length > 0) return { ok: false, refusals };
  return { ok: true, value: payload as SiteRegistryRelationTransitionInput };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
