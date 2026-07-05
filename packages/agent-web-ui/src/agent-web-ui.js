import {
  AGENT_WEB_UI_NARS_METHOD_LIST,
  AGENT_WEB_UI_NARS_METHODS,
  buildAgentWebUiDelegationSummaryFrame as buildDelegationSummaryRequestFrame,
  buildAgentWebUiEventsReadFrame as buildEventsReadFrame,
  buildAgentWebUiGitSummaryFrame as buildGitSummaryRequestFrame,
  buildAgentWebUiInboxSummaryFrame as buildInboxSummaryRequestFrame,
  buildAgentWebUiMailboxSummaryFrame as buildMailboxSummaryRequestFrame,
  buildAgentWebUiSchedulerSummaryFrame as buildSchedulerSummaryRequestFrame,
  buildAgentWebUiTaskLifecycleSummaryFrame as buildTaskLifecycleSummaryRequestFrame,
  buildAgentWebUiSopSummaryFrame as buildSopSummaryRequestFrame,
  buildAgentWebUiSurfaceAffordancesFrame as buildSurfaceAffordancesRequestFrame,
  isAgentWebUiNarsMethod,
  isAgentWebUiProtocolFrame,
} from '@narada2/nars-client-projection-contract';
import { readInjectedConfig, resolveAttachConfig } from './config.js';
import { connectEvents, buildSubscribeFrame, reconnectDelayForAttempt } from './event-stream.js';
import { refreshHttpHealthStatus } from './health.js';
import {
  bindComposer,
  buildConversationEnqueueFrame,
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

export const AGENT_WEB_UI_DEFAULT_VERBOSITY = 'conversation';

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
  buildDelegationSummaryRequestFrame,
  buildGitSummaryRequestFrame,
  buildInboxSummaryRequestFrame,
  buildConversationEnqueueFrame,
  buildEventsReadFrame,
  buildMailboxSummaryRequestFrame,
  buildSchedulerSummaryRequestFrame,
  buildTaskLifecycleSummaryRequestFrame,
  buildConversationSendFrame,
  buildConversationSteerFrame,
  buildOperatorInputAction,
  buildSopSummaryRequestFrame,
  buildSurfaceAffordancesRequestFrame,
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
  renderAuthorityTransition(config.authorityTransition, documentRef);
  const fetchFn = windowRef.fetch ?? globalThis.fetch;
  refreshHttpHealthStatus(config, documentRef, fetchFn);
  const healthTimer = config.healthEndpoint ? windowRef.setInterval(() => refreshHttpHealthStatus(config, documentRef, fetchFn), 10000) : null;
  const connection = connectEvents(config, config.maxReplay, documentRef, windowRef.WebSocket ?? globalThis.WebSocket, {
    setTimeout: windowRef.setTimeout ?? globalThis.setTimeout,
    clearTimeout: windowRef.clearTimeout ?? globalThis.clearTimeout,
    fetch: fetchFn,
  });
  bindComposer(connection, documentRef);
  return { config, socket: connection?.getSocket?.() ?? null, connection, healthTimer };
}

export function renderAuthorityTransition(authorityTransition, documentRef = globalThis.document) {
  const status = documentRef?.getElementById?.('authority-status');
  const reattach = documentRef?.getElementById?.('authority-reattach');
  if (!status && !reattach) return;
  if (!authorityTransition) {
    if (status) status.textContent = 'not advertised';
    if (reattach) reattach.textContent = '';
    return;
  }
  const host = authorityTransition.authority_runtime_host ?? 'unknown';
  const epoch = Number.isInteger(authorityTransition.authority_epoch) ? ` e${authorityTransition.authority_epoch}` : '';
  const transition = authorityTransition.authority_transition_state ? ` · ${authorityTransition.authority_transition_state}` : '';
  const writeAdmission = authorityTransition.source_write_admission ? ` · writes ${authorityTransition.source_write_admission}` : '';
  if (status) status.textContent = `${host}${epoch}${transition}${writeAdmission}`;
  if (!reattach) return;
  const targetSession = authorityTransition.reattach?.target_session_id ?? authorityTransition.superseded_by_session_id ?? null;
  const targetRef = authorityTransition.reattach?.target_locator_ref ?? authorityTransition.authority_locator_ref ?? null;
  reattach.textContent = authorityTransition.stale_source
    ? `Stale authority; reattach to ${targetSession ?? targetRef ?? 'target authority'}.`
    : '';
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
  selector.value = normalizeNarsClientProjectionVerbosity(selector.value || AGENT_WEB_UI_DEFAULT_VERBOSITY);
  selector.addEventListener?.('change', () => rerenderEvents(documentRef));
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('app')) return;
    startAgentWebUi();
  });
}
