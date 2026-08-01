import { computed, getCurrentInstance, onUnmounted, ref, type Ref } from 'vue';
import type {
  HostFleetClient,
  HostFleetEventConnection,
  HostFleetEventHandlers,
  HostFleetSessionRecord,
  HostFleetSessionsOverview,
  HostFleetTarget,
} from '../adapter';

const SELECTED_HOST_STORAGE_KEY = 'narada.operator-console.host-fleet.selected-host.v1';
const MAX_VISIBLE_EVENTS = 500;
const AGGREGATE_RECONNECT_DELAYS_MS = [250, 500, 1_000] as const;

export type HostFleetStreamState = 'detached' | 'resolving' | 'connecting' | 'connected' | 'closed' | 'refused';
export type HostFleetAggregateStreamState = 'idle' | 'connecting' | 'reconnecting' | 'connected' | 'partial' | 'closed';

export interface HostFleetAggregateEvent {
  hostId: string;
  hostInstanceId: string;
  siteId: string;
  agentId: string;
  runtimeSessionId: string;
  sequence: number | null;
  payload: unknown;
}

export interface UseHostFleetSessionState {
  selectedHostKey: Ref<string | null>;
  selectedSessions: Ref<HostFleetSessionRecord[]>;
  sessionsByHost: Ref<HostFleetSessionsOverview['hosts']>;
  sessionsLoading: Ref<boolean>;
  sessionsError: Ref<string | null>;
  streamState: Ref<HostFleetStreamState>;
  streamMessage: Ref<string | null>;
  attachedTarget: Ref<HostFleetTarget | null>;
  events: Ref<unknown[]>;
  input: Ref<string>;
  selectHost: (hostId: string, hostInstanceId: string) => void;
  refreshSessions: () => Promise<void>;
  attach: (session: HostFleetSessionRecord) => Promise<void>;
  detach: () => void;
  sendInput: () => void;
  aggregateObserving: Ref<boolean>;
  aggregateStreamState: Ref<HostFleetAggregateStreamState>;
  aggregateMessage: Ref<string | null>;
  aggregateEvents: Ref<HostFleetAggregateEvent[]>;
  aggregateCursors: Ref<Record<string, number | null>>;
  startAggregateObservation: () => Promise<void>;
  stopAggregateObservation: () => void;
}

function hostKey(hostId: string, hostInstanceId: string): string {
  return `${hostId}@${hostInstanceId}`;
}

function readSelectedHost(): string | null {
  try { return globalThis.localStorage?.getItem(SELECTED_HOST_STORAGE_KEY) ?? null; }
  catch { return null; }
}

function writeSelectedHost(value: string): void {
  try { globalThis.localStorage?.setItem(SELECTED_HOST_STORAGE_KEY, value); }
  catch { /* Storage is optional; the current page remains usable. */ }
}

export function useHostFleetSession(client: HostFleetClient): UseHostFleetSessionState {
  const selectedHostKey = ref<string | null>(readSelectedHost());
  const sessionsByHost = ref<HostFleetSessionsOverview['hosts']>([]);
  const sessionsLoading = ref(false);
  const sessionsError = ref<string | null>(null);
  const streamState = ref<HostFleetStreamState>('detached');
  const streamMessage = ref<string | null>(null);
  const attachedTarget = ref<HostFleetTarget | null>(null);
  const events = ref<unknown[]>([]);
  const input = ref('');
  let connection: HostFleetEventConnection | null = null;
  const aggregateObserving = ref(false);
  const aggregateStreamState = ref<HostFleetAggregateStreamState>('idle');
  const aggregateMessage = ref<string | null>(null);
  const aggregateEvents = ref<HostFleetAggregateEvent[]>([]);
  const aggregateCursors = ref<Record<string, number | null>>({});
  const aggregateConnections = new Map<string, HostFleetEventConnection>();
  const aggregateReconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const aggregateReconnectAttempts = new Map<string, number>();
  const aggregateConnectedKeys = new Set<string>();
  const aggregateFailedKeys = new Set<string>();
  let aggregateExpectedConnections = 0;
  let aggregateRunId = 0;

  const selectedSessions = computed(() => {
    const selected = sessionsByHost.value.find((host) => hostKey(host.hostId, host.hostInstanceId) === selectedHostKey.value);
    return selected?.sessions ?? [];
  });

  function selectHost(hostId: string, hostInstanceId: string): void {
    selectedHostKey.value = hostKey(hostId, hostInstanceId);
    writeSelectedHost(selectedHostKey.value);
    if (attachedTarget.value && hostKey(attachedTarget.value.hostId, attachedTarget.value.hostInstanceId) !== selectedHostKey.value) detach();
  }

  async function refreshSessions(): Promise<void> {
    sessionsLoading.value = true;
    sessionsError.value = null;
    try {
      const response = await client.sessions();
      sessionsByHost.value = response.hosts;
      if (!selectedHostKey.value || !response.hosts.some((host) => hostKey(host.hostId, host.hostInstanceId) === selectedHostKey.value)) {
        const first = response.hosts[0];
        if (first) selectHost(first.hostId, first.hostInstanceId);
      }
    } catch (cause) {
      sessionsError.value = cause instanceof Error ? cause.message : 'Host Fleet session discovery failed.';
    } finally {
      sessionsLoading.value = false;
    }
  }

  function detach(): void {
    connection?.close();
    connection = null;
    attachedTarget.value = null;
    streamState.value = 'detached';
    streamMessage.value = null;
    input.value = '';
  }

  function appendEvent(event: unknown): void {
    events.value = [...events.value, event].slice(-MAX_VISIBLE_EVENTS);
  }

  function sequenceFromPayload(payload: unknown): number | null {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    const record = payload as Record<string, unknown>;
    const candidate = record.event_sequence ?? record.sequence;
    return typeof candidate === 'number' && Number.isInteger(candidate) && candidate >= 0 ? candidate : null;
  }

  function aggregateConnectionKey(target: HostFleetTarget): string {
    return `${hostKey(target.hostId, target.hostInstanceId)}:${target.runtimeSessionId}`;
  }

  function appendAggregateEvent(target: HostFleetTarget, payload: unknown): void {
    const sequence = sequenceFromPayload(payload);
    const key = aggregateConnectionKey(target);
    if (sequence !== null) {
      const previous = aggregateCursors.value[key];
      if (previous === undefined || previous === null || sequence > previous) {
        aggregateCursors.value = { ...aggregateCursors.value, [key]: sequence };
      }
    }
    aggregateEvents.value = [...aggregateEvents.value, {
      hostId: target.hostId,
      hostInstanceId: target.hostInstanceId,
      siteId: target.siteId,
      agentId: target.agentId,
      runtimeSessionId: target.runtimeSessionId,
      sequence,
      payload,
    }].slice(-MAX_VISIBLE_EVENTS);
  }

  function refreshAggregateStreamState(): void {
    if (!aggregateObserving.value) {
      aggregateStreamState.value = 'idle';
      return;
    }
    const reconnecting = aggregateReconnectTimers.size > 0;
    if (aggregateConnectedKeys.size === aggregateExpectedConnections
      && aggregateFailedKeys.size === 0
      && !reconnecting) {
      aggregateStreamState.value = 'connected';
      aggregateMessage.value = null;
      return;
    }
    if (reconnecting) {
      aggregateStreamState.value = 'reconnecting';
      return;
    }
    if (aggregateConnectedKeys.size > 0) {
      aggregateStreamState.value = 'partial';
      return;
    }
    if (aggregateFailedKeys.size >= aggregateExpectedConnections && aggregateExpectedConnections > 0) {
      aggregateStreamState.value = 'closed';
      return;
    }
    aggregateStreamState.value = 'connecting';
  }

  function stopAggregateObservation(): void {
    aggregateRunId += 1;
    aggregateObserving.value = false;
    for (const timer of aggregateReconnectTimers.values()) clearTimeout(timer);
    aggregateReconnectTimers.clear();
    for (const connection of aggregateConnections.values()) connection.close();
    aggregateConnections.clear();
    aggregateReconnectAttempts.clear();
    aggregateConnectedKeys.clear();
    aggregateFailedKeys.clear();
    aggregateStreamState.value = 'idle';
    aggregateMessage.value = null;
    aggregateExpectedConnections = 0;
  }

  function scheduleAggregateReconnect(target: HostFleetTarget, key: string, runId: number, reason: string): void {
    if (!aggregateObserving.value || runId !== aggregateRunId || aggregateReconnectTimers.has(key)) return;
    aggregateConnectedKeys.delete(key);
    aggregateFailedKeys.delete(key);
    const attempt = (aggregateReconnectAttempts.get(key) ?? 0) + 1;
    const delay = AGGREGATE_RECONNECT_DELAYS_MS[attempt - 1];
    if (delay === undefined) {
      aggregateFailedKeys.add(key);
      aggregateMessage.value = `${key}: ${reason}; reconnect attempts exhausted.`;
      refreshAggregateStreamState();
      return;
    }
    aggregateReconnectAttempts.set(key, attempt);
    aggregateStreamState.value = 'reconnecting';
    aggregateMessage.value = `${key}: ${reason}; reconnecting (attempt ${attempt}/${AGGREGATE_RECONNECT_DELAYS_MS.length}).`;
    const timer = setTimeout(() => {
      aggregateReconnectTimers.delete(key);
      void connectAggregateTarget(target, key, runId);
    }, delay);
    aggregateReconnectTimers.set(key, timer);
  }

  async function connectAggregateTarget(target: HostFleetTarget, key: string, runId: number): Promise<void> {
    if (!aggregateObserving.value || runId !== aggregateRunId) return;
    try {
      const resolution = await client.resolveTarget(target);
      if (runId !== aggregateRunId || !aggregateObserving.value) return;
      if (resolution.status !== 'resolved' || !resolution.target) {
        aggregateFailedKeys.add(key);
        aggregateMessage.value = `${key}: ${resolution.refusal ?? 'runtime_target_refused'}.`;
        refreshAggregateStreamState();
        return;
      }
      const resolvedTarget = resolution.target;
      let openedConnection: HostFleetEventConnection | null = null;
      let opened = false;
      let lossHandled = false;
      const subscribe = (): void => {
        const sinceSequence = aggregateCursors.value[key];
        openedConnection?.send({
          id: `host-fleet-aggregate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          method: 'session.events.subscribe',
          params: {
            include_replay: true,
            max_replay: 100,
            view: 'conversation',
            ...(sinceSequence === undefined || sinceSequence === null ? {} : { since_sequence: sinceSequence }),
          },
        });
      };
      const handleLoss = (message: string): void => {
        if (lossHandled) return;
        lossHandled = true;
        if (aggregateConnections.get(key) === openedConnection) aggregateConnections.delete(key);
        scheduleAggregateReconnect(resolvedTarget, key, runId, message || 'host_fleet_websocket_closed');
      };
      const connection = client.openEvents(resolvedTarget, {
        open: () => {
          if (!aggregateObserving.value || runId !== aggregateRunId) return;
          opened = true;
          aggregateConnectedKeys.add(key);
          aggregateFailedKeys.delete(key);
          aggregateReconnectAttempts.delete(key);
          refreshAggregateStreamState();
          subscribe();
        },
        message: (payload) => appendAggregateEvent(resolvedTarget, payload),
        error: (message) => {
          handleLoss(message);
          openedConnection?.close();
        },
        close: handleLoss,
      });
      openedConnection = connection;
      if (lossHandled || !aggregateObserving.value || runId !== aggregateRunId) {
        connection.close();
        return;
      }
      aggregateConnections.set(key, connection);
      if (opened) subscribe();
      refreshAggregateStreamState();
    } catch (cause) {
      if (!aggregateObserving.value || runId !== aggregateRunId) return;
      scheduleAggregateReconnect(
        target,
        key,
        runId,
        cause instanceof Error ? cause.message : String(cause),
      );
    }
  }

  async function startAggregateObservation(): Promise<void> {
    stopAggregateObservation();
    aggregateObserving.value = true;
    aggregateStreamState.value = 'connecting';
    aggregateMessage.value = null;
    aggregateEvents.value = [];
    const sessions = sessionsByHost.value.flatMap((host) => host.sessions)
      .filter((session) => session.state !== 'closed' && session.healthStatus !== 'revoked');
    aggregateExpectedConnections = sessions.length;
    if (sessions.length === 0) {
      aggregateStreamState.value = 'closed';
      aggregateMessage.value = 'No active host-qualified sessions are available for aggregate observation.';
      return;
    }

    const runId = aggregateRunId;
    await Promise.all(sessions.map(async (session) => {
      const target = session.target;
      const key = aggregateConnectionKey(target);
      await connectAggregateTarget(target, key, runId);
    }));
    refreshAggregateStreamState();
  }

  async function attach(session: HostFleetSessionRecord): Promise<void> {
    detach();
    selectHost(session.target.hostId, session.target.hostInstanceId);
    streamState.value = 'resolving';
    streamMessage.value = null;
    events.value = [];
    try {
      const resolution = await client.resolveTarget(session.target);
      if (resolution.status !== 'resolved' || !resolution.target) {
        streamState.value = 'refused';
        streamMessage.value = resolution.refusal ?? 'Host Fleet refused the selected runtime target.';
        return;
      }
      attachedTarget.value = resolution.target;
      streamState.value = 'connecting';
      const handlers: HostFleetEventHandlers = {
        open: () => {
          streamState.value = 'connected';
          streamMessage.value = null;
          connection?.send({
            id: `host-fleet-subscribe-${Date.now()}`,
            method: 'session.events.subscribe',
            params: { view: 'conversation', include_replay: true, page_size: 100 },
          });
        },
        message: appendEvent,
        error: (message) => {
          streamState.value = 'refused';
          streamMessage.value = message;
        },
        close: (message) => {
          if (streamState.value !== 'refused') streamState.value = 'closed';
          streamMessage.value ??= message;
        },
      };
      connection = client.openEvents(resolution.target, handlers);
    } catch (cause) {
      streamState.value = 'refused';
      streamMessage.value = cause instanceof Error ? cause.message : 'Host Fleet attachment failed.';
    }
  }

  function sendInput(): void {
    const message = input.value.trim();
    if (!message || !connection || streamState.value !== 'connected') return;
    const frame = {
      id: `host-fleet-input-${Date.now()}`,
      method: 'conversation.send',
      params: { message, source: 'operator-console.host-fleet' },
    };
    if (!connection.send(frame)) {
      streamMessage.value = 'The selected host session is no longer connected.';
      streamState.value = 'closed';
      return;
    }
    appendEvent({ event: 'operator_input_submitted', content: message, target: attachedTarget.value });
    input.value = '';
  }

  if (getCurrentInstance()) {
    onUnmounted(() => {
      detach();
      stopAggregateObservation();
    });
  }

  return {
    selectedHostKey,
    selectedSessions,
    sessionsByHost,
    sessionsLoading,
    sessionsError,
    streamState,
    streamMessage,
    attachedTarget,
    events,
    input,
    selectHost,
    refreshSessions,
    attach,
    detach,
    sendInput,
    aggregateObserving,
    aggregateStreamState,
    aggregateMessage,
    aggregateEvents,
    aggregateCursors,
    startAggregateObservation,
    stopAggregateObservation,
  };
}
