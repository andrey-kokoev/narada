import { nextTick, reactive } from 'vue';
import { describe, expect, it } from 'vitest';
import {
  IDLE_INTELLIGENCE_RECONFIGURATION_STATE,
  reduceIntelligenceReconfigurationEvent,
  useIntelligenceReconfiguration,
} from '../src/app/composables/useIntelligenceReconfiguration';

describe('intelligence reconfiguration control', () => {
  it('tracks a durable request and sends cancellation with a separate request identity', async () => {
    const events = reactive<unknown[]>([]);
    const sent: any[] = [];
    const control = useIntelligenceReconfiguration({
      events,
      send: (frame) => {
        sent.push(frame);
        return true;
      },
      supportsProtocolMethod: (method) => method.startsWith('runtime.intelligence.reconfigure'),
    });

    events.push({ event: 'websocket_error', code: 'stale_transport_error' });
    await nextTick();

    expect(control.request({
      inferenceProvider: 'kimi-code-api',
      model: 'k3',
      modelRef: 'model:k3',
      thinking: 'thinking',
    })).toBe(true);
    expect(control.state.value.phase).toBe('dispatching');
    expect(sent).toHaveLength(1);

    const requestId = sent[0].id;
    events.push({ event: 'runtime_request_state_transition', request_id: requestId, request_state: 'running' });
    await nextTick();
    expect(control.state.value.phase).toBe('accepted');

    expect(control.cancel()).toBe(true);
    expect(sent).toHaveLength(2);
    expect(sent[1].id).not.toBe(requestId);
    expect(sent[1].params.target_request_id).toBe(requestId);
    expect(control.state.value.phase).toBe('cancelling');

    events.push({
      event: 'runtime_intelligence_reconfiguration_cancel',
      request_id: sent[1].id,
      target_request_id: requestId,
      terminal_state: 'cancelled',
    });
    await nextTick();
    expect(control.state.value.phase).toBe('cancelled');
  });

  it('does not treat a switching operation as locally cancellable', () => {
    const pending = {
      ...IDLE_INTELLIGENCE_RECONFIGURATION_STATE,
      phase: 'switching' as const,
      requestId: 'request-1',
    };
    const refused = reduceIntelligenceReconfigurationEvent(pending, {
      event: 'runtime_intelligence_reconfiguration_cancel',
      request_id: 'cancel-1',
      target_request_id: 'request-1',
      terminal_state: 'refused',
      reason: 'reconfiguration_switch_started',
    });
    expect(refused.phase).toBe('refused');
    expect(refused.reason).toBe('reconfiguration_switch_started');
  });

  it('marks a sent request unconfirmed when the event stream becomes unavailable', () => {
    const pending = {
      ...IDLE_INTELLIGENCE_RECONFIGURATION_STATE,
      phase: 'accepted' as const,
      requestId: 'request-1',
    };
    const unconfirmed = reduceIntelligenceReconfigurationEvent(pending, {
      event: 'websocket_error',
      code: 'event_stream_closed',
    });
    expect(unconfirmed.phase).toBe('unconfirmed');
    expect(unconfirmed.reason).toBe('event_stream_closed');
  });
});
