/**
 * Qualified catalog choices exposed to operator surfaces.
 *
 * The compatibility strings (`provider`, `model`, and
 * `invocation_model_key`) are display values only. Admission uses the typed
 * resource references and the capabilities resolved for the qualified
 * provider/model/offering set.
 */

import type { CapabilityKey } from './assertions.js';
import type { ResourceRef } from './ids.js';
import type { ResolvedRouteCapability } from './offerings.js';

export const INVOKABLE_INTELLIGENCE_SELECTION_CHOICES_SCHEMA =
  'narada.invokable-intelligence.selection-choices.v1' as const;

export interface IntelligenceSelectionModelChoice {
  model_ref: ResourceRef;
  model_provider: ResourceRef;
  inference_provider: ResourceRef;
  offering_refs: ResourceRef[];
  invocation_model_key: string;
  display_name?: string;
  capabilities: ResolvedRouteCapability[];
  /** Compatibility display projection; never an admission identity. */
  model?: string;
}

export interface IntelligenceSelectionProviderChoice {
  inference_provider: ResourceRef;
  models: IntelligenceSelectionModelChoice[];
  /** Compatibility display projection; never an admission identity. */
  provider?: string;
}

export interface IntelligenceSelectionChoices {
  schema: typeof INVOKABLE_INTELLIGENCE_SELECTION_CHOICES_SCHEMA;
  providers: IntelligenceSelectionProviderChoice[];
  catalog_revision?: string;
  generated_at?: string;
}

export interface IntelligenceSelectionDiagnostic {
  code:
    | 'schema-invalid'
    | 'provider-ref-invalid'
    | 'model-ref-invalid'
    | 'model-provider-ref-invalid'
    | 'inference-provider-mismatch'
    | 'offering-ref-invalid'
    | 'invocation-model-key-invalid'
    | 'capability-invalid';
  path: string;
  message: string;
}

function validRef(value: unknown, kind: ResourceRef['kind']): value is ResourceRef {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && (value as ResourceRef).kind === kind
    && typeof (value as ResourceRef).id === 'string'
    && (value as ResourceRef).id.startsWith(`${kind}:`);
}

function validCapability(value: unknown): value is ResolvedRouteCapability {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<ResolvedRouteCapability>;
  const capability = candidate.capability as Partial<CapabilityKey> | undefined;
  return Boolean(capability && typeof capability.family === 'string' && capability.family
    && typeof capability.name === 'string' && capability.name
    && typeof candidate.supported === 'boolean'
    && Array.isArray(candidate.assertion_ids)
    && Array.isArray(candidate.reasons));
}

export function validateIntelligenceSelectionChoices(
  value: unknown,
): IntelligenceSelectionDiagnostic[] {
  const diagnostics: IntelligenceSelectionDiagnostic[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [{ code: 'schema-invalid', path: '$', message: 'Selection choices must be an object.' }];
  }
  const choices = value as Partial<IntelligenceSelectionChoices>;
  if (choices.schema !== INVOKABLE_INTELLIGENCE_SELECTION_CHOICES_SCHEMA || !Array.isArray(choices.providers)) {
    diagnostics.push({ code: 'schema-invalid', path: '$', message: 'Selection choices require the versioned schema and providers array.' });
    return diagnostics;
  }
  choices.providers.forEach((provider, providerIndex) => {
    const providerPath = `$.providers[${providerIndex}]`;
    if (!validRef(provider?.inference_provider, 'inference-provider')) {
      diagnostics.push({ code: 'provider-ref-invalid', path: `${providerPath}.inference_provider`, message: 'Provider choice requires an inference-provider reference.' });
      return;
    }
    if (!Array.isArray(provider.models)) {
      diagnostics.push({ code: 'schema-invalid', path: `${providerPath}.models`, message: 'Provider choice requires a models array.' });
      return;
    }
    provider.models.forEach((model, modelIndex) => {
      const modelPath = `${providerPath}.models[${modelIndex}]`;
      if (!validRef(model?.model_ref, 'model')) diagnostics.push({ code: 'model-ref-invalid', path: `${modelPath}.model_ref`, message: 'Model choice requires a model reference.' });
      if (!validRef(model?.model_provider, 'model-provider')) diagnostics.push({ code: 'model-provider-ref-invalid', path: `${modelPath}.model_provider`, message: 'Model choice requires its publishing model-provider reference.' });
      if (!validRef(model?.inference_provider, 'inference-provider')) diagnostics.push({ code: 'provider-ref-invalid', path: `${modelPath}.inference_provider`, message: 'Model choice requires an inference-provider reference.' });
      else if (model.inference_provider.id !== provider.inference_provider.id) diagnostics.push({ code: 'inference-provider-mismatch', path: `${modelPath}.inference_provider`, message: 'Model choice provider must match its containing provider choice.' });
      if (!Array.isArray(model?.offering_refs) || model.offering_refs.length === 0 || model.offering_refs.some((ref) => !validRef(ref, 'model-offering'))) diagnostics.push({ code: 'offering-ref-invalid', path: `${modelPath}.offering_refs`, message: 'Model choice requires one or more model-offering references.' });
      if (typeof model?.invocation_model_key !== 'string' || !model.invocation_model_key.trim()) diagnostics.push({ code: 'invocation-model-key-invalid', path: `${modelPath}.invocation_model_key`, message: 'Model choice requires a service-specific invocation model key.' });
      if (!Array.isArray(model?.capabilities) || model.capabilities.some((capability) => !validCapability(capability))) diagnostics.push({ code: 'capability-invalid', path: `${modelPath}.capabilities`, message: 'Model choice capabilities must be resolved capability records.' });
    });
  });
  return diagnostics;
}

export function findIntelligenceSelectionModel(
  choices: IntelligenceSelectionChoices,
  inferenceProviderId: string,
  modelId: string,
): IntelligenceSelectionModelChoice | undefined {
  const provider = choices.providers.find(({ inference_provider }) => inference_provider.id === inferenceProviderId || inference_provider.id === `inference-provider:${inferenceProviderId}`);
  return provider?.models.find(({ model_ref }) => model_ref.id === modelId || model_ref.id === `model:${modelId}`);
}
