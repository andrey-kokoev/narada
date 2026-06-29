import { onBeforeUnmount, ref } from 'vue';

export interface HealthStatusOptions {
  endpoint: string | null;
  fetchFn?: typeof fetch;
  intervalMs?: number;
}

export function useHealthStatus(options: HealthStatusOptions) {
  const text = ref(options.endpoint ? 'checking' : 'health endpoint not configured');
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  let timer: ReturnType<typeof setInterval> | null = null;

  async function refresh() {
    if (!options.endpoint) {
      text.value = 'health endpoint not configured';
      return;
    }
    try {
      const response = await fetchFn(options.endpoint, { method: 'GET', cache: 'no-store' });
      const body = await response.json();
      text.value = `${body.status ?? response.status} · ${body.agent_id ?? 'agent'} · ${body.session_id ?? 'session'}`;
    } catch (error) {
      text.value = `health unavailable · ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  refresh();
  if (options.endpoint) timer = setInterval(refresh, options.intervalMs ?? 10000);
  onBeforeUnmount(() => {
    if (timer) clearInterval(timer);
  });
  return { text, refresh };
}
