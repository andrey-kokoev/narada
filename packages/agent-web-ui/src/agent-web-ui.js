import {
  AGENT_WEB_UI_NARS_METHOD_LIST,
  AGENT_WEB_UI_NARS_METHODS,
  isAgentWebUiNarsMethod,
  isAgentWebUiProtocolFrame,
} from '@narada2/nars-client-projection-contract';
import { readInjectedConfig, resolveAttachConfig } from './config.js';
import { connectEvents, buildSubscribeFrame, reconnectDelayForAttempt } from './event-stream.js';
import { refreshHttpHealthStatus } from './health.js';
import {
  bindComposer,
  buildConversationSendFrame,
  buildConversationSteerFrame,
  buildOperatorInputAction,
} from './input.js';
import {
  NARS_CLIENT_PROJECTION_DEFAULT_VERBOSITY,
  NARS_CLIENT_PROJECTION_VERBOSITY_LEVELS,
  applyRuntimeEventToWebUiState,
  normalizeNarsClientProjectionVerbosity,
  projectRuntimeEvent,
  shouldRenderRuntimeEvent,
  summarizeRuntimeEvent,
  unwrapRuntimeEvent,
} from './runtime-events.js';
import { rerenderEvents, setText } from './render.js';

export {
  AGENT_WEB_UI_NARS_METHOD_LIST,
  AGENT_WEB_UI_NARS_METHODS,
  NARS_CLIENT_PROJECTION_DEFAULT_VERBOSITY,
  NARS_CLIENT_PROJECTION_VERBOSITY_LEVELS,
  isAgentWebUiNarsMethod,
  isAgentWebUiProtocolFrame,
  applyRuntimeEventToWebUiState,
  normalizeNarsClientProjectionVerbosity,
  projectRuntimeEvent,
  shouldRenderRuntimeEvent,
  buildConversationSendFrame,
  buildConversationSteerFrame,
  buildOperatorInputAction,
  buildSubscribeFrame,
  reconnectDelayForAttempt,
  readInjectedConfig,
  refreshHttpHealthStatus,
  resolveAttachConfig,
  summarizeRuntimeEvent,
  unwrapRuntimeEvent,
};

export function startAgentWebUi({ windowRef = globalThis.window, documentRef = globalThis.document } = {}) {
  if (!windowRef || !documentRef) return null;
  const config = resolveAttachConfig(windowRef.location?.search ?? '', readInjectedConfig(documentRef));
  bindProjectionVerbositySelector(documentRef);
  setText('event-endpoint', config.eventEndpoint ?? 'not configured', documentRef);
  setText('health-endpoint', config.healthEndpoint ? `${config.healthEndpoint} (${config.healthTransport})` : 'not configured', documentRef);
  const fetchFn = windowRef.fetch ?? globalThis.fetch;
  refreshHttpHealthStatus(config.healthEndpoint, documentRef, fetchFn);
  const healthTimer = config.healthEndpoint ? windowRef.setInterval(() => refreshHttpHealthStatus(config.healthEndpoint, documentRef, fetchFn), 10000) : null;
  const connection = connectEvents(config.eventEndpoint, config.maxReplay, documentRef, windowRef.WebSocket ?? globalThis.WebSocket, {
    setTimeout: windowRef.setTimeout ?? globalThis.setTimeout,
    clearTimeout: windowRef.clearTimeout ?? globalThis.clearTimeout,
  });
  bindComposer(connection, documentRef);
  return { config, socket: connection?.getSocket?.() ?? null, connection, healthTimer };
}

function bindProjectionVerbositySelector(documentRef) {
  const selector = documentRef.getElementById?.('projection-verbosity');
  if (!selector) return;
  if (Array.isArray(selector.children) && selector.children.length === 0 && typeof documentRef.createElement === 'function') {
    for (const level of NARS_CLIENT_PROJECTION_VERBOSITY_LEVELS) {
      const option = documentRef.createElement('option');
      option.value = level;
      option.textContent = level;
      selector.append(option);
    }
  }
  selector.value = normalizeNarsClientProjectionVerbosity(selector.value || NARS_CLIENT_PROJECTION_DEFAULT_VERBOSITY);
  selector.addEventListener?.('change', () => rerenderEvents(documentRef));
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => startAgentWebUi());
}
