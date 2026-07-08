import { buildAgentWebUiHelpText, buildAgentWebUiOperatorInputAction } from '@narada2/nars-client-projection-contract';
import type { NarsClientConnection } from './narsClient';

export interface OperatorInputResult {
  handled: boolean;
  shouldClearDraft: boolean;
  localEvent?: unknown;
}

export interface AuthorityTransitionInputPolicy {
  input_policy?: string | null;
  stale_source?: boolean | null;
  superseded_by_session_id?: string | null;
  authority_locator_ref?: string | null;
}

export type OperatorInputDeliveryMode = 'default' | 'enqueue';

export function submitOperatorInput(text: string, connection: NarsClientConnection | null, authorityTransition: AuthorityTransitionInputPolicy | null = null, deliveryMode: OperatorInputDeliveryMode = 'default', canSteerActiveTurn: boolean | null = null): OperatorInputResult {
  const activeTurn = canSteerActiveTurn ?? Boolean(connection?.activeTurnId);
  const action = buildAgentWebUiOperatorInputAction(text, {
    activeTurn,
    activeTurnId: connection?.activeTurnId,
    ...(deliveryMode === 'enqueue' ? { deliveryMode: 'enqueue' } : {}),
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
  if (action.kind === 'snippet_command') {
    return { handled: false, shouldClearDraft: false, localEvent: { event: 'agent_web_ui_message', message: 'Snippet commands are handled by the Agent Web UI composer.' } };
  }
  if (action.kind === 'snippet_panel_command') {
    return { handled: false, shouldClearDraft: false, localEvent: { event: 'agent_web_ui_message', message: 'Open snippets from the Agent Web UI composer with /snippets.' } };
  }
  if (authorityTransitionRefusesInput(action.frame, authorityTransition)) {
    return {
      handled: false,
      shouldClearDraft: false,
      localEvent: {
        event: 'web_ui_input_not_sent',
        message: 'source authority is sealed; reattach to target authority before sending conversation input',
        reason_code: 'source_authority_superseded',
        authority_transition: authorityTransition,
      },
    };
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

export function submitOperatorConversationText(text: string, connection: NarsClientConnection | null, authorityTransition: AuthorityTransitionInputPolicy | null = null, deliveryMode: OperatorInputDeliveryMode = 'default'): OperatorInputResult {
  const frame = deliveryMode === 'enqueue'
    ? buildConversationInputFrame('conversation.enqueue', text)
    : buildConversationInputFrame('conversation.send', text);
  if (!frame) return { handled: false, shouldClearDraft: false };
  if (authorityTransitionRefusesInput(frame, authorityTransition)) {
    return {
      handled: false,
      shouldClearDraft: false,
      localEvent: {
        event: 'web_ui_input_not_sent',
        message: 'source authority is sealed; reattach to target authority before sending conversation input',
        reason_code: 'source_authority_superseded',
        authority_transition: authorityTransition,
      },
    };
  }
  const sent = connection?.sendFrame(frame) ?? false;
  if (!sent) return { handled: false, shouldClearDraft: false, localEvent: { event: 'web_ui_input_not_sent', message: 'event stream is not open' } };
  return {
    handled: true,
    shouldClearDraft: true,
    localEvent: { event: 'operator_input_submitted', request_id: frame.id, content: frame.params?.message },
  };
}

function buildConversationInputFrame(method: 'conversation.send' | 'conversation.enqueue', text: string) {
  const message = String(text ?? '').trim();
  if (!message) return null;
  return {
    id: `${method === 'conversation.enqueue' ? 'agent-web-ui-enqueue' : 'agent-web-ui-input'}-${Date.now()}`,
    method,
    params: { message, source: 'agent-web-ui' },
  };
}

function authorityTransitionRefusesInput(frame: { method?: string }, authorityTransition: AuthorityTransitionInputPolicy | null): boolean {
  if (!String(frame?.method ?? '').startsWith('conversation.')) return false;
  if (!authorityTransition) return false;
  return authorityTransition.input_policy === 'disabled_source_sealed' || authorityTransition.stale_source === true;
}
