import { computed, ref } from 'vue';

export interface CloudflareProjectionControlConfig {
  available: boolean;
  startEndpoint: string;
  statusEndpoint: string;
  defaultApiBaseUrl?: string | null;
}

export interface ProjectionControlConfig {
  cloudflare?: CloudflareProjectionControlConfig | null;
}

export function useCloudflareProjection(control: CloudflareProjectionControlConfig | null | undefined) {
  const state = ref<'unavailable' | 'local_only' | 'registering' | 'published' | 'degraded' | 'refused'>((control?.available && control.startEndpoint) ? 'local_only' : 'unavailable');
  const message = ref(control?.available ? 'Ready to publish' : 'Cloudflare publish not available');
  const remoteUrl = ref<string | null>(null);
  const projectionId = ref<string | null>(null);

  const available = computed(() => Boolean(control?.available && control.startEndpoint));
  const busy = computed(() => state.value === 'registering');
  const defaultApiBaseUrl = computed(() => control?.defaultApiBaseUrl?.trim() || '');
  const statusText = computed(() => {
    if (remoteUrl.value && state.value === 'published') return 'Published';
    if (state.value === 'registering') return 'Registering projection...';
    if (state.value === 'degraded') return `Degraded: ${message.value}`;
    if (state.value === 'refused') return `Refused: ${message.value}`;
    return message.value;
  });

  async function publish(cloudflareApiBaseUrl: string) {
    if (!available.value || !control) return false;
    const baseUrl = cloudflareApiBaseUrl.trim();
    if (!baseUrl) {
      state.value = 'refused';
      message.value = 'Cloudflare URL is required';
      return false;
    }
    state.value = 'registering';
    message.value = 'Registering projection and starting bridge';
    remoteUrl.value = null;
    try {
      const response = await fetch(control.startEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cloudflare_api_base_url: baseUrl }),
      });
      const body = await response.json().catch(() => null) as { status?: string; reason?: string; projection_id?: string; remote_url?: string } | null;
      if (!response.ok || !body || body.status === 'refused') {
        state.value = 'refused';
        message.value = body?.reason ?? `HTTP ${response.status}`;
        return false;
      }
      projectionId.value = body.projection_id ?? null;
      remoteUrl.value = body.remote_url ?? null;
      state.value = body.status === 'degraded' ? 'degraded' : 'published';
      message.value = body.status === 'degraded' ? 'Bridge started in degraded state' : 'Remote web UI is ready';
      return true;
    } catch (error) {
      state.value = 'refused';
      message.value = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  return { available, busy, state, statusText, remoteUrl, projectionId, defaultApiBaseUrl, publish };
}
