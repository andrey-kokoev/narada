import { onBeforeUnmount, ref } from 'vue';

export interface HealthIdentitySummary {
  siteId: string | null;
  agentId: string | null;
  role: string | null;
  sessionId: string | null;
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
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  let timer: ReturnType<typeof setInterval> | null = null;

  async function refresh() {
    if (!options.endpoint) {
      text.value = 'health endpoint not configured';
      return;
    }
    try {
      const response = await fetchFn(options.endpoint, { method: 'GET', cache: 'no-store', headers: projectionHeaders(options.browserToken) });
      const body = await response.json();
      identity.value = {
        siteId: stringField(body, 'site_id'),
        agentId: stringField(body, 'agent_id'),
        role: stringField(body, 'role'),
        sessionId: stringField(body, 'session_id'),
      };
      text.value = healthStatusText(body, response.status);
    } catch (error) {
      text.value = `health unavailable · ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  refresh();
  if (options.endpoint) timer = setInterval(refresh, options.intervalMs ?? 10000);
  onBeforeUnmount(() => {
    if (timer) clearInterval(timer);
  });
  return { text, identity, refresh };
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
