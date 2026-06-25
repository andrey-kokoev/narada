import {
  AGENT_WEB_UI_NARS_METHOD_LIST,
  AGENT_WEB_UI_NARS_METHODS,
  buildAgentWebUiConversationSendFrame,
  buildAgentWebUiHelpText,
  buildAgentWebUiOperatorInputAction,
  buildAgentWebUiSubscribeFrame,
  isAgentWebUiNarsMethod,
  isAgentWebUiProtocolFrame,
} from '@narada2/nars-client-projection-contract';

export {
  AGENT_WEB_UI_NARS_METHOD_LIST,
  AGENT_WEB_UI_NARS_METHODS,
  isAgentWebUiNarsMethod,
  isAgentWebUiProtocolFrame,
} from '@narada2/nars-client-projection-contract';

export const buildOperatorInputAction = buildAgentWebUiOperatorInputAction;
export const buildConversationSendFrame = buildAgentWebUiConversationSendFrame;
export const buildSubscribeFrame = buildAgentWebUiSubscribeFrame;

export function readInjectedConfig(documentRef = globalThis.document) {
  const element = documentRef?.getElementById?.('nars-config');
  if (!element?.textContent?.trim()) return {};
  try {
    return JSON.parse(element.textContent);
  } catch {
    return {};
  }
}

export function resolveAttachConfig(search = '', injectedConfig = {}) {
  const params = new URLSearchParams(String(search).replace(/^\?/, ''));
  const value = (...keys) => {
    for (const key of keys) {
      const fromQuery = params.get(key);
      if (fromQuery) return fromQuery;
      const fromConfig = injectedConfig[key];
      if (fromConfig) return fromConfig;
    }
    return null;
  };
  return {
    eventEndpoint: value('event_endpoint', 'eventEndpoint', 'events'),
    healthEndpoint: value('health_endpoint', 'healthEndpoint', 'health'),
    maxReplay: Number.parseInt(value('max_replay', 'maxReplay') ?? '100', 10) || 100,
  };
}

export function unwrapRuntimeEvent(message) {
  if (message?.event === 'session_event' && message.payload && typeof message.payload === 'object') {
    return message.payload;
  }
  return message;
}

export function summarizeRuntimeEvent(message) {
  const event = unwrapRuntimeEvent(message);
  const kind = event?.event ?? 'unknown';
  if (kind === 'assistant_message') return event.content ?? event.message ?? 'assistant message';
  if (kind === 'user_message') return event.content ?? event.message ?? 'operator message';
  if (kind === 'tool_call') return event.tool_name ?? event.name ?? 'tool call';
  if (kind === 'tool_result') return event.tool_name ?? event.name ?? 'tool result';
  if (kind === 'session_started') return `${event.agent_id ?? 'agent'} / ${event.session_id ?? 'session'}`;
  if (kind === 'session_events_subscription_started') return `${event.replay_count ?? 0} replayed event(s)`;
  if (kind === 'error' || kind === 'websocket_error') return event.message ?? event.code ?? 'error';
  if (typeof event?.message === 'string') return event.message;
  if (typeof event?.content === 'string') return event.content;
  return '';
}

function setText(id, text, documentRef = document) {
  const element = documentRef.getElementById(id);
  if (element) element.textContent = text;
}

function appendEvent(event, documentRef = document) {
  const list = documentRef.getElementById('events');
  if (!list) return;
  const runtimeEvent = unwrapRuntimeEvent(event);
  const item = documentRef.createElement('li');
  item.className = `event event-${String(runtimeEvent?.event ?? 'unknown').replace(/[^a-z0-9_-]/gi, '-')}`;
  const heading = documentRef.createElement('div');
  heading.className = 'event-heading';
  heading.textContent = runtimeEvent?.event ?? 'unknown';
  const detail = documentRef.createElement('pre');
  detail.className = 'event-detail';
  detail.textContent = summarizeRuntimeEvent(event) || JSON.stringify(runtimeEvent, null, 2);
  item.append(heading, detail);
  list.append(item);
  list.scrollTop = list.scrollHeight;
}

function sequenceFromRuntimeMessage(message) {
  const event = unwrapRuntimeEvent(message);
  const sequence = message?.cursor?.sequence ?? event?.event_sequence ?? event?.sequence;
  return Number.isFinite(sequence) ? sequence : null;
}

async function refreshHealth(endpoint, documentRef = document, fetchFn = globalThis.fetch) {
  if (!endpoint) {
    setText('health', 'health endpoint not configured', documentRef);
    return;
  }
  try {
    const response = await fetchFn(endpoint, { method: 'GET', cache: 'no-store' });
    const body = await response.json();
    setText('health', `${body.status ?? response.status} · ${body.agent_id ?? 'agent'} · ${body.session_id ?? 'session'}`, documentRef);
  } catch (error) {
    setText('health', `health unavailable · ${error instanceof Error ? error.message : String(error)}`, documentRef);
  }
}

function sendOperatorMessage(socketOrConnection, text, documentRef = document) {
  const connection = socketOrConnection?.getSocket ? socketOrConnection : null;
  const socket = connection ? connection.getSocket() : socketOrConnection;
  const action = buildOperatorInputAction(text);
  if (!action) return false;
  if (action.kind === 'local_help') {
    appendEvent({ event: 'agent_web_ui_help', content: buildAgentWebUiHelpText() }, documentRef);
    return true;
  }
  if (action.kind === 'local_clear') {
    const list = documentRef.getElementById('events');
    if (list) list.textContent = '';
    return true;
  }
  if (action.kind === 'message') {
    appendEvent({ event: 'agent_web_ui_message', message: action.message }, documentRef);
    return false;
  }
  const frame = action.frame;
  if (!isAgentWebUiProtocolFrame(frame)) throw new Error('unsupported_agent_web_ui_protocol_frame');
  const openState = socket?.constructor?.OPEN ?? globalThis.WebSocket?.OPEN ?? 1;
  if (socket?.readyState !== openState) {
    appendEvent({ event: 'web_ui_input_not_sent', message: 'event stream is not open' }, documentRef);
    return false;
  }
  socket.send(JSON.stringify(frame));
  appendEvent({ event: 'operator_input_submitted', content: frame.params?.message ?? frame.params?.command ?? frame.method }, documentRef);
  if (frame.method === 'session.close') connection?.close?.();
  return true;
}

function bindComposer(connection, documentRef = document) {
  const form = documentRef.getElementById('operator-form');
  const input = documentRef.getElementById('operator-input');
  if (!form || !input) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (sendOperatorMessage(connection, input.value, documentRef)) input.value = '';
  });
}

function connectEvents(endpoint, maxReplay, documentRef = document, WebSocketCtor = globalThis.WebSocket, setTimeoutFn = globalThis.setTimeout) {
  if (!endpoint) {
    setText('stream', 'event endpoint not configured', documentRef);
    return null;
  }
  const connection = {
    socket: null,
    closed: false,
    lastSequence: null,
    reconnectTimer: null,
    getSocket() { return this.socket; },
    close() {
      this.closed = true;
      this.socket?.close?.();
    },
  };
  const connect = () => {
    const socket = new WebSocketCtor(endpoint);
    connection.socket = socket;
    socket.addEventListener('open', () => {
      setText('stream', 'subscribing', documentRef);
      const frame = buildSubscribeFrame({
        maxReplay,
        ...(connection.lastSequence === null ? {} : { sinceSequence: connection.lastSequence }),
      });
      if (!isAgentWebUiProtocolFrame(frame)) throw new Error('unsupported_agent_web_ui_protocol_frame');
      socket.send(JSON.stringify(frame));
    });
    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data);
        const sequence = sequenceFromRuntimeMessage(message);
        if (sequence !== null) connection.lastSequence = sequence;
        setText('stream', 'connected', documentRef);
        appendEvent(message, documentRef);
      } catch (error) {
        appendEvent({ event: 'web_ui_decode_error', message: error instanceof Error ? error.message : String(error) }, documentRef);
      }
    });
    socket.addEventListener('close', () => {
      if (connection.closed) {
        setText('stream', 'closed', documentRef);
        return;
      }
      setText('stream', 'reconnecting', documentRef);
      connection.reconnectTimer = setTimeoutFn(connect, 1000);
    });
    socket.addEventListener('error', () => setText('stream', 'error', documentRef));
  };
  connect();
  return connection;
}

export function startAgentWebUi({ windowRef = globalThis.window, documentRef = globalThis.document } = {}) {
  if (!windowRef || !documentRef) return null;
  const config = resolveAttachConfig(windowRef.location?.search ?? '', readInjectedConfig(documentRef));
  setText('event-endpoint', config.eventEndpoint ?? 'not configured', documentRef);
  setText('health-endpoint', config.healthEndpoint ?? 'not configured', documentRef);
  const fetchFn = windowRef.fetch ?? globalThis.fetch;
  refreshHealth(config.healthEndpoint, documentRef, fetchFn);
  const healthTimer = config.healthEndpoint ? windowRef.setInterval(() => refreshHealth(config.healthEndpoint, documentRef, fetchFn), 10000) : null;
  const connection = connectEvents(config.eventEndpoint, config.maxReplay, documentRef, windowRef.WebSocket ?? globalThis.WebSocket, windowRef.setTimeout ?? globalThis.setTimeout);
  bindComposer(connection, documentRef);
  return { config, socket: connection?.getSocket?.() ?? null, connection, healthTimer };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => startAgentWebUi());
}
