import {
  buildAgentWebUiConversationSendFrame,
  buildAgentWebUiConversationEnqueueFrame,
  buildAgentWebUiConversationSteerFrame,
  buildAgentWebUiHelpText,
  buildAgentWebUiOperatorInputAction,
  isAgentWebUiProtocolFrame,
} from '@narada2/nars-client-projection-contract';
import { appendEvent, clearEvents } from './render.js';
import { readInjectedConfig, resolveAttachConfig } from './config.js';

export const buildOperatorInputAction = buildAgentWebUiOperatorInputAction;
export const buildConversationSendFrame = buildAgentWebUiConversationSendFrame;
export const buildConversationEnqueueFrame = buildAgentWebUiConversationEnqueueFrame;
export const buildConversationSteerFrame = buildAgentWebUiConversationSteerFrame;

export function sendOperatorMessage(socketOrConnection, text, documentRef = document) {
  const connection = socketOrConnection?.getSocket ? socketOrConnection : null;
  const socket = connection ? connection.getSocket() : socketOrConnection;
  const action = buildOperatorInputAction(text, {
    activeTurn: Boolean(connection?.activeTurnId),
    activeTurnId: connection?.activeTurnId,
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
  const frame = action.frame;
  const authorityRefusal = authorityInputRefusal(frame, documentRef);
  if (authorityRefusal) {
    appendEvent(authorityRefusal, documentRef);
    return false;
  }
  if (!isAgentWebUiProtocolFrame(frame)) throw new Error('unsupported_agent_web_ui_protocol_frame');
  if (typeof connection?.sendFrame === 'function') {
    const sent = connection.sendFrame(frame);
    if (!sent) {
      appendEvent({ event: 'web_ui_input_not_sent', message: 'event stream is not open' }, documentRef);
      return false;
    }
    appendEvent({ event: 'operator_input_submitted', request_id: frame.id, content: frame.params?.message ?? frame.params?.command ?? frame.method }, documentRef);
    if (frame.method === 'session.close') connection?.close?.();
    return true;
  }
  const openState = socket?.constructor?.OPEN ?? globalThis.WebSocket?.OPEN ?? 1;
  if (socket?.readyState !== openState) {
    appendEvent({ event: 'web_ui_input_not_sent', message: 'event stream is not open' }, documentRef);
    return false;
  }
  socket.send(JSON.stringify(frame));
  appendEvent({ event: 'operator_input_submitted', request_id: frame.id, content: frame.params?.message ?? frame.params?.command ?? frame.method }, documentRef);
  if (frame.method === 'session.close') connection?.close?.();
  return true;
}

function authorityInputRefusal(frame, documentRef) {
  if (!String(frame?.method ?? '').startsWith('conversation.')) return null;
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
}
