import { ref, type ShallowRef } from 'vue';
import { buildAgentWebUiOperatorInputAction } from '@narada2/nars-client-projection-contract';
import { submitOperatorConversationText, submitOperatorInput, type AuthorityTransitionInputPolicy, type OperatorInputDeliveryMode } from '../../protocol/operatorInput';
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
  function handleResult(result: ReturnType<typeof submitOperatorInput>, clearDraft = true): boolean {
    if (result.localEvent) {
      if ((result.localEvent as { event?: string }).event === 'agent_web_ui_clear_requested') clearEvents();
      else retain(result.localEvent);
    }
    if (clearDraft && result.shouldClearDraft) draft.value = '';
    return result.handled;
  }

  function submit(deliveryMode: OperatorInputDeliveryMode = 'default') {
    return handleResult(submitOperatorInput(draft.value, connection.value, authorityTransition, deliveryMode));
  }

  function submitText(text: string, deliveryMode: OperatorInputDeliveryMode = 'default') {
    return handleResult(submitOperatorInput(text, connection.value, authorityTransition, deliveryMode), false);
  }

  function submitConversationText(text: string, deliveryMode: OperatorInputDeliveryMode = 'default') {
    return handleResult(submitOperatorConversationText(text, connection.value, authorityTransition, deliveryMode), false);
  }

  function retainLocal(event: unknown): boolean {
    retain(event);
    return true;
  }

  function dropQueued(index: number): boolean {
    const action = buildAgentWebUiOperatorInputAction(`/queue drop ${index}`);
    if (!action || action.kind !== 'frame') return false;
    return connection.value?.sendFrame(action.frame) ?? false;
  }

  function interrupt(): boolean {
    const action = buildAgentWebUiOperatorInputAction('/interrupt', { id: `agent-web-ui-interrupt-${Date.now()}` });
    if (!action || action.kind !== 'frame') return false;
    const frame = action.frame as { id?: string; method?: string };
    const sent = connection.value?.sendFrame(frame) ?? false;
    if (sent) retain({ event: 'operator_input_submitted', request_id: frame.id, content: frame.method });
    else retain({ event: 'web_ui_input_not_sent', message: 'event stream is not open' });
    return sent;
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

  return { draft, submit, submitText, submitConversationText, retainLocal, interrupt, dropQueued, editQueued, steerQueuedNow };
}
