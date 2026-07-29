import { onBeforeUnmount, ref } from 'vue';
import { agentIdentityDisplay } from '@narada2/agent-identity';
import type { SessionTransport } from '../../protocol/sessionTransport';

export interface HealthIdentitySummary {
  siteId: string | null;
  agentId: string | null;
  role: string | null;
  sessionId: string | null;
}

export interface IntelligenceModelChoice {
  model: string;
  modelRef?: string | null;
  modelProvider?: string | null;
  offeringRefs?: readonly string[];
  invocationModelKey?: string | null;
  capabilities?: readonly IntelligenceCapabilityChoice[];
  thinkingChoices: readonly string[];
}

export interface IntelligenceCapabilityChoice {
  family: string;
  name: string;
  supported: boolean;
  allowedValues?: readonly string[];
}

export interface IntelligenceProviderChoice {
  provider: string;
  models: readonly IntelligenceModelChoice[];
}

export interface HealthIntelligenceSummary {
  provider: string | null;
  model: string | null;
  modelRef?: string | null;
  thinking: string | null;
  providerChoices: readonly string[];
  modelChoices: readonly string[];
  thinkingChoices: readonly string[];
  selectionChoices: readonly IntelligenceProviderChoice[];
}

export interface HealthStatusOptions {
  endpoint: string | null;
  browserToken?: string | null;
  transport?: Pick<SessionTransport, 'healthEndpoint' | 'requestHealth'>;
  fetchFn?: typeof fetch;
  intervalMs?: number;
}

export function useHealthStatus(options: HealthStatusOptions) {
  const hasEndpoint = Boolean(options.transport?.healthEndpoint ?? options.endpoint);
  const text = ref(hasEndpoint ? 'checking' : 'health endpoint not configured');
  const identity = ref<HealthIdentitySummary>({ siteId: null, agentId: null, role: null, sessionId: null });
  const intelligence = ref<HealthIntelligenceSummary>(emptyIntelligence());
  const body = ref<Record<string, unknown> | null>(null);
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  async function refresh() {
    if (stopped) return;
    if (!hasEndpoint) {
      text.value = 'health endpoint not configured';
      return;
    }
    try {
      const response = await (options.transport?.requestHealth(fetchFn)
        ?? (options.endpoint
          ? fetchFn(options.endpoint, { method: 'GET', cache: 'no-store', headers: projectionHeaders(options.browserToken) })
          : null));
      if (!response) {
        text.value = 'health endpoint not configured';
        return;
      }
      const parsedValue = await response.json() as unknown;
      if (stopped) return;
      const parsed = parsedValue && typeof parsedValue === 'object' && !Array.isArray(parsedValue) ? parsedValue as Record<string, unknown> : {};
      body.value = parsed;
      const displayAgentId = agentIdentityDisplay(objectField(parsed, 'agent_identity_ref'), stringField(parsed, 'agent_id'));
      identity.value = {
        siteId: stringField(parsed, 'site_id'),
        agentId: displayAgentId,
        role: stringField(parsed, 'role'),
        sessionId: stringField(parsed, 'session_id'),
      };
      intelligence.value = healthIntelligence(parsed);
      text.value = healthStatusText(parsed, response.status);
    } catch (error) {
      // Preserve the last successful snapshot across transient polling failures.
      // Consumers use the structured snapshot for topology severity; clearing it
      // here would briefly turn a still-attached runtime into "unavailable".
      if (stopped) return;
      text.value = `health unavailable · ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  function stop() {
    stopped = true;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  refresh();
  if (hasEndpoint) timer = setInterval(refresh, options.intervalMs ?? 10000);
  onBeforeUnmount(stop);
  return { text, identity, intelligence, body, refresh, stop };
}

function healthStatusText(body: Record<string, unknown>, httpStatus: number): string {
  const status = String(body.status ?? httpStatus);
  const code = stringField(body, 'code');
  const agentId = agentIdentityDisplay(objectField(body, 'agent_identity_ref'), stringField(body, 'agent_id')) ?? 'agent';
  const sessionId = stringField(body, 'session_id') ?? 'session';
  return [status, code, agentId, sessionId].filter(Boolean).join(' · ');
}

function projectionHeaders(browserToken: string | null | undefined): Record<string, string> {
  return browserToken ? { 'x-narada-browser-token-fingerprint': browserToken } : {};
}

function stringField(record: unknown, field: string): string | null {
  if (!record || typeof record !== 'object') return null;
  const value = (record as Record<string, unknown>)[field];
  return typeof value === 'string' && value ? value : null;
}

function objectField(record: unknown, field: string): Record<string, unknown> | null {
  if (!record || typeof record !== 'object') return null;
  const value = (record as Record<string, unknown>)[field];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function healthIntelligence(record: Record<string, unknown>): HealthIntelligenceSummary {
  const intelligence = objectField(record, 'intelligence');
  const kernel = objectField(intelligence, 'kernel');
  const latestPlan = objectField(intelligence, 'latest_plan');
  const latestPlanOptions = objectField(latestPlan, 'options');
  return {
    provider: stringField(intelligence, 'provider')
      ?? stringField(kernel, 'provider')
      ?? stringField(record, 'provider')
      ?? resourceIdField(latestPlan, 'inference_provider', 'inference-provider:'),
    model: stringField(intelligence, 'model')
      ?? stringField(kernel, 'model')
      ?? stringField(record, 'model')
      ?? resourceIdField(latestPlan, 'model', 'model:'),
    modelRef: resourceIdField(latestPlan, 'model', 'model:'),
    thinking: stringField(intelligence, 'thinking')
      ?? stringField(kernel, 'thinking')
      ?? stringField(record, 'thinking')
      ?? stringField(latestPlanOptions, 'thinking'),
    providerChoices: stringArrayField(intelligence, 'provider_choices'),
    modelChoices: stringArrayField(intelligence, 'model_choices'),
    thinkingChoices: stringArrayField(intelligence, 'thinking_choices'),
    selectionChoices: selectionChoicesField(intelligence?.selection_choices),
  };
}

function resourceIdField(record: Record<string, unknown> | null, field: string, prefix: string): string | null {
  const value = objectField(record, field);
  const id = stringField(value, 'id');
  return id?.startsWith(prefix) ? id.slice(prefix.length) : id;
}

function emptyIntelligence(): HealthIntelligenceSummary {
  return {
    provider: null,
    model: null,
    thinking: null,
    providerChoices: [],
    modelChoices: [],
    thinkingChoices: [],
    selectionChoices: [],
  };
}

function stringArrayField(record: Record<string, unknown> | null, field: string): readonly string[] {
  const value = record?.[field];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
}

function selectionChoicesField(value: unknown): readonly IntelligenceProviderChoice[] {
  const providers = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>).providers
      : null;
  if (!Array.isArray(providers)) return [];
  return providers.flatMap((provider): IntelligenceProviderChoice[] => {
    if (!provider || typeof provider !== 'object' || Array.isArray(provider)) return [];
    const providerRecord = provider as Record<string, unknown>;
    const providerId = resourceStringField(providerRecord, 'provider', 'inference-provider:')
      ?? resourceStringField(providerRecord, 'inference_provider', 'inference-provider:');
    const models = providerRecord.models;
    if (!providerId || !Array.isArray(models)) return [];
    return [{
      provider: providerId,
      models: models.flatMap((model): IntelligenceModelChoice[] => {
        if (!model || typeof model !== 'object' || Array.isArray(model)) return [];
        const modelRecord = model as Record<string, unknown>;
        const modelId = resourceStringField(modelRecord, 'model', 'model:')
          ?? resourceStringField(modelRecord, 'invocation_model_key', '');
        if (!modelId) return [];
        const modelRef = resourceStringField(modelRecord, 'model_ref', 'model:');
        const modelProvider = resourceStringField(modelRecord, 'model_provider', 'model-provider:');
        const offeringRefs = Array.isArray(modelRecord.offering_refs)
          ? modelRecord.offering_refs.flatMap((ref) => {
            const id = resourceStringField({ ref }, 'ref', 'model-offering:');
            return id ? [`model-offering:${id}`] : [];
          })
          : [];
        const capabilities = Array.isArray(modelRecord.capabilities)
          ? modelRecord.capabilities.flatMap((capability): IntelligenceCapabilityChoice[] => {
            if (!capability || typeof capability !== 'object' || Array.isArray(capability)) return [];
            const capabilityRecord = capability as Record<string, unknown>;
            const key = objectField(capabilityRecord, 'capability');
            const family = stringField(key, 'family');
            const name = stringField(key, 'name');
            if (!family || !name || typeof capabilityRecord.supported !== 'boolean') return [];
            return [{
              family,
              name,
              supported: capabilityRecord.supported,
              ...(Array.isArray(capabilityRecord.allowed_values)
                ? { allowedValues: capabilityRecord.allowed_values.filter((value): value is string => typeof value === 'string') }
                : {}),
            }];
          })
          : [];
        const explicitThinkingChoices = stringArrayField(modelRecord, 'thinking_choices');
        const capabilityThinkingChoices = capabilities.find((capability) => (
          capability.family === 'thinking' && capability.name === 'levels'
        ))?.allowedValues ?? [];
        return [{
          model: stringField(modelRecord, 'invocation_model_key') ?? modelId,
          ...(modelRef ? { modelRef } : {}),
          ...(modelProvider ? { modelProvider } : {}),
          ...(offeringRefs.length ? { offeringRefs } : {}),
          ...(stringField(modelRecord, 'invocation_model_key') ? { invocationModelKey: stringField(modelRecord, 'invocation_model_key') } : {}),
          ...(capabilities.length ? { capabilities } : {}),
          thinkingChoices: explicitThinkingChoices.length ? explicitThinkingChoices : capabilityThinkingChoices,
        }];
      }),
    }];
  });
}

function resourceStringField(record: Record<string, unknown>, field: string, prefix: string): string | null {
  const direct = stringField(record, field);
  if (direct) return direct.startsWith(prefix) ? direct.slice(prefix.length) : direct;
  const resource = objectField(record, field);
  const id = stringField(resource, 'id');
  return id?.startsWith(prefix) ? id.slice(prefix.length) : id;
}