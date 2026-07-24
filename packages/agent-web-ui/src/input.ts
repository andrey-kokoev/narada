import {
  buildAgentWebUiConversationSendFrame,
  buildAgentWebUiConversationEnqueueFrame,
  buildAgentWebUiConversationSteerFrame,
  buildAgentWebUiHelpText,
  buildAgentWebUiOperatorInputAction,
  isAgentWebUiCloudflareProtocolFrame,
  translateAgentWebUiFrameForCloudflare,
} from '@narada2/nars-client-projection-contract';
import { appendEvent, clearEvents } from './render.ts';
import { readInjectedConfig, resolveAttachConfig } from './config.ts';
import { toSessionProtocolFrame, type SessionProtocolFrame } from './protocol/session-frame.ts';
import { isRecord, type UnknownRecord } from './types.ts';

type InputFrameOptions = {
  activeTurn?: boolean;
  activeTurnId?: string | null;
  deliveryMode?: string;
  [key: string]: unknown;
};

type OperatorAction = {
  kind: string;
  frame?: unknown;
  message?: string;
  [key: string]: unknown;
};

type ConnectionLike = {
  getSocket?: () => WebSocket | null;
  activeTurnId?: string | null;
  sendFrame?: (frame: UnknownRecord) => boolean;
};

export function buildConversationSendFrame(
  message: unknown,
  options: InputFrameOptions = {},
): SessionProtocolFrame | null {
  return toSessionProtocolFrame(
    translateDeprecatedInputFrame(buildAgentWebUiConversationSendFrame(message, options)),
  );
}

export function buildConversationEnqueueFrame(
  message: unknown,
  options: InputFrameOptions = {},
): SessionProtocolFrame | null {
  return toSessionProtocolFrame(
    translateDeprecatedInputFrame(buildAgentWebUiConversationEnqueueFrame(message, options)),
  );
}

export function buildConversationSteerFrame(
  message: unknown,
  options: InputFrameOptions = {},
): SessionProtocolFrame | null {
  return toSessionProtocolFrame(
    translateDeprecatedInputFrame(
      buildAgentWebUiConversationSteerFrame(message, options),
      { forceSteer: true },
    ),
  );
}

export function buildOperatorInputAction(
  text: unknown,
  options: InputFrameOptions = {},
): OperatorAction | null {
  const action = buildAgentWebUiOperatorInputAction(text, options) as OperatorAction | null;
  const command = String(text ?? '').trim().toLowerCase();
  if (command.startsWith('/json ') && action?.kind === 'message') {
    try {
      const frame: unknown = JSON.parse(String(text).trim().slice(5));
      if (isAgentWebUiCloudflareProtocolFrame(frame)) return { kind: 'frame', frame };
      return { kind: 'message', message: 'JSON frame method is not admitted for agent-web-ui.' };
    } catch {
      return action;
    }
  }
  if (action?.kind !== 'frame' || !action.frame) return action;
  const frame = translateDeprecatedInputFrame(action.frame, {
    forceSteer: !command.startsWith('/') && options.activeTurn === true && options.deliveryMode !== 'enqueue',
  });
  const normalizedFrame = toSessionProtocolFrame(frame);
  if (!normalizedFrame) return { kind: 'message', message: 'Protocol frame is not admitted by agent-web-ui.' };
  if (command === '/status' && normalizedFrame.method === 'session.health') {
    return { ...action, frame: { ...normalizedFrame, method: 'session.status' } };
  }
  return { ...action, frame: normalizedFrame };
}

export function sendOperatorMessage(
  socketOrConnection: WebSocket | ConnectionLike | null | undefined,
  text: unknown,
  documentRef: Document | undefined = globalThis.document,
  deliveryMode: 'default' | 'enqueue' = 'default',
): boolean {
  const connection: ConnectionLike | null = socketOrConnection && 'getSocket' in socketOrConnection
    ? socketOrConnection
    : null;
  const socket = connection ? connection.getSocket?.() : socketOrConnection as WebSocket | null | undefined;
  const action = buildOperatorInputAction(text, {
    activeTurn: Boolean(connection?.activeTurnId),
    activeTurnId: connection?.activeTurnId,
    ...(deliveryMode === 'enqueue' ? { deliveryMode: 'enqueue' } : {}),
  });
  if (!action) return false;
  if (action.kind === 'local_help') {
    appendEvent({ event: 'agent_web_ui_help', content: buildAgentWebUiHelpText() }, documentRef);
    return true;
  }
  if (action.kind === 'local_clear') {
    clearEvents(documentRef);
    return true;
  }
  if (action.kind === 'message') {
    appendEvent({ event: 'agent_web_ui_message', message: action.message ?? '' }, documentRef);
    return false;
  }
  const frame = toSessionProtocolFrame(action.frame);
  if (!frame) {
    appendEvent({ event: 'web_ui_input_not_sent', message: 'control frame was not admitted by the client contract', reason_code: 'invalid_session_control' }, documentRef);
    return false;
  }
  const authorityRefusal = authorityInputRefusal(frame, documentRef);
  if (authorityRefusal) {
    appendEvent(authorityRefusal, documentRef);
    return false;
  }
  if (!isAgentWebUiCloudflareProtocolFrame(frame)) throw new Error('unsupported_agent_web_ui_protocol_frame');
  if (typeof connection?.sendFrame === 'function') {
    const sent = connection.sendFrame(frame);
    if (!sent) {
      appendEvent({ event: 'web_ui_input_not_sent', message: 'event stream is not open' }, documentRef);
      return false;
    }
    appendEvent({ event: 'operator_input_submitted', request_id: frame.id, content: frame.params?.content ?? frame.params?.message ?? frame.params?.command ?? frame.method }, documentRef);
    return true;
  }
  const openState = globalThis.WebSocket?.OPEN ?? 1;
  if (!socket || socket.readyState !== openState) {
    appendEvent({ event: 'web_ui_input_not_sent', message: 'event stream is not open' }, documentRef);
    return false;
  }
  socket.send(JSON.stringify(frame));
  appendEvent({ event: 'operator_input_submitted', request_id: frame.id, content: frame.params?.content ?? frame.params?.message ?? frame.params?.command ?? frame.method }, documentRef);
  return true;
}

function translateDeprecatedInputFrame(
  frame: unknown,
  { forceSteer = false }: { forceSteer?: boolean } = {},
): unknown {
  if (!isRecord(frame)) return frame;
  if (frame.method !== 'session.submit') return translateAgentWebUiFrameForCloudflare(frame);
  const params = isRecord(frame.params) ? frame.params : {};
  const method = forceSteer
    ? 'conversation.steer'
    : params.delivery_mode === 'admit_after_active_turn'
      ? 'conversation.enqueue'
      : 'conversation.send';
  return {
    ...frame,
    method,
    params: {
      message: params.content ?? params.message ?? '',
      source: 'agent-web-ui',
      ...(params.active_turn_id ? { active_turn_id: params.active_turn_id } : {}),
    },
  };
}

function authorityInputRefusal(
  frame: SessionProtocolFrame,
  documentRef: Document | undefined,
): UnknownRecord | null {
  if (!['session.submit', 'conversation.send', 'conversation.enqueue', 'conversation.steer'].includes(frame.method)) return null;
  const config = resolveAttachConfig('', readInjectedConfig(documentRef));
  const authority = config.authorityTransition;
  if (!authority || authority.input_policy === 'enabled') return null;
  return {
    event: 'web_ui_input_not_sent',
    message: 'source authority is sealed; reattach to target authority before sending conversation input',
    reason_code: 'source_authority_superseded',
    authority_transition: authority,
  };
}

export function bindComposer(connection: ConnectionLike | null, documentRef: Document | undefined = globalThis.document): void {
  const form = documentRef?.getElementById('operator-form');
  const input = documentRef?.getElementById('operator-input');
  if (!(form instanceof HTMLFormElement) || !(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (sendOperatorMessage(connection, input.value, documentRef)) input.value = '';
  });
  input.addEventListener('keydown', (event: Event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key !== 'Tab') return;
    event.preventDefault();
    if (sendOperatorMessage(connection, input.value, documentRef, 'enqueue')) input.value = '';
  });
}
