import { onBeforeUnmount, ref } from 'vue';
import { agentIdentityDisplay } from '@narada2/agent-identity';
import type { SessionTransport } from '../../protocol/sessionTransport';

export interface HealthIdentitySummary {
  siteId: string | null;
  agentId: string | null;
  role: string | null;
  sessionId: string | null;
}

export interface HealthIntelligenceSummary {
  provider: string | null;
  model: string | null;
  thinking: string | null;
  providerChoices: readonly string[];
  modelChoices: readonly string[];
  thinkingChoices: readonly string[];
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

  async function refresh() {
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
      body.value = null;
      intelligence.value = emptyIntelligence();
      text.value = `health unavailable · ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  refresh();
  if (hasEndpoint) timer = setInterval(refresh, options.intervalMs ?? 10000);
  onBeforeUnmount(() => {
    if (timer) clearInterval(timer);
  });
  return { text, identity, intelligence, body, refresh };
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

function healthIntelligence(record: Record<string, unknown>): HealthIntelligenceSummary {
  const intelligence = objectField(record, 'intelligence');
  return {
    provider: stringField(intelligence, 'provider') ?? stringField(record, 'provider'),
    model: stringField(intelligence, 'model') ?? stringField(record, 'model'),
    thinking: stringField(intelligence, 'thinking') ?? stringField(record, 'thinking'),
    providerChoices: stringArrayField(intelligence, 'provider_choices'),
    modelChoices: stringArrayField(intelligence, 'model_choices'),
    thinkingChoices: stringArrayField(intelligence, 'thinking_choices'),
  };
}

function emptyIntelligence(): HealthIntelligenceSummary {
  return { provider: null, model: null, thinking: null, providerChoices: [], modelChoices: [], thinkingChoices: [] };
}

function stringArrayField(record: Record<string, unknown> | null, field: string): readonly string[] {
  const value = record?.[field];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
}
