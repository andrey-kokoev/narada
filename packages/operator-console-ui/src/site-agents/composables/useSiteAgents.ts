import { onMounted, onUnmounted, ref, type Ref } from 'vue';
import type {
  OperatorSiteAgentGroupWireRecord,
  OperatorSiteAgentLaunchWireResponse,
} from '@narada2/operator-console-contract';
import { createSiteAgentsAdapter, type SiteAgentsClient } from '../adapter';

export interface UseSiteAgentsState {
  groups: Ref<OperatorSiteAgentGroupWireRecord[]>;
  refusals: Ref<string[]>;
  generatedAt: Ref<string | null>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  load(): Promise<void>;
  launch(siteId: string, agentId: string): Promise<OperatorSiteAgentLaunchWireResponse>;
}

export function useSiteAgents(client: SiteAgentsClient = createSiteAgentsAdapter()): UseSiteAgentsState {
  const groups = ref<OperatorSiteAgentGroupWireRecord[]>([]);
  const refusals = ref<string[]>([]);
  const generatedAt = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  let refreshTimer: ReturnType<typeof setInterval> | null = null;

  async function load(): Promise<void> {
    if (loading.value) return;
    loading.value = true;
    error.value = null;
    try {
      const response = await client.overview();
      groups.value = response.groups;
      refusals.value = response.refusals;
      generatedAt.value = response.generated_at;
      if (response.status === 'refused') error.value = 'Sites and Agents overview is currently unavailable.';
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Sites and Agents request failed.';
    } finally {
      loading.value = false;
    }
  }

  async function launch(siteId: string, agentId: string): Promise<OperatorSiteAgentLaunchWireResponse> {
    return client.launch(siteId, agentId);
  }

  onMounted(() => {
    void load();
    refreshTimer = setInterval(() => { void load(); }, 10_000);
  });
  onUnmounted(() => {
    if (refreshTimer) clearInterval(refreshTimer);
  });

  return { groups, refusals, generatedAt, loading, error, load, launch };
}
