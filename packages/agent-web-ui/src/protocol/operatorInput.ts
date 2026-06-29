import { buildAgentWebUiHelpText, buildAgentWebUiOperatorInputAction } from '@narada2/nars-client-projection-contract';
import type { NarsClientConnection } from './narsClient';

export interface OperatorInputResult {
  handled: boolean;
  shouldClearDraft: boolean;
  localEvent?: unknown;
}

export function submitOperatorInput(text: string, connection: NarsClientConnection | null): OperatorInputResult {
  const action = buildAgentWebUiOperatorInputAction(text, {
    activeTurn: Boolean(connection?.activeTurnId),
    activeTurnId: connection?.activeTurnId,
  });
  if (!action) return { handled: false, shouldClearDraft: false };
  if (action.kind === 'local_help') {
    return { handled: true, shouldClearDraft: true, localEvent: { event: 'agent_web_ui_help', content: buildAgentWebUiHelpText() } };
  }
  if (action.kind === 'local_clear') {
    return { handled: true, shouldClearDraft: true, localEvent: { event: 'agent_web_ui_clear_requested' } };
  }
  if (action.kind === 'message') {
    return { handled: false, shouldClearDraft: false, localEvent: { event: 'agent_web_ui_message', message: action.message } };
  }
  const sent = connection?.sendFrame(action.frame) ?? false;
  if (!sent) return { handled: false, shouldClearDraft: false, localEvent: { event: 'web_ui_input_not_sent', message: 'event stream is not open' } };
  const frame = action.frame;
  if (frame.method === 'session.close') connection?.close?.();
  return {
    handled: true,
    shouldClearDraft: true,
    localEvent: { event: 'operator_input_submitted', request_id: frame.id, content: frame.params?.message ?? frame.params?.command ?? frame.method },
  };
}
