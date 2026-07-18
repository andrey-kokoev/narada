import { buildAgentWebUiHelpText, buildAgentWebUiOperatorInputAction } from '@narada2/nars-client-projection-contract';
import type { NarsClientConnection } from './narsClient';
import { toSessionProtocolFrame, type SessionProtocolFrame, type SessionTransportCorrelation } from './sessionTransport';

export interface OperatorInputResult {
  handled: boolean;
  shouldClearDraft: boolean;
  requestId?: string;
  localEvent?: unknown;
}

function withOperatorInputIdempotencyKey(frame: SessionProtocolFrame | null, override: OperatorInputIdempotencyKey | null): SessionProtocolFrame | null {
  if (!frame || !isIdempotentOperatorMethod(frame.method)) return frame;
  const params = frame.params && typeof frame.params === 'object' ? frame.params : {};
  const existing = typeof params.idempotency_key === 'string' && params.idempotency_key.trim()
    ? params.idempotency_key.trim()
    : null;
  const idempotencyKey = normalizeIdempotencyKey(override) ?? existing ?? createIdempotencyKey(frame.method);
  return { ...frame, params: { ...params, idempotency_key: idempotencyKey } };
}

function isIdempotentOperatorMethod(method: string): boolean {
  return method === 'session.submit'
    || method === 'conversation.send'
    || method === 'conversation.enqueue'
    || method === 'conversation.steer'
    || method === 'session.close';
}

function normalizeIdempotencyKey(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function createIdempotencyKey(method: string): string {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (typeof randomUuid === 'function') return `agent-web-ui:${method}:${randomUuid.call(globalThis.crypto)}`;
  return `agent-web-ui:${method}:${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export interface AuthorityTransitionInputPolicy {
  input_policy?: string | null;
  stale_source?: boolean | null;
  superseded_by_session_id?: string | null;
  authority_locator_ref?: string | null;
}

export type OperatorInputDeliveryMode = 'default' | 'enqueue';
export type OperatorInputIdempotencyKey = string;
export type ProtocolMethodSupport = (method: string) => boolean;
export type SessionFrameSender = (frame: SessionProtocolFrame) => boolean;

export function submitOperatorInput(text: string, connection: NarsClientConnection | null, authorityTransition: AuthorityTransitionInputPolicy | null = null, deliveryMode: OperatorInputDeliveryMode = 'default', canSteerActiveTurn: boolean | null = null, supportsProtocolMethod: ProtocolMethodSupport | null = null, sendFrame: SessionFrameSender | null = null, activeTurnIdOverride: string | boolean | null | undefined = undefined, idempotencyKeyOverride: OperatorInputIdempotencyKey | null = null): OperatorInputResult {
  const activeTurnId = activeTurnIdOverride === undefined ? connection?.activeTurnId : activeTurnIdOverride;
  const activeTurn = canSteerActiveTurn ?? Boolean(activeTurnId);
  const action = buildAgentWebUiOperatorInputAction(text, {
    activeTurn,
    activeTurnId,
    ...(deliveryMode === 'enqueue' ? { deliveryMode: 'enqueue' } : {}),
  });
  if (!action) return { handled: false, shouldClearDraft: false };
  if (action.kind === 'local_help') {
    return { handled: true, shouldClearDraft: true, localEvent: { event: 'agent_web_ui_help', content: buildAgentWebUiHelpText({ supportsProtocolMethod: supportsProtocolMethod ?? undefined }) } };
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
  const frame = withOperatorInputIdempotencyKey(toSessionProtocolFrame(action.frame), idempotencyKeyOverride);
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
        request_id: frame.id,
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
        request_id: frame.id,
        method: frame.method,
        authority_transition: authorityTransition,
      },
    };
  }
  const sent = sendFrame ? sendFrame(frame) : connection?.sendFrame(frame) ?? false;
  if (!sent) return { handled: false, shouldClearDraft: false, localEvent: { event: 'web_ui_input_not_sent', request_id: frame.id, method: frame.method, message: 'event stream is not open' } };
  return {
    handled: true,
    shouldClearDraft: true,
    requestId: frame.id,
    localEvent: operatorInputSubmittedEvent(frame, deliveryMode, connection?.transportCorrelation),
  };
}

export function submitOperatorConversationText(text: string, connection: NarsClientConnection | null, authorityTransition: AuthorityTransitionInputPolicy | null = null, deliveryMode: OperatorInputDeliveryMode = 'default', supportsProtocolMethod: ProtocolMethodSupport | null = null, sendFrame: SessionFrameSender | null = null, idempotencyKeyOverride: OperatorInputIdempotencyKey | null = null): OperatorInputResult {
  const frame = withOperatorInputIdempotencyKey(toSessionProtocolFrame(deliveryMode === 'enqueue'
    ? buildConversationInputFrame('conversation.enqueue', text)
    : buildConversationInputFrame('conversation.send', text)), idempotencyKeyOverride);
  if (!frame) return { handled: false, shouldClearDraft: false };
  if (supportsProtocolMethod && !supportsProtocolMethod(frame.method)) {
    return {
      handled: false,
      shouldClearDraft: false,
      localEvent: {
        event: 'web_ui_input_not_sent',
        message: 'control is not admitted by the attached runtime',
        reason_code: 'unsupported_session_control',
        request_id: frame.id,
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
        request_id: frame.id,
        method: frame.method,
        authority_transition: authorityTransition,
      },
    };
  }
  const sent = sendFrame ? sendFrame(frame) : connection?.sendFrame(frame) ?? false;
  if (!sent) return { handled: false, shouldClearDraft: false, localEvent: { event: 'web_ui_input_not_sent', request_id: frame.id, method: frame.method, message: 'event stream is not open' } };
  return {
    handled: true,
    shouldClearDraft: true,
    requestId: frame.id,
    localEvent: operatorInputSubmittedEvent(frame, deliveryMode, connection?.transportCorrelation),
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

function operatorInputSubmittedEvent(frame: SessionProtocolFrame, operatorDeliveryMode: OperatorInputDeliveryMode, correlation: SessionTransportCorrelation | undefined) {
  const params = frame.params && typeof frame.params === 'object' ? frame.params : {};
  return {
    event: 'operator_input_submitted',
    request_id: frame.id,
    method: frame.method,
    content: params.message ?? params.content ?? params.command ?? frame.method,
    source: params.source ?? null,
    delivery_mode: params.delivery_mode ?? null,
    operator_delivery_mode: operatorDeliveryMode,
    idempotency_key: typeof params.idempotency_key === 'string' ? params.idempotency_key : null,
    active_turn_id: params.active_turn_id ?? null,
    transport: correlation?.transport ?? null,
    endpoint: correlation?.endpoint ?? null,
    session_id: correlation?.session_id ?? null,
    socket_generation: correlation?.socket_generation ?? null,
  };
}
