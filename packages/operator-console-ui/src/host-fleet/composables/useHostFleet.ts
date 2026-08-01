import { computed, onMounted, ref, type Ref } from 'vue';
import type {
  HostFleetEnrollmentIntent,
  HostFleetLifecycleOperation,
} from '@narada2/host-fleet/contract';
import {
  createHostFleetAdapter,
  type HostFleetClient,
  type HostFleetMutationResult,
  type HostFleetRecord,
} from '../adapter';
import type { HostFleetMutationScope } from '../transport';
import { useHostFleetSession, type UseHostFleetSessionState } from './useHostFleetSession';

export interface UseHostFleetState extends UseHostFleetSessionState {
  hosts: Ref<HostFleetRecord[]>;
  count: Ref<number>;
  generatedAt: Ref<string | null>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  refusals: Ref<string[]>;
  onlineCount: Ref<number>;
  mutationScope: Ref<HostFleetMutationScope>;
  mutationBusy: Ref<boolean>;
  mutationError: Ref<string | null>;
  mutationResult: Ref<HostFleetMutationResult | null>;
  applyLifecycle: (host: HostFleetRecord, operation: HostFleetLifecycleOperation, reason: string) => Promise<void>;
  applyEnrollment: (intent: HostFleetEnrollmentIntent) => Promise<void>;
  load: () => Promise<void>;
}

function requestId(prefix: string): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  return randomUuid ? `${prefix}:${randomUuid}` : `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

export function useHostFleet(client: HostFleetClient = createHostFleetAdapter()): UseHostFleetState {
  const hosts = ref<HostFleetRecord[]>([]);
  const count = ref(0);
  const generatedAt = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const refusals = ref<string[]>([]);
  const onlineCount = computed(() => hosts.value.filter((host) => host.healthStatus === 'online').length);
  const mutationScope = ref<HostFleetMutationScope>(client.mutationScope ?? 'projection-only');
  const mutationBusy = ref(false);
  const mutationError = ref<string | null>(null);
  const mutationResult = ref<HostFleetMutationResult | null>(null);
  const session = useHostFleetSession(client);

  async function runMutation(action: () => Promise<HostFleetMutationResult>): Promise<void> {
    mutationBusy.value = true;
    mutationError.value = null;
    mutationResult.value = null;
    try {
      const result = await action();
      mutationResult.value = result;
      if (result.status === 'applied' || result.status === 'replayed' || result.status === 'unchanged') await load();
      else mutationError.value = result.reason ?? 'Host Fleet authority refused the mutation.';
    } catch (cause) {
      mutationError.value = cause instanceof Error ? cause.message : 'Host Fleet mutation failed.';
    } finally {
      mutationBusy.value = false;
    }
  }

  async function applyLifecycle(host: HostFleetRecord, operation: HostFleetLifecycleOperation, reason: string): Promise<void> {
    if (mutationScope.value !== 'local-authority' || !client.applyLifecycle) {
      mutationError.value = 'Host lifecycle control is available only from the local User Site authority console.';
      return;
    }
    const intent = {
      schema: 'narada.host_fleet.lifecycle_intent.v1' as const,
      request_id: requestId('host-lifecycle'),
      operation,
      host: { host_id: host.hostId, host_instance_id: host.hostInstanceId },
      expected_revision: host.revision,
      confirmation: `${host.hostId}@${host.hostInstanceId}`,
      reason: reason.trim() || null,
    };
    await runMutation(() => client.applyLifecycle!(intent, 'operator-console.host-fleet'));
  }

  async function applyEnrollment(intent: HostFleetEnrollmentIntent): Promise<void> {
    if (mutationScope.value !== 'local-authority' || !client.applyEnrollment) {
      mutationError.value = 'Host enrollment is available only from the local User Site authority console.';
      return;
    }
    await runMutation(() => client.applyEnrollment!(intent, 'operator-console.host-fleet'));
  }

  async function load(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const response = await client.list();
      hosts.value = response.hosts;
      count.value = response.count;
      generatedAt.value = response.generatedAt;
      refusals.value = response.refusals;
      await session.refreshSessions();
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Host Fleet request failed.';
    } finally {
      loading.value = false;
    }
  }

  onMounted(() => { void load(); });

  return {
    hosts,
    count,
    generatedAt,
    loading,
    error,
    refusals,
    onlineCount,
    mutationScope,
    mutationBusy,
    mutationError,
    mutationResult,
    applyLifecycle,
    applyEnrollment,
    load,
    ...session,
  };
}
