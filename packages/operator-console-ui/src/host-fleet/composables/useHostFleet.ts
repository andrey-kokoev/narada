import { computed, onMounted, ref, type Ref } from 'vue';
import type {
  HostFleetEnrollmentIntent,
  HostFleetLaunchIntent,
  HostFleetLifecycleOperation,
} from '@narada-core/host-fleet/contract';
import {
  createHostFleetAdapter,
  type HostFleetClient,
  type HostFleetCredentialRollbackPreflight,
  type HostFleetCredentialRotationPreflight,
  type HostFleetLaunchPreflight,
  type HostFleetLifecyclePreflight,
  type HostFleetMutationResult,
  type HostFleetRecord,
} from '../adapter';
import type { HostFleetMutationScope } from '../transport';
import {
  createHostFleetCredentialRollbackIntent,
  createHostFleetCredentialRotationIntent,
  createHostFleetLaunchIntent,
  createHostFleetLifecycleIntent,
  type HostFleetCredentialRollbackDraft,
  type HostFleetCredentialRotationDraft,
  type HostFleetLaunchDraft,
} from '../workflows';
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
  hostConsolePath: (host: Pick<HostFleetRecord, 'hostId' | 'hostInstanceId'>) => string | null;
  preflightBusy: Ref<boolean>;
  preflightError: Ref<string | null>;
  lifecyclePreflight: Ref<HostFleetLifecyclePreflight | null>;
  launchPreflight: Ref<HostFleetLaunchPreflight | null>;
  launchPreflightError: Ref<string | null>;
  credentialRotationPreflight: Ref<HostFleetCredentialRotationPreflight | null>;
  credentialRotationPreflightError: Ref<string | null>;
  credentialRollbackPreflight: Ref<HostFleetCredentialRollbackPreflight | null>;
  credentialRollbackPreflightError: Ref<string | null>;
  createLifecycleIntent: (host: HostFleetRecord, operation: HostFleetLifecycleOperation, reason: string) => ReturnType<typeof createHostFleetLifecycleIntent>;
  createLaunchIntent: (host: HostFleetRecord, draft: HostFleetLaunchDraft) => ReturnType<typeof createHostFleetLaunchIntent>;
  createCredentialRotationIntent: (host: HostFleetRecord, draft: HostFleetCredentialRotationDraft) => ReturnType<typeof createHostFleetCredentialRotationIntent>;
  createCredentialRollbackIntent: (host: HostFleetRecord, draft: HostFleetCredentialRollbackDraft) => ReturnType<typeof createHostFleetCredentialRollbackIntent>;
  preflightLifecycle: (intent: ReturnType<typeof createHostFleetLifecycleIntent>) => Promise<HostFleetLifecyclePreflight | null>;
  preflightLaunch: (intent: ReturnType<typeof createHostFleetLaunchIntent>) => Promise<HostFleetLaunchPreflight | null>;
  preflightCredentialRotation: (intent: ReturnType<typeof createHostFleetCredentialRotationIntent>) => Promise<HostFleetCredentialRotationPreflight | null>;
  preflightCredentialRollback: (intent: ReturnType<typeof createHostFleetCredentialRollbackIntent>) => Promise<HostFleetCredentialRollbackPreflight | null>;
  applyLifecycleIntent: (intent: ReturnType<typeof createHostFleetLifecycleIntent>) => Promise<void>;
  applyLifecycle: (host: HostFleetRecord, operation: HostFleetLifecycleOperation, reason: string) => Promise<void>;
  applyEnrollment: (intent: HostFleetEnrollmentIntent) => Promise<void>;
  applyLaunchIntent: (intent: ReturnType<typeof createHostFleetLaunchIntent>) => Promise<void>;
  applyCredentialRotation: (intent: ReturnType<typeof createHostFleetCredentialRotationIntent>) => Promise<void>;
  applyCredentialRollback: (intent: ReturnType<typeof createHostFleetCredentialRollbackIntent>) => Promise<void>;
  clearMutationFeedback: () => void;
  clearLifecyclePreflight: () => void;
  clearLaunchPreflight: () => void;
  clearCredentialRotationPreflight: () => void;
  clearCredentialRollbackPreflight: () => void;
  load: () => Promise<void>;
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
  const preflightBusy = ref(false);
  const preflightError = ref<string | null>(null);
  const lifecyclePreflight = ref<HostFleetLifecyclePreflight | null>(null);
  const launchPreflight = ref<HostFleetLaunchPreflight | null>(null);
  const launchPreflightError = ref<string | null>(null);
  const credentialRotationPreflight = ref<HostFleetCredentialRotationPreflight | null>(null);
  const credentialRotationPreflightError = ref<string | null>(null);
  const credentialRollbackPreflight = ref<HostFleetCredentialRollbackPreflight | null>(null);
  const credentialRollbackPreflightError = ref<string | null>(null);
  const session = useHostFleetSession(client);

  function clearMutationFeedback(): void {
    mutationError.value = null;
    mutationResult.value = null;
  }

  function clearLifecyclePreflight(): void {
    preflightError.value = null;
    lifecyclePreflight.value = null;
  }

  function clearLaunchPreflight(): void {
    launchPreflight.value = null;
    launchPreflightError.value = null;
  }

  function clearCredentialRotationPreflight(): void {
    credentialRotationPreflight.value = null;
    credentialRotationPreflightError.value = null;
  }

  function clearCredentialRollbackPreflight(): void {
    credentialRollbackPreflight.value = null;
    credentialRollbackPreflightError.value = null;
  }

  function hostConsolePath(host: Pick<HostFleetRecord, 'hostId' | 'hostInstanceId'>): string | null {
    return client.hostConsolePath?.(host) ?? null;
  }

  async function runMutation(action: () => Promise<HostFleetMutationResult>): Promise<void> {
    mutationBusy.value = true;
    mutationError.value = null;
    mutationResult.value = null;
    try {
      const result = await action();
      mutationResult.value = result;
      if (result.status === 'applied' || result.status === 'launched' || result.status === 'replayed' || result.status === 'reused' || result.status === 'unchanged') await load();
      else mutationError.value = result.reason ?? 'Host Fleet authority refused the mutation.';
    } catch (cause) {
      mutationError.value = cause instanceof Error ? cause.message : 'Host Fleet mutation failed.';
    } finally {
      mutationBusy.value = false;
    }
  }

  function createLifecycleIntent(host: HostFleetRecord, operation: HostFleetLifecycleOperation, reason: string) {
    return createHostFleetLifecycleIntent(host, operation, reason);
  }

  function createLaunchIntent(host: HostFleetRecord, draft: HostFleetLaunchDraft) {
    return createHostFleetLaunchIntent(host, draft);
  }

  function createCredentialRotationIntent(host: HostFleetRecord, draft: HostFleetCredentialRotationDraft) {
    return createHostFleetCredentialRotationIntent(host, draft);
  }

  function createCredentialRollbackIntent(host: HostFleetRecord, draft: HostFleetCredentialRollbackDraft) {
    return createHostFleetCredentialRollbackIntent(host, draft);
  }

  async function preflightLifecycle(intent: ReturnType<typeof createHostFleetLifecycleIntent>): Promise<HostFleetLifecyclePreflight | null> {
    preflightBusy.value = true;
    clearLifecyclePreflight();
    try {
      if (mutationScope.value === 'projection-only' || !client.preflightLifecycle) {
        preflightError.value = 'Host lifecycle planning requires an admitted Host Fleet authority route.';
        return null;
      }
      const result = await client.preflightLifecycle(intent);
      lifecyclePreflight.value = result;
      if (result.status === 'refused') preflightError.value = result.refusals.join(', ') || 'Host lifecycle preflight was refused.';
      return result;
    } catch (cause) {
      preflightError.value = cause instanceof Error ? cause.message : 'Host lifecycle preflight failed.';
      return null;
    } finally {
      preflightBusy.value = false;
    }
  }

  async function preflightCredentialRotation(intent: ReturnType<typeof createHostFleetCredentialRotationIntent>): Promise<HostFleetCredentialRotationPreflight | null> {
    preflightBusy.value = true;
    clearCredentialRotationPreflight();
    try {
      if (mutationScope.value === 'projection-only' || !client.preflightCredentialRotation) {
        credentialRotationPreflightError.value = 'Credential rotation requires an admitted Host Fleet authority route.';
        return null;
      }
      const result = await client.preflightCredentialRotation(intent);
      credentialRotationPreflight.value = result;
      if (result.status === 'refused') credentialRotationPreflightError.value = result.refusals.join(', ') || 'Credential rotation preflight was refused.';
      return result;
    } catch (cause) {
      credentialRotationPreflightError.value = cause instanceof Error ? cause.message : 'Credential rotation preflight failed.';
      return null;
    } finally {
      preflightBusy.value = false;
    }
  }

  async function preflightCredentialRollback(intent: ReturnType<typeof createHostFleetCredentialRollbackIntent>): Promise<HostFleetCredentialRollbackPreflight | null> {
    preflightBusy.value = true;
    clearCredentialRollbackPreflight();
    try {
      if (mutationScope.value === 'projection-only' || !client.preflightCredentialRollback) {
        credentialRollbackPreflightError.value = 'Credential rollback requires an admitted Host Fleet authority route.';
        return null;
      }
      const result = await client.preflightCredentialRollback(intent);
      credentialRollbackPreflight.value = result;
      if (result.status === 'refused') credentialRollbackPreflightError.value = result.refusals.join(', ') || 'Credential rollback preflight was refused.';
      return result;
    } catch (cause) {
      credentialRollbackPreflightError.value = cause instanceof Error ? cause.message : 'Credential rollback preflight failed.';
      return null;
    } finally {
      preflightBusy.value = false;
    }
  }

  async function preflightLaunch(intent: ReturnType<typeof createHostFleetLaunchIntent>): Promise<HostFleetLaunchPreflight | null> {
    preflightBusy.value = true;
    clearLaunchPreflight();
    try {
      if (!client.preflightLaunch) {
        launchPreflightError.value = 'Host launch planning is unavailable on this operator surface.';
        return null;
      }
      const result = await client.preflightLaunch(intent);
      launchPreflight.value = result;
      if (result.status === 'refused') launchPreflightError.value = result.refusals.join(', ') || 'Host launch preflight was refused.';
      return result;
    } catch (cause) {
      launchPreflightError.value = cause instanceof Error ? cause.message : 'Host launch preflight failed.';
      return null;
    } finally {
      preflightBusy.value = false;
    }
  }

  async function applyLifecycleIntent(intent: ReturnType<typeof createHostFleetLifecycleIntent>): Promise<void> {
    if (mutationScope.value === 'projection-only' || !client.applyLifecycle) {
      clearMutationFeedback();
      mutationError.value = 'Host lifecycle control requires an admitted Host Fleet authority route.';
      return;
    }
    await runMutation(() => client.applyLifecycle!(intent, 'operator-console.host-fleet'));
  }

  async function applyLifecycle(host: HostFleetRecord, operation: HostFleetLifecycleOperation, reason: string): Promise<void> {
    await applyLifecycleIntent(createLifecycleIntent(host, operation, reason));
  }

  async function applyEnrollment(intent: HostFleetEnrollmentIntent): Promise<void> {
    if (mutationScope.value === 'projection-only' || !client.applyEnrollment) {
      clearMutationFeedback();
      mutationError.value = 'Host enrollment requires an admitted Host Fleet authority route.';
      return;
    }
    await runMutation(() => client.applyEnrollment!(intent, 'operator-console.host-fleet'));
  }

  async function applyLaunchIntent(intent: ReturnType<typeof createHostFleetLaunchIntent>): Promise<void> {
    if (mutationScope.value === 'projection-only' || !client.applyLaunch) {
      clearMutationFeedback();
      mutationError.value = 'Exact-host launch requires an admitted Host Fleet authority route.';
      return;
    }
    await runMutation(() => client.applyLaunch!(intent, 'operator-console.host-fleet'));
  }

  async function applyCredentialRotation(intent: ReturnType<typeof createHostFleetCredentialRotationIntent>): Promise<void> {
    if (mutationScope.value === 'projection-only' || !client.applyCredentialRotation) {
      clearMutationFeedback();
      mutationError.value = 'Credential rotation requires an admitted Host Fleet authority route.';
      return;
    }
    await runMutation(() => client.applyCredentialRotation!(intent, 'operator-console.host-fleet'));
  }

  async function applyCredentialRollback(intent: ReturnType<typeof createHostFleetCredentialRollbackIntent>): Promise<void> {
    if (mutationScope.value === 'projection-only' || !client.applyCredentialRollback) {
      clearMutationFeedback();
      mutationError.value = 'Credential rollback requires an admitted Host Fleet authority route.';
      return;
    }
    await runMutation(() => client.applyCredentialRollback!(intent, 'operator-console.host-fleet'));
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
    hostConsolePath,
    preflightBusy,
    preflightError,
    lifecyclePreflight,
    launchPreflight,
    launchPreflightError,
    credentialRotationPreflight,
    credentialRotationPreflightError,
    credentialRollbackPreflight,
    credentialRollbackPreflightError,
    createLifecycleIntent,
    createLaunchIntent,
    createCredentialRotationIntent,
    createCredentialRollbackIntent,
    preflightLifecycle,
    preflightLaunch,
    preflightCredentialRotation,
    preflightCredentialRollback,
    applyLifecycleIntent,
    applyLifecycle,
    applyEnrollment,
    applyLaunchIntent,
    applyCredentialRotation,
    applyCredentialRollback,
    clearMutationFeedback,
    clearLifecyclePreflight,
    clearLaunchPreflight,
    clearCredentialRotationPreflight,
    clearCredentialRollbackPreflight,
    load,
    ...session,
  };
}
