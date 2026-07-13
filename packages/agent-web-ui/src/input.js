import {
  buildAgentWebUiConversationSendFrame,
  buildAgentWebUiConversationEnqueueFrame,
  buildAgentWebUiConversationSteerFrame,
  buildAgentWebUiHelpText,
  buildAgentWebUiOperatorInputAction,
  isAgentWebUiCloudflareProtocolFrame,
  translateAgentWebUiFrameForCloudflare,
} from '@narada2/nars-client-projection-contract';
import { appendEvent, clearEvents } from './render.js';
import { readInjectedConfig, resolveAttachConfig } from './config.js';
import { toSessionProtocolFrame } from './protocol/session-frame.js';

export function buildConversationSendFrame(message, options = {}) {
  return toSessionProtocolFrame(translateDeprecatedInputFrame(buildAgentWebUiConversationSendFrame(message, options)));
}

export function buildConversationEnqueueFrame(message, options = {}) {
  return toSessionProtocolFrame(translateDeprecatedInputFrame(buildAgentWebUiConversationEnqueueFrame(message, options)));
}

export function buildConversationSteerFrame(message, options = {}) {
  return toSessionProtocolFrame(translateDeprecatedInputFrame(buildAgentWebUiConversationSteerFrame(message, options), { forceSteer: true }));
}

export function buildOperatorInputAction(text, options = {}) {
  const action = buildAgentWebUiOperatorInputAction(text, options);
  const command = String(text ?? '').trim().toLowerCase();
  if (command.startsWith('/json ') && action?.kind === 'message') {
    try {
      const frame = JSON.parse(String(text).trim().slice(5));
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
  if (command === '/status' && normalizedFrame.method === 'session.health') return { ...action, frame: { ...normalizedFrame, method: 'session.status' } };
  return { ...action, frame: normalizedFrame };
}

export function sendOperatorMessage(socketOrConnection, text, documentRef = document, deliveryMode = 'default') {
  const connection = socketOrConnection?.getSocket ? socketOrConnection : null;
  const socket = connection ? connection.getSocket() : socketOrConnection;
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
    appendEvent({ event: 'agent_web_ui_message', message: action.message }, documentRef);
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
  const openState = socket?.constructor?.OPEN ?? globalThis.WebSocket?.OPEN ?? 1;
  if (socket?.readyState !== openState) {
    appendEvent({ event: 'web_ui_input_not_sent', message: 'event stream is not open' }, documentRef);
    return false;
  }
  socket.send(JSON.stringify(frame));
  appendEvent({ event: 'operator_input_submitted', request_id: frame.id, content: frame.params?.content ?? frame.params?.message ?? frame.params?.command ?? frame.method }, documentRef);
  return true;
}

function translateDeprecatedInputFrame(frame, { forceSteer = false } = {}) {
  if (!frame || typeof frame !== 'object') return frame;
  if (frame.method !== 'session.submit') return translateAgentWebUiFrameForCloudflare(frame);
  const params = frame.params && typeof frame.params === 'object' ? frame.params : {};
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

function authorityInputRefusal(frame, documentRef) {
  if (!['session.submit', 'conversation.send', 'conversation.enqueue', 'conversation.steer'].includes(String(frame?.method ?? ''))) return null;
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

export function bindComposer(connection, documentRef = document) {
  const form = documentRef.getElementById('operator-form');
  const input = documentRef.getElementById('operator-input');
  if (!form || !input) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (sendOperatorMessage(connection, input.value, documentRef)) input.value = '';
  });
  input.addEventListener?.('keydown', (event) => {
    if (event.key !== 'Tab') return;
    event.preventDefault();
    if (sendOperatorMessage(connection, input.value, documentRef, 'enqueue')) input.value = '';
  });
}
