import { onMounted, ref, type Ref } from 'vue';
import type { WorkspaceLaunchUiSession } from '@narada2/workspace-launch-contract';
import {
  createOperatorConsoleLauncherSessionTransport,
  type OperatorConsoleLauncherSessionTransport,
} from '../session-transport';

export interface UseOperatorConsoleLauncherSessionsState {
  sessions: Ref<WorkspaceLaunchUiSession[]>;
  history: Ref<WorkspaceLaunchUiSession[]>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  load: () => Promise<void>;
}

export function useOperatorConsoleLauncherSessions(
  transport: OperatorConsoleLauncherSessionTransport = createOperatorConsoleLauncherSessionTransport(),
): UseOperatorConsoleLauncherSessionsState {
  const sessions = ref<WorkspaceLaunchUiSession[]>([]);
  const history = ref<WorkspaceLaunchUiSession[]>([]);
  const loading = ref(true);
  const error = ref<string | null>(null);

  async function load(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const inventory = await transport.list();
      sessions.value = inventory.sessions;
      history.value = inventory.history ?? [];
    } catch (cause) {
      error.value = cause instanceof Error
        ? cause.message
        : 'Launcher session inventory is unavailable from this host.';
    } finally {
      loading.value = false;
    }
  }

  onMounted(() => { void load(); });

  return { sessions, history, loading, error, load };
}
