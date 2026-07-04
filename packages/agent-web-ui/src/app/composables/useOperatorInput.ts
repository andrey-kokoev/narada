import { ref, type ShallowRef } from 'vue';
import { buildAgentWebUiOperatorInputAction } from '@narada2/nars-client-projection-contract';
import { submitOperatorInput, type AuthorityTransitionInputPolicy, type OperatorInputDeliveryMode } from '../../protocol/operatorInput';
import type { NarsClientConnection } from '../../protocol/narsClient';

export interface OperatorQueueItem {
  index: number;
  event_id: string | null;
  content: string;
  source: string | null;
  delivery_mode: string | null;
  created_at: string | null;
}

export function useOperatorInput(connection: ShallowRef<NarsClientConnection | null>, retain: (event: unknown) => void, clearEvents: () => void, authorityTransition: AuthorityTransitionInputPolicy | null = null) {
  const draft = ref('');
  function submit(deliveryMode: OperatorInputDeliveryMode = 'default') {
    const result = submitOperatorInput(draft.value, connection.value, authorityTransition, deliveryMode);
    if (result.localEvent) {
      if ((result.localEvent as { event?: string }).event === 'agent_web_ui_clear_requested') clearEvents();
      else retain(result.localEvent);
    }
    if (result.shouldClearDraft) draft.value = '';
    return result.handled;
  }

  function dropQueued(index: number): boolean {
    const action = buildAgentWebUiOperatorInputAction(`/queue drop ${index}`);
    if (!action || action.kind !== 'frame') return false;
    return connection.value?.sendFrame(action.frame) ?? false;
  }

  function editQueued(item: OperatorQueueItem): boolean {
    draft.value = item.content;
    return dropQueued(item.index);
  }

  function steerQueuedNow(item: OperatorQueueItem): boolean {
    if (!connection.value?.activeTurnId) return false;
    if (!dropQueued(item.index)) return false;
    return connection.value.sendFrame({
      id: `agent-web-ui-steer-queued-${Date.now()}`,
      method: 'conversation.steer',
      params: {
        message: item.content.trim(),
        source: 'agent-web-ui',
        active_turn_id: connection.value.activeTurnId,
      },
    });
  }

  return { draft, submit, dropQueued, editQueued, steerQueuedNow };
}
