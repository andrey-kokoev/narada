import { computed, onMounted, ref, type ComputedRef, type Ref } from 'vue';
import type { HostFleetHost } from '@narada-core/host-fleet/contract';
import { createHostFleetAdapter, type HostFleetClient } from '../adapter';

export interface UseHostFleetState {
  hosts: Ref<HostFleetHost[]>;
  generatedAt: Ref<string | null>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  reachableCount: ComputedRef<number>;
  load: () => Promise<void>;
}

export function useHostFleet(client: HostFleetClient = createHostFleetAdapter()): UseHostFleetState {
  const hosts = ref<HostFleetHost[]>([]);
  const generatedAt = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const reachableCount = computed(() => hosts.value.filter((host) => host.reachability.status === 'reachable').length);

  async function load(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const snapshot = await client.list();
      hosts.value = snapshot.hosts;
      generatedAt.value = snapshot.generated_at;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Host Fleet request failed.';
    } finally {
      loading.value = false;
    }
  }

  onMounted(() => { void load(); });

  return { hosts, generatedAt, loading, error, reachableCount, load };
}
