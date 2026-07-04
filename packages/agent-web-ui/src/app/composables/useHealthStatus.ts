import { onBeforeUnmount, ref } from 'vue';

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
}

export interface HealthStatusOptions {
  endpoint: string | null;
  browserToken?: string | null;
  fetchFn?: typeof fetch;
  intervalMs?: number;
}

export function useHealthStatus(options: HealthStatusOptions) {
  const text = ref(options.endpoint ? 'checking' : 'health endpoint not configured');
  const identity = ref<HealthIdentitySummary>({ siteId: null, agentId: null, role: null, sessionId: null });
  const intelligence = ref<HealthIntelligenceSummary>({ provider: null, model: null, thinking: null });
  const body = ref<Record<string, unknown> | null>(null);
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  let timer: ReturnType<typeof setInterval> | null = null;

  async function refresh() {
    if (!options.endpoint) {
      text.value = 'health endpoint not configured';
      return;
    }
    try {
      const response = await fetchFn(options.endpoint, { method: 'GET', cache: 'no-store', headers: projectionHeaders(options.browserToken) });
      const parsedValue = await response.json() as unknown;
      const parsed = parsedValue && typeof parsedValue === 'object' && !Array.isArray(parsedValue) ? parsedValue as Record<string, unknown> : {};
      body.value = parsed;
      identity.value = {
        siteId: stringField(parsed, 'site_id'),
        agentId: stringField(parsed, 'agent_id'),
        role: stringField(parsed, 'role'),
        sessionId: stringField(parsed, 'session_id'),
      };
      intelligence.value = {
        provider: stringField(parsed, 'provider'),
        model: stringField(parsed, 'model'),
        thinking: stringField(parsed, 'thinking'),
      };
      text.value = healthStatusText(parsed, response.status);
    } catch (error) {
      body.value = null;
      intelligence.value = { provider: null, model: null, thinking: null };
      text.value = `health unavailable · ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  refresh();
  if (options.endpoint) timer = setInterval(refresh, options.intervalMs ?? 10000);
  onBeforeUnmount(() => {
    if (timer) clearInterval(timer);
  });
  return { text, identity, intelligence, body, refresh };
}

function healthStatusText(body: Record<string, unknown>, httpStatus: number): string {
  const status = String(body.status ?? httpStatus);
  const code = stringField(body, 'code');
  const agentId = stringField(body, 'agent_id') ?? 'agent';
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
