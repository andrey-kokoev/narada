import { computed, onMounted, ref, type ComputedRef, type Ref } from 'vue';
import type { HostFleetHost, HostFleetRuntimeReadiness } from '@narada-core/host-fleet/contract';
import { createHostFleetAdapter, type HostFleetClient } from '../adapter';

export interface UseHostFleetState {
  hosts: Ref<HostFleetHost[]>;
  generatedAt: Ref<string | null>;
  runtimeStatus: Ref<HostFleetRuntimeReadiness | null>;
  authorityHostId: Ref<string | null>;
  runtimeDetailCode: Ref<string | null>;
  correlationId: Ref<string | null>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  reachableCount: ComputedRef<number>;
  load: () => Promise<void>;
}

export function useHostFleet(client: HostFleetClient = createHostFleetAdapter()): UseHostFleetState {
  const hosts = ref<HostFleetHost[]>([]);
  const generatedAt = ref<string | null>(null);
  const runtimeStatus = ref<HostFleetRuntimeReadiness | null>(null);
  const authorityHostId = ref<string | null>(null);
  const runtimeDetailCode = ref<string | null>(null);
  const correlationId = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const reachableCount = computed(() => hosts.value.filter((host) => host.reachability.status === 'reachable').length);

  async function load(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const response = await client.read();
      runtimeStatus.value = response.runtime.status;
      authorityHostId.value = response.runtime.authority_host_id;
      runtimeDetailCode.value = response.runtime.detail_code;
      correlationId.value = response.runtime.correlation_id;
      hosts.value = response.snapshot?.hosts ?? [];
      generatedAt.value = response.snapshot?.generated_at ?? response.runtime.checked_at;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Host Fleet request failed.';
    } finally {
      loading.value = false;
    }
  }

  onMounted(() => { void load(); });

  return { hosts, generatedAt, runtimeStatus, authorityHostId, runtimeDetailCode, correlationId, loading, error, reachableCount, load };
}
