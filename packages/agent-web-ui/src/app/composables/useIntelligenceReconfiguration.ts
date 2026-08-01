import { computed, ref, watch, type Ref } from 'vue';
import { NARS_RUNTIME_INTELLIGENCE_RECONFIGURE_METHOD } from '@narada-core/nars-client-projection-contract';
import { unwrapRuntimeEvent } from '../../runtime-events.ts';
import { buildIntelligenceReconfigureCancelFrame, buildIntelligenceReconfigureFrame } from '../lib/narsFrames';
import type { IntelligenceSelectionDraft } from '../lib/intelligenceSelection';

// The frame builder is contract-owned; this identifier is only used to ask
// whether the attached local surface admits the dedicated cancel method.
const INTELLIGENCE_RECONFIGURE_CANCEL_METHOD = 'runtime.intelligence.reconfigure.cancel';

export type IntelligenceReconfigurationPhase =
  | 'idle'
  | 'dispatching'
  | 'accepted'
  | 'switching'
  | 'cancelling'
  | 'applied'
  | 'cancelled'
  | 'refused'
  | 'failed'
  | 'unconfirmed';

export interface IntelligenceReconfigurationUiState {
  phase: IntelligenceReconfigurationPhase;
  requestId: string | null;
  cancelRequestId: string | null;
  reason: string | null;
  message: string | null;
}

export interface IntelligenceReconfigurationOptions {
  events: readonly unknown[];
  streamLive?: Readonly<Ref<boolean>>;
  health?: Readonly<Ref<Record<string, unknown> | null>>;
  send: (frame: any) => boolean;
  refreshHealth?: () => Promise<unknown> | void;
  supportsProtocolMethod: (method: string) => boolean;
}

const PENDING_PHASES = new Set<IntelligenceReconfigurationPhase>([
  'dispatching',
  'accepted',
  'switching',
  'cancelling',
  'unconfirmed',
]);

const CANCELLABLE_PHASES = new Set<IntelligenceReconfigurationPhase>(['dispatching', 'accepted']);

export const IDLE_INTELLIGENCE_RECONFIGURATION_STATE: IntelligenceReconfigurationUiState = Object.freeze({
  phase: 'idle',
  requestId: null,
  cancelRequestId: null,
  reason: null,
  message: null,
});

function recordFromEvent(event: unknown): Record<string, unknown> | null {
  return unwrapRuntimeEvent(event);
}

function eventKind(event: Record<string, unknown>): string {
  return typeof event.event === 'string' ? event.event : typeof event.event_kind === 'string' ? event.event_kind : '';
}

function textField(event: Record<string, unknown>, ...fields: string[]): string | null {
  for (const field of fields) {
    const value = event[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function terminalStateFor(event: Record<string, unknown>): string | null {
  return textField(event, 'reconfiguration_state', 'terminal_state', 'request_state');
}

function recordField(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function reconfigurationFromHealth(health: Record<string, unknown>): { requestId: string | null; state: string | null; reason: string | null } | null {
  const intelligence = recordField(health.intelligence);
  const reconfiguration = recordField(intelligence?.reconfiguration);
  if (!reconfiguration) return null;
  return {
    requestId: textField(reconfiguration, 'request_id'),
    state: textField(reconfiguration, 'terminal_state', 'reconfiguration_state', 'request_state'),
    reason: textField(reconfiguration, 'reason', 'error', 'code'),
  };
}

function outcomeForState(state: IntelligenceReconfigurationUiState, event: Record<string, unknown>, value: string): IntelligenceReconfigurationUiState {
  value = value.toLowerCase();
  const reason = textField(event, 'reason', 'error', 'code');
  if (value === 'requested' || value === 'validating' || value === 'admitted' || value === 'running') {
    return { ...state, phase: 'accepted', reason, message: reason };
  }
  if (value === 'switching') return { ...state, phase: 'switching', reason, message: reason };
  if (value === 'active' || value === 'completed') return { ...state, phase: 'applied', reason, message: reason };
  if (value === 'cancelled') return { ...state, phase: 'cancelled', reason, message: reason ?? 'Reconfiguration cancelled.' };
  if (value === 'refused' || value === 'rejected') return { ...state, phase: 'refused', reason, message: reason ?? 'Reconfiguration refused.' };
  if (value === 'failed' || value === 'interrupted') return { ...state, phase: 'failed', reason, message: reason ?? 'Reconfiguration failed.' };
  return state;
}

export function reduceIntelligenceReconfigurationEvent(
  state: IntelligenceReconfigurationUiState,
  eventValue: unknown,
): IntelligenceReconfigurationUiState {
  const event = recordFromEvent(eventValue);
  if (!event || !state.requestId) return state;
  const kind = eventKind(event);
  const requestId = textField(event, 'request_id');
  const targetRequestId = textField(event, 'target_request_id');

  if (kind === 'web_ui_input_not_sent' && requestId === state.requestId) {
    return { ...state, phase: 'failed', reason: textField(event, 'reason_code'), message: textField(event, 'message') ?? 'The reconfiguration was not sent.' };
  }
  if (kind === 'web_ui_input_not_sent' && requestId === state.cancelRequestId) {
    return { ...state, phase: 'unconfirmed', reason: textField(event, 'reason_code'), message: textField(event, 'message') ?? 'The cancellation was not sent; runtime state is unconfirmed.' };
  }
  if ((kind === 'websocket_error' || kind === 'projection_stream_unavailable') && PENDING_PHASES.has(state.phase)) {
    return { ...state, phase: 'unconfirmed', reason: textField(event, 'code'), message: textField(event, 'message') ?? 'Runtime result is unconfirmed while the event stream is unavailable.' };
  }

  if (requestId === state.cancelRequestId && kind === 'runtime_intelligence_reconfiguration_cancel') {
    const terminal = terminalStateFor(event);
    if (terminal) return outcomeForState(state, event, terminal);
    return state;
  }
  if (targetRequestId === state.requestId && kind === 'runtime_intelligence_reconfiguration_cancel') {
    const terminal = terminalStateFor(event);
    if (terminal) return outcomeForState(state, event, terminal);
    return state;
  }
  if (requestId !== state.requestId) return state;

  if (kind === 'session_control_accepted') return outcomeForState(state, event, 'running');
  if (kind === 'session_control_rejected') return outcomeForState(state, event, 'rejected');
  if (kind === 'runtime_request_state_transition') {
    const terminal = terminalStateFor(event);
    return terminal ? outcomeForState(state, event, terminal) : outcomeForState(state, event, textField(event, 'request_state') ?? 'running');
  }
  if (kind === 'intelligence_runtime_reconfiguration_state_transition' || kind === 'runtime_intelligence_reconfiguration') {
    const terminal = terminalStateFor(event);
    return terminal ? outcomeForState(state, event, terminal) : state;
  }
  return state;
}

function requestIdFor(prefix: string, sequence: number): string {
  return `agent-web-ui-${prefix}-${Date.now()}-${sequence}`;
}

export function useIntelligenceReconfiguration(options: IntelligenceReconfigurationOptions) {
  const state = ref<IntelligenceReconfigurationUiState>({ ...IDLE_INTELLIGENCE_RECONFIGURATION_STATE });
  const refreshing = ref(false);
  let sequence = 0;
  let eventFloor = 0;

  function reconcileHealth() {
    const current = state.value;
    if (!current.requestId || !PENDING_PHASES.has(current.phase) || !options.health?.value) return;
    const snapshot = reconfigurationFromHealth(options.health.value);
    if (!snapshot?.requestId || snapshot.requestId !== current.requestId || !snapshot.state) return;
    const event = snapshot.reason ? { reason: snapshot.reason } : {};
    state.value = outcomeForState(current, event, snapshot.state);
  }

  function reconcile() {
    if (!state.value.requestId) return;
    let next = state.value;
    for (const event of options.events.slice(eventFloor)) next = reduceIntelligenceReconfigurationEvent(next, event);
    state.value = next;
    reconcileHealth();
  }

  watch(() => options.events.length, reconcile, { immediate: true });
  if (options.health) watch(options.health, reconcileHealth, { immediate: true });
  if (options.streamLive) {
    watch(options.streamLive, (live) => {
      if (!live && PENDING_PHASES.has(state.value.phase)) {
        state.value = {
          ...state.value,
          phase: 'unconfirmed',
          reason: 'event_stream_unavailable',
          message: 'Runtime result is unconfirmed while the event stream is unavailable.',
        };
      } else if (live) {
        reconcile();
      }
    });
  }

  function request(change: IntelligenceSelectionDraft): boolean {
    if (!options.supportsProtocolMethod(NARS_RUNTIME_INTELLIGENCE_RECONFIGURE_METHOD)) return false;
    if (PENDING_PHASES.has(state.value.phase)) return false;
    const requestId = requestIdFor('intelligence-reconfigure', ++sequence);
    eventFloor = options.events.length;
    const frame = buildIntelligenceReconfigureFrame({
      inferenceProvider: change.inferenceProvider,
      model: change.modelRef ?? change.model,
      requestedOptions: change.thinking ? { thinking: change.thinking } : {},
    }, { id: requestId });
    if (!frame) {
      state.value = { phase: 'failed', requestId, cancelRequestId: null, reason: 'invalid_intelligence_selection', message: 'The selected intelligence configuration is invalid.' };
      return false;
    }
    state.value = { phase: 'dispatching', requestId, cancelRequestId: null, reason: null, message: null };
    const sent = options.send(frame);
    if (!sent) {
      state.value = { ...state.value, phase: 'failed', reason: 'transport_not_open', message: 'The reconfiguration was not sent.' };
      return false;
    }
    void options.refreshHealth?.();
    return true;
  }

  function cancel(): boolean {
    const current = state.value;
    if (!current.requestId || !CANCELLABLE_PHASES.has(current.phase)) return false;
    if (!options.supportsProtocolMethod(INTELLIGENCE_RECONFIGURE_CANCEL_METHOD)) return false;
    const cancelRequestId = requestIdFor('intelligence-reconfigure-cancel', ++sequence);
    const frame = buildIntelligenceReconfigureCancelFrame({ targetRequestId: current.requestId }, { id: cancelRequestId });
    if (!frame) return false;
    state.value = { ...current, phase: 'cancelling', cancelRequestId, reason: null, message: null };
    const sent = options.send(frame);
    if (!sent) {
      state.value = { ...state.value, phase: 'unconfirmed', reason: 'cancel_transport_not_open', message: 'The cancellation was not sent; runtime state is unconfirmed.' };
      return false;
    }
    return true;
  }

  async function refreshState(): Promise<boolean> {
    if (state.value.phase !== 'unconfirmed' || refreshing.value) return false;
    refreshing.value = true;
    try {
      await options.refreshHealth?.();
      reconcileHealth();
      return true;
    } finally {
      refreshing.value = false;
    }
  }

  return {
    state: computed(() => state.value),
    request,
    cancel,
    refreshState,
    isRefreshing: computed(() => refreshing.value),
    isPending: computed(() => PENDING_PHASES.has(state.value.phase)),
    isCancellable: computed(() => CANCELLABLE_PHASES.has(state.value.phase)),
  };
}
