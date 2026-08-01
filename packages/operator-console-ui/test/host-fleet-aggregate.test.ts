import assert from 'node:assert/strict';
import test from 'node:test';
import { useHostFleetSession } from '../src/host-fleet/composables/useHostFleetSession';

function session(hostId: string, instanceId: string, runtimeSessionId: string) {
  return {
    target: {
      hostId,
      hostInstanceId: instanceId,
      siteId: 'sonar',
      agentId: 'resident',
      runtimeSessionId,
    },
    state: 'active' as const,
    healthStatus: 'online' as const,
    startedAt: null,
    lastSeenAt: null,
  };
}

test('aggregate host observation fans out exact targets and keeps independent cursors', async () => {
  const handlers = new Map<string, { message?: (payload: unknown) => void; close?: (message: string) => void }>();
  const sent: Array<{ target: string; payload: unknown }> = [];
  const closed: string[] = [];
  const client = {
    resolveTarget: async (target: any) => ({ status: 'resolved' as const, target, session: null, refusal: null }),
    openEvents: (target: any, eventHandlers: { open?: () => void; message?: (payload: unknown) => void }) => {
      const key = `${target.hostId}@${target.hostInstanceId}:${target.runtimeSessionId}`;
      handlers.set(key, eventHandlers);
      const connection = {
        readyState: 1,
        send(payload: unknown) {
          sent.push({ target: key, payload });
          return true;
        },
        close() { closed.push(key); },
      };
      eventHandlers.open?.();
      return connection;
    },
  };
  const state = useHostFleetSession(client as any);
  const first = session('desktop-sunroom-2', 'desktop-instance', 'desktop-session');
  const second = session('zima-board-2', 'zima-instance', 'zima-session');
  state.sessionsByHost.value = [
    { hostId: 'desktop-sunroom-2', hostInstanceId: 'desktop-instance', displayName: 'Desktop', platform: 'windows', lifecycleState: 'active', status: 'success', sessions: [first], refusals: [] },
    { hostId: 'zima-board-2', hostInstanceId: 'zima-instance', displayName: 'Zima', platform: 'linux', lifecycleState: 'active', status: 'success', sessions: [second], refusals: [] },
  ];

  await state.startAggregateObservation();
  assert.equal(state.aggregateStreamState.value, 'connected');
  assert.equal(sent.length, 2);
  assert.equal(sent.every((entry) => (entry.payload as any).params.since_sequence === undefined), true);

  handlers.get('desktop-sunroom-2@desktop-instance:desktop-session')?.message?.({ event_sequence: 4, event: 'desktop' });
  handlers.get('zima-board-2@zima-instance:zima-session')?.message?.({ event_sequence: 2, event: 'zima' });
  assert.deepEqual(state.aggregateCursors.value, {
    'desktop-sunroom-2@desktop-instance:desktop-session': 4,
    'zima-board-2@zima-instance:zima-session': 2,
  });
  assert.deepEqual(
    state.aggregateEvents.value
      .map((event) => [event.hostId, event.sequence])
      .sort(([leftHost], [rightHost]) => String(leftHost).localeCompare(String(rightHost))),
    [
      ['desktop-sunroom-2', 4],
      ['zima-board-2', 2],
    ],
  );

  const desktopKey = 'desktop-sunroom-2@desktop-instance:desktop-session';
  handlers.get(desktopKey)?.close?.('transport_lost');
  assert.equal(state.aggregateStreamState.value, 'reconnecting');
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(state.aggregateStreamState.value, 'connected');
  assert.deepEqual(
    sent.slice(2).map((entry) => ({ target: entry.target, since: (entry.payload as any).params.since_sequence })),
    [{ target: desktopKey, since: 4 }],
  );

  state.stopAggregateObservation();
  sent.length = 0;
  await state.startAggregateObservation();
  const resumed = sent.map((entry) => (entry.payload as any).params.since_sequence).sort((left, right) => left - right);
  assert.deepEqual(resumed, [2, 4]);
  state.stopAggregateObservation();
  assert.deepEqual(closed.sort(), [
    'desktop-sunroom-2@desktop-instance:desktop-session',
    'desktop-sunroom-2@desktop-instance:desktop-session',
    'zima-board-2@zima-instance:zima-session',
    'zima-board-2@zima-instance:zima-session',
  ]);
});
