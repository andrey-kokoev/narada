import { ref, type ShallowRef } from 'vue';
import { buildAgentWebUiConversationSteerFrame, buildAgentWebUiOperatorInputAction } from '@narada2/nars-client-projection-contract';
import { submitOperatorConversationText, submitOperatorInput, type AuthorityTransitionInputPolicy, type OperatorInputDeliveryMode, type OperatorInputIdempotencyKey, type ProtocolMethodSupport, type SessionFrameSender } from '../../protocol/operatorInput';
import type { NarsClientConnection } from '../../protocol/narsClient';
import { toSessionProtocolFrame, type SessionProtocolFrame } from '../../protocol/sessionTransport';

type ActiveTurnIdReader = () => string | boolean | null;

export interface OperatorQueueItem {
  index: number;
  event_id: string | null;
  content: string;
  source: string | null;
  delivery_mode: string | null;
  created_at: string | null;
}

export function useOperatorInput(connection: ShallowRef<NarsClientConnection | null>, retain: (event: unknown) => void, clearEvents: () => void, authorityTransition: AuthorityTransitionInputPolicy | null = null, canSteerActiveTurn: () => boolean = () => Boolean(connection.value?.activeTurnId), preferSessionCore = false, supportsProtocolMethod: ProtocolMethodSupport | null = null, sendFrame: SessionFrameSender | null = null, activeTurnIdReader: ActiveTurnIdReader = () => connection.value?.activeTurnId ?? null) {
  const draft = ref('');
  const lastSubmittedRequestId = ref<string | null>(null);
  function handleResult(result: ReturnType<typeof submitOperatorInput>, clearDraft = true): boolean {
    if (result.requestId) lastSubmittedRequestId.value = result.requestId;
    if (result.localEvent) {
      if ((result.localEvent as { event?: string }).event === 'agent_web_ui_clear_requested') clearEvents();
      else retain(result.localEvent);
    }
    if (clearDraft && result.shouldClearDraft) draft.value = '';
    return result.handled;
  }

  function submit(deliveryMode: OperatorInputDeliveryMode = 'default', idempotencyKeyOverride: OperatorInputIdempotencyKey | null = null) {
    return handleResult(submitOperatorInput(draft.value, connection.value, authorityTransition, deliveryMode, canSteerActiveTurn(), supportsProtocolMethod, sendFrame, activeTurnIdReader(), idempotencyKeyOverride));
  }

  function submitText(text: string, deliveryMode: OperatorInputDeliveryMode = 'default', idempotencyKeyOverride: OperatorInputIdempotencyKey | null = null) {
    return handleResult(submitOperatorInput(text, connection.value, authorityTransition, deliveryMode, canSteerActiveTurn(), supportsProtocolMethod, sendFrame, activeTurnIdReader(), idempotencyKeyOverride), false);
  }

  function submitConversationText(text: string, deliveryMode: OperatorInputDeliveryMode = 'default', idempotencyKeyOverride: OperatorInputIdempotencyKey | null = null) {
    const result = preferSessionCore
      ? submitOperatorInput(text, connection.value, authorityTransition, deliveryMode, canSteerActiveTurn(), supportsProtocolMethod, sendFrame, activeTurnIdReader(), idempotencyKeyOverride)
      : submitOperatorConversationText(text, connection.value, authorityTransition, deliveryMode, supportsProtocolMethod, sendFrame, idempotencyKeyOverride);
    return handleResult(result, false);
  }

  function retainLocal(event: unknown): boolean {
    retain(event);
    return true;
  }

  function dropQueued(index: number): boolean {
    const action = buildAgentWebUiOperatorInputAction(`/queue drop ${index}`);
    if (!action || action.kind !== 'frame') return false;
    const frame = toSessionProtocolFrame(action.frame);
    if (!frame) return false;
    return sendFrame ? sendFrame(frame) : connection.value?.sendFrame(frame) ?? false;
  }

  function interrupt(): boolean {
    const action = buildAgentWebUiOperatorInputAction('/interrupt', { id: `agent-web-ui-interrupt-${Date.now()}` });
    if (!action || action.kind !== 'frame') return false;
    const frame = toSessionProtocolFrame(action.frame);
    if (!frame) return false;
    const sent = sendFrame ? sendFrame(frame) : connection.value?.sendFrame(frame) ?? false;
    if (sent) retain({ event: 'operator_input_submitted', request_id: frame.id, content: frame.method });
    else retain({ event: 'web_ui_input_not_sent', message: 'event stream is not open' });
    return sent;
  }

  function editQueued(item: OperatorQueueItem): boolean {
    draft.value = item.content;
    return dropQueued(item.index);
  }

  function steerQueuedNow(item: OperatorQueueItem): boolean {
    const currentConnection = connection.value;
    const activeTurnId = activeTurnIdReader();
    if (!currentConnection || !canSteerActiveTurn() || !activeTurnId) return false;
    if (!dropQueued(item.index)) return false;
    const buildSteerFrame = buildAgentWebUiConversationSteerFrame as unknown as (text: string, options: Record<string, unknown>) => unknown;
    const frame = toSessionProtocolFrame(buildSteerFrame(item.content, {
      id: `agent-web-ui-steer-queued-${Date.now()}`,
      activeTurnId,
    }));
    if (!frame) return false;
    return sendFrame ? sendFrame(frame) : currentConnection.sendFrame(frame);
  }

  return { draft, lastSubmittedRequestId, submit, submitText, submitConversationText, retainLocal, interrupt, dropQueued, editQueued, steerQueuedNow };
}
