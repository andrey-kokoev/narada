import { onMounted, onUnmounted, ref, type Ref } from 'vue';
import type {
  OperatorSiteAgentAdmissionOptionsWireResponse,
  OperatorSiteAgentAdmissionWireRequest,
  OperatorSiteAgentAdmissionWireResponse,
  OperatorSiteAgentDeleteWireResponse,
  OperatorSiteAgentGroupWireRecord,
  OperatorSiteAgentLaunchWireResponse,
  OperatorSiteAgentStopWireResponse,
} from '@narada2/operator-console-contract';
import {
  createSiteAgentsAdapter,
  parseOperatorSiteAgentLaunchWireResponse,
  type SiteAgentsClient,
  type SiteAgentsPendingEntry,
} from '../adapter';
import { SiteAgentsTransportError } from '../transport';

export interface UseSiteAgentsState {
  groups: Ref<OperatorSiteAgentGroupWireRecord[]>;
  refusals: Ref<string[]>;
  generatedAt: Ref<string | null>;
  pending: Ref<SiteAgentsPendingEntry[]>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  launchFailure: Ref<OperatorSiteAgentLaunchWireResponse | null>;
  admissionOptions: Ref<OperatorSiteAgentAdmissionOptionsWireResponse | null>;
  admissionResult: Ref<OperatorSiteAgentAdmissionWireResponse | null>;
  admissionLoading: Ref<boolean>;
  lifecycleLoading: Ref<boolean>;
  load(): Promise<void>;
  launch(siteId: string, agentId: string, operatorSurface?: string): Promise<OperatorSiteAgentLaunchWireResponse>;
  loadAdmissionOptions(siteId: string): Promise<OperatorSiteAgentAdmissionOptionsWireResponse>;
  admit(request: OperatorSiteAgentAdmissionWireRequest): Promise<OperatorSiteAgentAdmissionWireResponse>;
  stop(siteId: string, agentId: string): Promise<OperatorSiteAgentStopWireResponse>;
  delete(siteId: string, agentId: string): Promise<OperatorSiteAgentDeleteWireResponse>;
}

export function useSiteAgents(client: SiteAgentsClient = createSiteAgentsAdapter()): UseSiteAgentsState {
  const groups = ref<OperatorSiteAgentGroupWireRecord[]>([]);
  const refusals = ref<string[]>([]);
  const generatedAt = ref<string | null>(null);
  const pending = ref<SiteAgentsPendingEntry[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const launchFailure = ref<OperatorSiteAgentLaunchWireResponse | null>(null);
  const admissionOptions = ref<OperatorSiteAgentAdmissionOptionsWireResponse | null>(null);
  const admissionResult = ref<OperatorSiteAgentAdmissionWireResponse | null>(null);
  const admissionLoading = ref(false);
  const lifecycleLoading = ref(false);
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
    try {
      pending.value = await client.pending();
    } catch {
      // Pending launch state is best-effort; keep the last known value.
    }
  }

  async function stop(siteId: string, agentId: string): Promise<OperatorSiteAgentStopWireResponse> {
    lifecycleLoading.value = true;
    try {
      return await client.stop(siteId, agentId);
    } finally {
      lifecycleLoading.value = false;
    }
  }

  async function deleteAgent(siteId: string, agentId: string): Promise<OperatorSiteAgentDeleteWireResponse> {
    lifecycleLoading.value = true;
    try {
      return await client.delete(siteId, agentId);
    } finally {
      lifecycleLoading.value = false;
    }
  }

  async function loadAdmissionOptions(siteId: string): Promise<OperatorSiteAgentAdmissionOptionsWireResponse> {
    admissionLoading.value = true;
    admissionResult.value = null;
    try {
      const result = await client.admissionOptions(siteId);
      admissionOptions.value = result;
      return result;
    } finally {
      admissionLoading.value = false;
    }
  }

  async function admit(request: OperatorSiteAgentAdmissionWireRequest): Promise<OperatorSiteAgentAdmissionWireResponse> {
    admissionResult.value = null;
    try {
      const result = await client.admit(request);
      admissionResult.value = result;
      return result;
    } catch (cause) {
      throw cause;
    }
  }

  async function launch(siteId: string, agentId: string, operatorSurface?: string): Promise<OperatorSiteAgentLaunchWireResponse> {
    launchFailure.value = null;
    try {
      const result = await client.launch(siteId, agentId, operatorSurface);
      if (result.status === 'failed') launchFailure.value = result;
      return result;
    } catch (cause) {
      if (cause instanceof SiteAgentsTransportError) {
        const result = parseOperatorSiteAgentLaunchWireResponse(cause.payload);
        if (result?.status === 'failed') launchFailure.value = result;
      }
      throw cause;
    }
  }

  onMounted(() => {
    void load();
    refreshTimer = setInterval(() => { void load(); }, 10_000);
  });
  onUnmounted(() => {
    if (refreshTimer) clearInterval(refreshTimer);
  });

  return {
    groups,
    refusals,
    generatedAt,
    pending,
    loading,
    error,
    launchFailure,
    admissionOptions,
    admissionResult,
    admissionLoading,
    lifecycleLoading,
    load,
    launch,
    loadAdmissionOptions,
    admit,
    stop,
    delete: deleteAgent,
  };
}
