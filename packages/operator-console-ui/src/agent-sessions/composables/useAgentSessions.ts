import { computed, onMounted, ref, type Ref } from 'vue';
import {
  AgentSessionsApiError,
  createAgentSessionsAdapter,
  type AgentSessionListResponse,
  type AgentSessionRecord,
  type AgentSessionsClient,
} from '../adapter';

export interface UseAgentSessionsState {
  sessions: Ref<AgentSessionRecord[]>;
  count: Ref<number>;
  refusals: Ref<string[]>;
  generatedAt: Ref<string | null>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  hasActiveSessions: Ref<boolean>;
  load: () => Promise<void>;
}

export function useAgentSessions(client: AgentSessionsClient = createAgentSessionsAdapter()): UseAgentSessionsState {
  const sessions = ref<AgentSessionRecord[]>([]);
  const count = ref(0);
  const refusals = ref<string[]>([]);
  const generatedAt = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const hasActiveSessions = computed(() => sessions.value.some((session) => session.displayState === 'active'));

  function applyResponse(response: AgentSessionListResponse): void {
    sessions.value = response.sessions;
    count.value = response.count;
    refusals.value = response.refusals;
    generatedAt.value = response.generatedAt;
    if (response.status === 'refused') {
      throw new AgentSessionsApiError('refused', 'Agent Sessions refused the list request.', response.refusals);
    }
  }

  async function load(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      applyResponse(await client.list());
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Agent Sessions request failed.';
    } finally {
      loading.value = false;
    }
  }

  onMounted(() => { void load(); });

  return { sessions, count, refusals, generatedAt, loading, error, hasActiveSessions, load };
}
