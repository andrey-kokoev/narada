import { buildAgentWebUiHelpText, buildAgentWebUiOperatorInputAction } from '@narada2/nars-client-projection-contract';
import type { NarsClientConnection } from './narsClient';
import { toSessionProtocolFrame, type SessionProtocolFrame } from './sessionTransport';

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
export type ProtocolMethodSupport = (method: string) => boolean;
export type SessionFrameSender = (frame: SessionProtocolFrame) => boolean;

export function submitOperatorInput(text: string, connection: NarsClientConnection | null, authorityTransition: AuthorityTransitionInputPolicy | null = null, deliveryMode: OperatorInputDeliveryMode = 'default', canSteerActiveTurn: boolean | null = null, supportsProtocolMethod: ProtocolMethodSupport | null = null, sendFrame: SessionFrameSender | null = null, activeTurnIdOverride: string | boolean | null | undefined = undefined): OperatorInputResult {
  const activeTurnId = activeTurnIdOverride === undefined ? connection?.activeTurnId : activeTurnIdOverride;
  const activeTurn = canSteerActiveTurn ?? Boolean(activeTurnId);
  const action = buildAgentWebUiOperatorInputAction(text, {
    activeTurn,
    activeTurnId,
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
  const frame = toSessionProtocolFrame(action.frame);
  if (!frame) {
    return {
      handled: false,
      shouldClearDraft: false,
      localEvent: {
        event: 'web_ui_input_not_sent',
        message: 'control frame was not admitted by the client contract',
        reason_code: 'invalid_session_control',
      },
    };
  }
  if (supportsProtocolMethod && !supportsProtocolMethod(frame.method)) {
    return {
      handled: false,
      shouldClearDraft: false,
      localEvent: {
        event: 'web_ui_input_not_sent',
        message: 'control is not admitted by the attached runtime',
        reason_code: 'unsupported_session_control',
        method: frame.method,
      },
    };
  }
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
  const sent = sendFrame ? sendFrame(frame) : connection?.sendFrame(frame) ?? false;
  if (!sent) return { handled: false, shouldClearDraft: false, localEvent: { event: 'web_ui_input_not_sent', message: 'event stream is not open' } };
  if (frame.method === 'session.close') connection?.close?.();
  return {
    handled: true,
    shouldClearDraft: true,
    localEvent: { event: 'operator_input_submitted', request_id: frame.id, content: frame.params?.message ?? frame.params?.command ?? frame.method },
  };
}

export function submitOperatorConversationText(text: string, connection: NarsClientConnection | null, authorityTransition: AuthorityTransitionInputPolicy | null = null, deliveryMode: OperatorInputDeliveryMode = 'default', supportsProtocolMethod: ProtocolMethodSupport | null = null, sendFrame: SessionFrameSender | null = null): OperatorInputResult {
  const frame = toSessionProtocolFrame(deliveryMode === 'enqueue'
    ? buildConversationInputFrame('conversation.enqueue', text)
    : buildConversationInputFrame('conversation.send', text));
  if (!frame) return { handled: false, shouldClearDraft: false };
  if (supportsProtocolMethod && !supportsProtocolMethod(frame.method)) {
    return {
      handled: false,
      shouldClearDraft: false,
      localEvent: {
        event: 'web_ui_input_not_sent',
        message: 'control is not admitted by the attached runtime',
        reason_code: 'unsupported_session_control',
        method: frame.method,
      },
    };
  }
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
  const sent = sendFrame ? sendFrame(frame) : connection?.sendFrame(frame) ?? false;
  if (!sent) return { handled: false, shouldClearDraft: false, localEvent: { event: 'web_ui_input_not_sent', message: 'event stream is not open' } };
  return {
    handled: true,
    shouldClearDraft: true,
    localEvent: { event: 'operator_input_submitted', request_id: frame.id, content: frame.params?.message },
  };
}

function buildConversationInputFrame(method: 'conversation.send' | 'conversation.enqueue', text: string): SessionProtocolFrame | null {
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
